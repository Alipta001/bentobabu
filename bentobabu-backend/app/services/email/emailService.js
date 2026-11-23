const { ResendProvider } = require('./providers/resendProvider');
const { ZohoProvider } = require('./providers/zohoProvider');

let overriddenProvider = null;
let resendInstance = null;
let zohoInstance = null;

const SUPPORTED_PROVIDERS = ['resend', 'zoho'];

/**
 * Centralized Email Service
 * Dynamically routes transactional emails to Resend or Zoho ZeptoMail
 * based on EMAIL_PROVIDER environment variable.
 */
class EmailService {
  /**
   * Resolves the active provider name ('resend' | 'zoho')
   */
  static getProviderName() {
    if (overriddenProvider) {
      return overriddenProvider;
    }
    const raw = (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
    return raw || 'resend';
  }

  /**
   * Overrides the active provider (primarily for tests)
   */
  static setProvider(name) {
    if (!name) {
      overriddenProvider = null;
      return;
    }
    const clean = String(name).trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(clean)) {
      throw new Error(`Unsupported email provider "${name}". Allowed values: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }
    overriddenProvider = clean;
  }

  /**
   * Resets any temporary provider override
   */
  static resetProvider() {
    overriddenProvider = null;
    resendInstance = null;
    zohoInstance = null;
  }

  /**
   * Returns active provider instance
   */
  static getActiveProvider() {
    const providerName = this.getProviderName();

    switch (providerName) {
      case 'zoho':
        if (!zohoInstance) {
          zohoInstance = new ZohoProvider();
        }
        return zohoInstance;

      case 'resend':
      default:
        if (!resendInstance) {
          resendInstance = new ResendProvider();
        }
        return resendInstance;
    }
  }

  /**
   * Sets custom Resend client for testing
   */
  static setResendClient(client) {
    ResendProvider.setClient(client);
  }

  /**
   * Sets custom nodemailer-like transporter for testing
   */
  static setTransporter(transporter) {
    ResendProvider.setTransporter(transporter);
  }

  /**
   * Sets custom fetch function for Zoho ZeptoMail testing
   */
  static setZeptoMailFetch(fn) {
    ZohoProvider.setCustomFetch(fn);
  }

  /**
   * Sends an email via the active provider
   */
  static async sendEmail({ to, subject, html, text, from }) {
    if (process.env.MOCK_NOTIFICATIONS === 'true') {
      return {
        success: true,
        messageId: `mock_email_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        duration: 1,
        provider: this.getProviderName(),
      };
    }

    const provider = this.getActiveProvider();
    return provider.sendEmail({ to, subject, html, text, from });
  }
}

module.exports = {
  EmailService,
  SUPPORTED_PROVIDERS,
  ResendProvider,
  ZohoProvider,
};
