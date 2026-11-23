let customFetch = undefined;

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
 * Parses email and optional name from string or object
 * e.g. "BentoBabu <verify@bentobabu.com>" -> { address: "verify@bentobabu.com", name: "BentoBabu" }
 */
const parseEmailAndName = (input, defaultName = '') => {
  if (!input) return { address: '', name: defaultName };

  if (typeof input === 'object') {
    return {
      address: (input.address || input.email || '').trim(),
      name: (input.name !== undefined ? input.name : defaultName).trim(),
    };
  }

  const str = String(input).trim();
  const angleMatch = str.match(/^(?:(.*?)<)?([^<>]+)>?$/);
  if (angleMatch) {
    const rawName = (angleMatch[1] || '').trim().replace(/^["']+|["']+$/g, '');
    const rawAddress = (angleMatch[2] || '').trim();
    return {
      address: rawAddress,
      name: rawName || defaultName,
    };
  }

  return {
    address: str,
    name: defaultName,
  };
};

/**
 * Zoho ZeptoMail Transactional Email Provider
 * API Docs: https://www.zoho.com/zeptomail/help/api/email-sending.html
 */
class ZohoProvider {
  constructor(config = {}) {
    this.name = 'zoho';
    this.apiUrl = config.apiUrl || process.env.ZOHO_ZEPTOMAIL_API_URL || 'https://cpaas.zoho.in/v1.1/email';
    this.apiKey = config.apiKey || (
      process.env.ZOHO_ZEPTOMAIL_API_KEY ||
      process.env.ZOHO_ZEPTOMAIL_TOKEN ||
      process.env.ZEPTOMAIL_API_KEY ||
      ''
    ).trim();
    this.fromEmail = config.fromEmail || (process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL || process.env.EMAIL_FROM || 'verify@bentobabu.com').trim();
    this.fromName = config.fromName || (process.env.ZOHO_ZEPTOMAIL_FROM_NAME || 'BentoBabu').trim();
  }

  /**
   * Allows tests or callers to set a custom fetch implementation
   */
  static setCustomFetch(fn) {
    customFetch = fn;
  }

  /**
   * Resolves the active fetch implementation
   */
  getFetch() {
    if (customFetch !== undefined) {
      return customFetch;
    }
    return globalThis.fetch;
  }

  /**
   * Formats authorization header ensuring exact "Zoho-enczapikey <token>" format
   */
  formatAuthHeader(token) {
    if (!token) return '';
    const cleanToken = token.trim();
    if (/^Zoho-enczapikey[:\s]+/i.test(cleanToken)) {
      const actualToken = cleanToken.replace(/^Zoho-enczapikey[:\s]+/i, '').trim();
      return `Zoho-enczapikey ${actualToken}`;
    }
    return `Zoho-enczapikey ${cleanToken}`;
  }

  /**
   * Normalizes recipients into ZeptoMail to array format
   */
  buildRecipients(to) {
    const rawRecipients = Array.isArray(to) ? to : [to];
    const recipients = [];

    for (const item of rawRecipients) {
      if (!item) continue;
      const parsed = parseEmailAndName(item);
      if (parsed.address) {
        const entry = {
          address: parsed.address,
        };
        if (parsed.name) {
          entry.name = parsed.name;
        }
        recipients.push({ email_address: entry });
      }
    }

    return recipients;
  }

  /**
   * Builds the from object for ZeptoMail
   */
  buildSender(from) {
    const activeFromName = (process.env.ZOHO_ZEPTOMAIL_FROM_NAME || this.fromName || 'BentoBabu').trim();
    const activeFromEmail = (process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL || this.fromEmail || 'verify@bentobabu.com').trim();

    if (from) {
      const parsed = parseEmailAndName(from, activeFromName);
      return {
        address: parsed.address || activeFromEmail,
        name: parsed.name || activeFromName,
      };
    }

    const defaultParsed = parseEmailAndName(activeFromEmail, activeFromName);
    return {
      address: defaultParsed.address || 'verify@bentobabu.com',
      name: defaultParsed.name || activeFromName,
    };
  }

  /**
   * Dispatches email via Zoho ZeptoMail HTTPS API
   */
  async sendEmail({ to, subject, html, text, from }) {
    const activeApiKey = (
      process.env.ZOHO_ZEPTOMAIL_API_KEY ||
      process.env.ZOHO_ZEPTOMAIL_TOKEN ||
      process.env.ZEPTOMAIL_API_KEY ||
      this.apiKey ||
      ''
    ).trim();

    if (!activeApiKey) {
      console.warn('[Email][zoho-zeptomail] ZOHO_ZEPTOMAIL_API_KEY is not configured. Email delivery skipped.');
      return {
        success: false,
        skipped: true,
        error: 'Zoho ZeptoMail API key is not configured. Email delivery skipped.',
        provider: 'zoho',
      };
    }

    const recipients = this.buildRecipients(to);
    if (recipients.length === 0) {
      return {
        success: false,
        error: 'No valid recipient email address provided.',
        code: 'INVALID_RECIPIENT',
        provider: 'zoho',
      };
    }

    const sender = this.buildSender(from);
    const startTime = Date.now();
    const primaryRecipient = recipients[0]?.email_address?.address;
    const maskedDestination = maskEmailAddress(primaryRecipient);

    console.log(`[Email][zoho-zeptomail] Request started to: ${maskedDestination}`);

    const payload = {
      from: sender,
      to: recipients,
      subject: subject || '',
      htmlbody: html || '',
    };

    if (text && typeof text === 'string' && text.trim()) {
      payload.textbody = text.trim();
    }

    const timeoutMs = parseInt(process.env.ZOHO_ZEPTOMAIL_TIMEOUT_MS, 10) || 12000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const targetUrl = process.env.ZOHO_ZEPTOMAIL_API_URL || this.apiUrl || 'https://cpaas.zoho.in/v1.1/email';

    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.formatAuthHeader(activeApiKey),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      let responseData;
      const rawText = await response.text();
      try {
        responseData = JSON.parse(rawText);
      } catch {
        responseData = { message: rawText };
      }

      if (response.ok) {
        // Extract accepted message / request ID from ZeptoMail response
        const messageId =
          responseData?.request_id ||
          responseData?.data?.[0]?.message_id ||
          responseData?.data?.[0]?.additional_info?.[0]?.message_id ||
          responseData?.data?.[0]?.code ||
          'zeptomail_accepted';

        console.log(
          `[Email][zoho-zeptomail] Request succeeded in ${duration}ms. Message ID: ${messageId}`
        );

        return {
          success: true,
          messageId,
          duration,
          provider: 'zoho',
        };
      }

      // Handle non-2xx error responses
      let errorMsg = 'ZeptoMail rejected email delivery';
      let errorCode = 'ZeptoMailApiError';

      if (responseData?.error) {
        if (typeof responseData.error === 'string') {
          errorMsg = responseData.error;
        } else if (responseData.error.message) {
          errorMsg = responseData.error.message;
          errorCode = responseData.error.code || errorCode;
        }
      } else if (responseData?.message) {
        errorMsg = responseData.message;
      }

      console.error(
        `[Email][zoho-zeptomail] Request failed in ${duration}ms. Status: ${response.status}, Code: ${errorCode}: ${errorMsg}`
      );

      return {
        success: false,
        error: errorMsg,
        code: errorCode,
        status: response.status,
        duration,
        provider: 'zoho',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const isTimeout = error.name === 'AbortError' || error.code === 'ETIMEDOUT';
      const isNetwork =
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EAI_AGAIN' ||
        error.name === 'TypeError';

      const errCode = isTimeout ? 'TIMEOUT' : isNetwork ? 'NETWORK_ERROR' : (error.name || 'UNKNOWN_ERROR');
      const errorMsg = isTimeout
        ? `ZeptoMail API request timed out after ${timeoutMs}ms`
        : isNetwork
        ? 'Network failure connecting to ZeptoMail API'
        : (error.message || 'ZeptoMail API communication error');

      console.error(
        `[Email][zoho-zeptomail] Request failed in ${duration}ms. Code: ${errCode}: ${errorMsg}`
      );

      return {
        success: false,
        error: errorMsg,
        code: errCode,
        duration,
        provider: 'zoho',
      };
    }
  }
}

module.exports = {
  ZohoProvider,
  parseEmailAndName,
  maskEmailAddress,
};
