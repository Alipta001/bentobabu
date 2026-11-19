const https = require('https');
const { validateEnv } = require('../config/env');

const env = validateEnv();

let customWhatsAppSender = null;

/**
 * Hook for automated tests to mock WhatsApp API calls
 */
const setWhatsAppSender = (sender) => {
  customWhatsAppSender = sender;
};

/**
 * Standard Meta WhatsApp Cloud API template names
 */
const WHATSAPP_TEMPLATE_MAP = {
  ORDER_PLACED: 'bentobabu_order_placed',
  PAYMENT_SUCCESS: 'bentobabu_payment_success',
  PAYMENT_FAILED: 'bentobabu_payment_failed',
  ORDER_CONFIRMED: 'bentobabu_order_confirmed',
  ORDER_PREPARING: 'bentobabu_order_preparing',
  ORDER_READY: 'bentobabu_order_ready',
  ORDER_READY_FOR_DISPATCH: 'bentobabu_order_ready',
  DELIVERY_REQUEST_AVAILABLE: 'bentobabu_delivery_request_available',
  RIDER_ACCEPTED: 'bentobabu_rider_accepted',
  OUT_FOR_DELIVERY: 'bentobabu_out_for_delivery',
  ORDER_DELIVERED: 'bentobabu_order_delivered',
  ORDER_CANCELLED: 'bentobabu_order_cancelled',
  ORDER_EXPIRED: 'bentobabu_order_expired',
};

/**
 * Formats Indian phone number to WhatsApp international standard (e.g. 919876543210)
 */
const formatWhatsAppRecipient = (phone) => {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
};

/**
 * Builds Meta WhatsApp Cloud API template payload
 */
const buildWhatsAppTemplatePayload = (to, templateName, components = []) => {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: 'en',
      },
      components,
    },
  };
};

/**
 * Sends WhatsApp message via Meta Cloud API
 */
const sendWhatsApp = async ({ toPhone, eventType, parameters = [] }) => {
  if (customWhatsAppSender) {
    return await customWhatsAppSender({ toPhone, eventType, parameters });
  }

  if (!env.whatsappEnabled) {
    return {
      success: false,
      skipped: true,
      error: 'WhatsApp integration is disabled (WHATSAPP_ENABLED is false).',
    };
  }

  if (!env.whatsappPhoneNumberId || !env.whatsappAccessToken) {
    return {
      success: false,
      skipped: true,
      error: 'WhatsApp credentials (phone number ID or access token) are missing.',
    };
  }

  const formattedRecipient = formatWhatsAppRecipient(toPhone);
  if (!formattedRecipient) {
    return {
      success: false,
      error: `Invalid phone number for WhatsApp: "${toPhone}". Must be a valid 10-digit Indian mobile.`,
    };
  }

  const templateName = WHATSAPP_TEMPLATE_MAP[eventType];
  if (!templateName) {
    return {
      success: false,
      error: `No approved WhatsApp template mapped for event: "${eventType}".`,
    };
  }

  const components = [];
  if (parameters && parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters.map((val) => ({
        type: 'text',
        text: String(val),
      })),
    });
  }

  const payload = buildWhatsAppTemplatePayload(formattedRecipient, templateName, components);
  const postData = JSON.stringify(payload);

  const apiPath = `/${env.whatsappApiVersion}/${env.whatsappPhoneNumberId}/messages`;

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'graph.facebook.com',
        port: 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: `Bearer ${env.whatsappAccessToken}`,
        },
        timeout: 10000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = { raw: rawData };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const messageId = parsed.messages && parsed.messages[0]?.id;
            resolve({
              success: true,
              messageId: messageId || `wa_${Date.now()}`,
              response: parsed,
            });
          } else {
            const errorMsg = parsed.error?.message || `WhatsApp API error (status ${res.statusCode})`;
            resolve({
              success: false,
              error: errorMsg,
              statusCode: res.statusCode,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message || 'Network error communicating with WhatsApp Cloud API',
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Timeout connecting to WhatsApp Cloud API',
      });
    });

    req.write(postData);
    req.end();
  });
};

module.exports = {
  setWhatsAppSender,
  formatWhatsAppRecipient,
  WHATSAPP_TEMPLATE_MAP,
  sendWhatsApp,
};

