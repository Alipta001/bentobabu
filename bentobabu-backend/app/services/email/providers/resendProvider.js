const { Resend } = require('resend');
const { validateEnv } = require('../../../config/env');

let customResendClient = undefined;

/**
 * Safely masks an email address for diagnostic logging
 */
const maskEmailAddress = (email) => {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  const maskedLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
};

/**
 * Resend Transactional Email Provider
 */
class ResendProvider {
  constructor(config = {}) {
    this.name = 'resend';
    this.apiKey = config.apiKey || (process.env.RESEND_API_KEY || '').trim();
    this.fromEmail = config.fromEmail || process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'BentoBabu <verify@bentobabu.com>';
  }

  /**
   * Allows tests or callers to set a custom/mock client
   */
  static setClient(client) {
    customResendClient = client;
  }

  /**
   * Backward compatibility: Allows tests supplying a mock nodemailer-like transporter
   */
  static setTransporter(transporter) {
    if (!transporter) {
      customResendClient = undefined;
      return;
    }
    if (typeof transporter.sendMail === 'function') {
      customResendClient = {
        emails: {
          send: async ({ from, to, subject, html, text }) => {
            try {
              const info = await transporter.sendMail({ from, to, subject, html, text });
              return { data: { id: info?.messageId || 'mock_msg_id' }, error: null };
            } catch (err) {
              return { data: null, error: { message: err.message, name: err.name || 'Error' } };
            }
          },
        },
      };
    } else {
      customResendClient = transporter;
    }
  }

  /**
   * Returns active Resend client
   */
  getClient() {
    if (customResendClient !== undefined) {
      return customResendClient;
    }

    const apiKey = this.apiKey || (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
      return null;
    }

    return new Resend(apiKey);
  }

  /**
   * Dispatches email via Resend API
   */
  async sendEmail({ to, subject, html, text, from }) {
    const client = this.getClient();

    if (!client) {
      console.warn('[Email][resend-api] RESEND_API_KEY is not configured. Email delivery skipped.');
      return {
        success: false,
        skipped: true,
        error: 'Resend API key is not configured. Email delivery skipped.',
        provider: 'resend',
      };
    }

    const startTime = Date.now();
    const recipient = Array.isArray(to) ? to[0] : to;
    const maskedDestination = maskEmailAddress(recipient);

    console.log(`[Email][resend-api] Request started to: ${maskedDestination}`);

    try {
      const timeoutMs = parseInt(process.env.RESEND_TIMEOUT_MS, 10) || 12000;

      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutErr = new Error(`Resend API request timed out after ${timeoutMs}ms`);
          timeoutErr.name = 'TimeoutError';
          timeoutErr.code = 'ETIMEDOUT';
          reject(timeoutErr);
        }, timeoutMs);
      });

      const effectiveFrom = from || this.fromEmail || process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'BentoBabu <verify@bentobabu.com>';

      const sendPromise = client.emails.send({
        from: effectiveFrom,
        to,
        subject,
        html,
        text,
      });

      const result = await Promise.race([sendPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Resend SDK returns { data, error }
      if (result && result.error) {
        const err = result.error;
        const status = err.statusCode || err.status || 400;
        const errCode = err.name || 'ResendApiError';
        console.error(
          `[Email][resend-api] Request failed in ${duration}ms. Status: ${status}, Code: ${errCode}: ${err.message}`
        );
        return {
          success: false,
          error: err.message || 'Resend API rejected email delivery',
          status,
          code: errCode,
          duration,
          provider: 'resend',
        };
      }

      if (result && result.data && result.data.id) {
        console.log(
          `[Email][resend-api] Request succeeded in ${duration}ms. Message ID: ${result.data.id}`
        );
        return {
          success: true,
          messageId: result.data.id,
          duration,
          provider: 'resend',
        };
      }

      console.warn(`[Email][resend-api] Request failed in ${duration}ms. Missing message ID in response.`);
      return {
        success: false,
        error: 'No message ID returned from Resend API',
        duration,
        provider: 'resend',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = error.code === 'ETIMEDOUT' || error.name === 'TimeoutError';
      const isNetwork =
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EAI_AGAIN';
      const errCode = isTimeout ? 'TIMEOUT' : isNetwork ? 'NETWORK_ERROR' : (error.name || 'UNKNOWN_ERROR');

      console.error(
        `[Email][resend-api] Request failed in ${duration}ms. Code: ${errCode}: ${error.message}`
      );

      return {
        success: false,
        error: isTimeout
          ? 'Resend API request timed out'
          : isNetwork
          ? 'Network failure connecting to Resend API'
          : (error.message || 'Resend API communication error'),
        code: errCode,
        duration,
        provider: 'resend',
      };
    }
  }
}

module.exports = {
  ResendProvider,
  maskEmailAddress,
};
