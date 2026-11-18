const { Resend } = require('resend');
const { validateEnv } = require('../config/env');

let customResendClient = undefined;

/**
 * Allows tests to supply a mock Resend client
 */
const setResendClient = (client) => {
  customResendClient = client;
};

/**
 * Backward compatibility: Allows tests or legacy callers supplying a mock transporter
 */
const setTransporter = (transporter) => {
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
};

/**
 * Returns active Resend client
 */
const getResendClient = () => {
  if (customResendClient !== undefined) {
    return customResendClient;
  }

  const activeEnv = validateEnv();
  if (!activeEnv.resendApiKey) {
    return null;
  }

  return new Resend(activeEnv.resendApiKey);
};

/**
 * Backward compatibility alias for getResendClient
 */
const getTransporter = () => getResendClient();

/**
 * Formats order items list into an HTML table
 */
const renderItemsTable = (items = []) => {
  if (!items || items.length === 0) return '';

  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #333333;">${
          item.productName || item.name || 'Bento Item'
        }</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; text-align: center; color: #555555;">x${
          item.quantity
        }</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; text-align: right; color: #333333; font-weight: 600;">₹${
          item.subtotal || item.unitPrice * item.quantity
        }</td>
      </tr>`
    )
    .join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 16px; background-color: #fafafa; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f3f4f6; text-align: left;">
          <th style="padding: 10px 12px; font-size: 12px; color: #6b7280; text-transform: uppercase;">Item</th>
          <th style="padding: 10px 12px; font-size: 12px; color: #6b7280; text-transform: uppercase; text-align: center;">Qty</th>
          <th style="padding: 10px 12px; font-size: 12px; color: #6b7280; text-transform: uppercase; text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
};

/**
 * Base email layout wrapper
 */
const buildEmailLayout = ({ title, preheader, content, orderNumber, grandTotal, customerName }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; color: transparent;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6f8; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #166534; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; letter-spacing: 0.5px; font-weight: 700;">🍱 BentoBabu</h1>
              <p style="margin: 4px 0 0 0; color: #bbf7d0; font-size: 13px;">Healthy, Fresh & Nutritious Bento Delivery</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #111827; font-weight: 600;">${title}</h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.5;">
                Hello <strong>${customerName || 'Valued Customer'}</strong>,
              </p>
              ${content}
              ${
                orderNumber
                  ? `<div style="background-color: #f9fafb; border-left: 4px solid #166534; padding: 12px 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                      <p style="margin: 0; font-size: 13px; color: #6b7280;">Order Reference</p>
                      <p style="margin: 2px 0 0 0; font-size: 16px; font-weight: 600; color: #111827;">#${orderNumber}</p>
                      ${
                        grandTotal !== undefined && grandTotal !== null
                          ? `<p style="margin: 4px 0 0 0; font-size: 14px; color: #374151;">Total: <strong>₹${grandTotal}</strong></p>`
                          : ''
                      }
                    </div>`
                  : ''
              }
              <p style="margin: 24px 0 0 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                Thank you for choosing BentoBabu for your nutritious meals.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                Have questions or need assistance? We're here to help!
              </p>
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 500;">
                <a href="mailto:bentobabuofficial@gmail.com" style="color: #166534; text-decoration: none;">bentobabuofficial@gmail.com</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Barrackpore, Kolkata, West Bengal, India &bull; &copy; ${new Date().getFullYear()} BentoBabu
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Returns structured email template by event type
 */
const getEmailTemplate = (eventType, data = {}) => {
  const {
    orderNumber = '',
    grandTotal = null,
    customerName = 'Customer',
    items = [],
    deliveryAddress = null,
    reason = '',
    ticketNumber = '',
    subject: ticketSubject = '',
    messagePreview = '',
    status = '',
    resolutionNote = '',
  } = data;

  const itemsHtml = renderItemsTable(items);

  let title = 'Order Notification';
  let preheader = 'Update from BentoBabu';
  let content = '';

  switch (eventType) {
    case 'ORDER_PLACED':
      title = 'Order Received Confirmation';
      preheader = `We received your BentoBabu order #${orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          We have received your order <strong>#${orderNumber}</strong>. Our kitchen team is reviewing it and we will begin preparing your fresh meals shortly.
        </p>
        ${itemsHtml}`;
      break;

    case 'PAYMENT_SUCCESS':
      title = 'Payment Received Successfully';
      preheader = `Payment for order #${orderNumber} has been successfully verified.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Great news! Your payment of <strong>₹${grandTotal}</strong> for order <strong>#${orderNumber}</strong> has been successfully processed.
        </p>
        <p style="font-size: 14px; color: #059669; font-weight: 600; margin: 0 0 12px 0;">
          Payment Status: PAID
        </p>
        ${itemsHtml}`;
      break;

    case 'PAYMENT_FAILED':
      title = 'Payment Attempt Unsuccessful';
      preheader = `Payment failed for order #${orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #dc2626; margin: 0 0 12px 0; font-weight: 500;">
          We were unable to complete the payment for your order <strong>#${orderNumber}</strong>.
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Please retry payment from your orders page or select an alternative payment method before your checkout window expires.
        </p>`;
      break;

    case 'ORDER_CONFIRMED':
      title = 'Your BentoBabu Order is Confirmed';
      preheader = `Order #${orderNumber} is confirmed and queued for the kitchen.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Your order <strong>#${orderNumber}</strong> has been verified and confirmed! Our chefs are preparing to craft your healthy bento boxes.
        </p>
        ${itemsHtml}`;
      break;

    case 'ORDER_PREPARING':
      title = 'Kitchen is Preparing Your Bento';
      preheader = `Chef is preparing order #${orderNumber} with fresh ingredients.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Our kitchen has started cooking your order <strong>#${orderNumber}</strong> using fresh, healthy, and hygienic ingredients.
        </p>`;
      break;

    case 'ORDER_READY':
      title = 'Your Order is Packed & Ready';
      preheader = `Order #${orderNumber} is boxed and awaiting pickup by delivery partner.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Your bento box for order <strong>#${orderNumber}</strong> is freshly packed and waiting for delivery partner pickup.
        </p>`;
      break;

    case 'OUT_FOR_DELIVERY':
      title = 'Your Bento is Out for Delivery! 🛵';
      preheader = `Rider is on the way with your order #${orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Your delivery partner has picked up order <strong>#${orderNumber}</strong> and is heading toward your address.
        </p>
        ${
          deliveryAddress
            ? `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin: 16px 0;">
                <p style="margin: 0 0 4px 0; font-size: 12px; color: #166534; font-weight: 600; text-transform: uppercase;">Delivery Address</p>
                <p style="margin: 0; font-size: 14px; color: #1f2937;">${deliveryAddress.addressLine || ''}, ${deliveryAddress.city || 'Barrackpore'} - ${deliveryAddress.pincode || ''}</p>
              </div>`
            : ''
        }
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px 0;">
          Please share your one-time delivery OTP with the delivery partner upon arrival to complete contactless verification.
        </p>`;
      break;

    case 'ORDER_DELIVERED':
      title = 'Order Delivered — Bon Appétit! 🎉';
      preheader = `Order #${orderNumber} has been delivered successfully.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Your order <strong>#${orderNumber}</strong> has been successfully delivered. We hope you enjoy your nutritious meal!
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          We would love to hear your feedback on your bento experience today.
        </p>`;
      break;

    case 'ORDER_CANCELLED':
      title = 'Order Cancellation Notice';
      preheader = `Order #${orderNumber} has been cancelled.`;
      content = `
        <p style="font-size: 15px; color: #dc2626; margin: 0 0 12px 0;">
          Your order <strong>#${orderNumber}</strong> has been cancelled.
        </p>
        ${
          reason
            ? `<p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">Reason: <em>${reason}</em></p>`
            : ''
        }
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Any reserved items have been restored. If you have questions or require support, please contact us.
        </p>`;
      break;

    case 'ORDER_EXPIRED':
      title = 'Unpaid Order Expired';
      preheader = `Payment window for order #${orderNumber} expired.`;
      content = `
        <p style="font-size: 15px; color: #4b5563; margin: 0 0 12px 0;">
          The payment window for order <strong>#${orderNumber}</strong> has timed out without payment confirmation.
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Your order has been safely cancelled and stock has been released. Feel free to place a new order whenever you're ready!
        </p>`;
      break;

    case 'ORDER_REASSIGNED':
      title = 'Delivery Partner Updated';
      preheader = `A new delivery partner has been assigned to order #${orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #4b5563; margin: 0 0 12px 0;">
          A new delivery partner has been assigned to your order <strong>#${orderNumber}</strong>.
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Your order is on its way. You can track your updated delivery status in the BentoBabu app.
        </p>`;
      break;

    case 'DELIVERY_ASSIGNMENT':
      title = 'New Delivery Assignment';
      preheader = `You have been assigned order #${orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #4b5563; margin: 0 0 12px 0;">
          You have been assigned order <strong>#${orderNumber}</strong>.
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Please open your delivery partner dashboard to review order details and proceed with the delivery.
        </p>`;
      break;

    case 'SUPPORT_TICKET_CREATED':
      title = 'Support Request Received';
      preheader = `We have received your ticket #${ticketNumber || orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          Thank you for reaching out to BentoBabu Support. Your request <strong>#${ticketNumber || orderNumber}</strong> (${ticketSubject || 'Support Ticket'}) has been safely logged.
        </p>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          Our customer happiness team will review your inquiry and get back to you shortly. You can track this ticket anytime from your support dashboard.
        </p>`;
      break;

    case 'SUPPORT_TICKET_REPLIED':
      title = 'New Message on Your Support Ticket';
      preheader = `Support staff replied to ticket #${ticketNumber || orderNumber}.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          A support executive has replied to your ticket <strong>#${ticketNumber || orderNumber}</strong>:
        </p>
        <div style="background-color: #f9fafb; border-left: 4px solid #C86D51; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #1f2937; line-height: 1.5;">${messagePreview || 'New message received.'}</p>
        </div>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0;">
          To respond, simply visit your BentoBabu Support Centre.
        </p>`;
      break;

    case 'SUPPORT_TICKET_STATUS_UPDATED':
      title = `Ticket #${ticketNumber || orderNumber} Status Update`;
      preheader = `Your ticket status is now ${status || 'Updated'}.`;
      content = `
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px 0;">
          The status of your support ticket <strong>#${ticketNumber || orderNumber}</strong> has been updated to:
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; background: #e5e7eb; font-weight: bold; font-size: 12px; margin-left: 4px;">${status || 'Updated'}</span>
        </p>
        ${
          resolutionNote
            ? `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin: 16px 0;">
                <p style="margin: 0 0 4px 0; font-size: 12px; color: #166534; font-weight: 600;">Resolution Note</p>
                <p style="margin: 0; font-size: 14px; color: #1f2937;">${resolutionNote}</p>
              </div>`
            : ''
        }`;
      break;

    default:
      title = 'BentoBabu Order Update';
      content = `<p style="font-size: 15px; color: #374151;">There is an update on your order #${orderNumber}.</p>`;
      break;
  }

  const html = buildEmailLayout({
    title,
    preheader,
    content,
    orderNumber,
    grandTotal,
    customerName,
  });

  const text = `${title}\n\nHello ${customerName},\n\nOrder: #${orderNumber}\n${preheader}\n\nFor support, email bentobabuofficial@gmail.com\nBentoBabu`;

  return {
    subject: `🍱 BentoBabu: ${title} (#${orderNumber || 'Bento'})`,
    html,
    text,
  };
};

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
 * Dispatches an email notification via Resend HTTPS API
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  const activeEnv = validateEnv();

  if (!client) {
    console.warn('[Email][resend-api] RESEND_API_KEY is not configured. Email delivery skipped.');
    return {
      success: false,
      skipped: true,
      error: 'Resend API key is not configured. Email delivery skipped.',
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

    const sendPromise = client.emails.send({
      from: activeEnv.emailFrom,
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
      };
    }

    console.warn(`[Email][resend-api] Request failed in ${duration}ms. Missing message ID in response.`);
    return {
      success: false,
      error: 'No message ID returned from Resend API',
      duration,
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
    };
  }
};

/**
 * Sends a responsive, branded Signup Verification OTP email
 */
const sendSignupOtpEmail = async ({ to, name, otp, expiryMinutes = 5 }) => {
  const title = 'Verify Your BentoBabu Account';
  const preheader = `Your BentoBabu verification code is ${otp}. Valid for ${expiryMinutes} minutes.`;
  const customerName = name || 'Valued Customer';

  const content = `
    <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0; line-height: 1.5;">
      Welcome to <strong>BentoBabu</strong>! Thank you for starting your registration. To complete your account verification, please enter the one-time verification code below:
    </p>
    <div style="background-color: #F7F3EA; border: 2px dashed #354B35; border-radius: 8px; padding: 24px 16px; text-align: center; margin: 24px 0;">
      <span style="font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #166534; font-family: 'Courier New', Courier, monospace; display: inline-block;">${otp}</span>
      <p style="margin: 10px 0 0 0; font-size: 13px; color: #4b5563; font-weight: 500;">
        This code expires in <strong>${expiryMinutes} minutes</strong>
      </p>
    </div>
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 600;">
        ⚠️ Security Notice
      </p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #b45309; line-height: 1.4;">
        Never share this verification code with anyone, including anyone claiming to be BentoBabu support. Our team will never ask for your code.
      </p>
    </div>`;

  const html = buildEmailLayout({
    title,
    preheader,
    content,
    customerName,
  });

  const text = `Verify Your BentoBabu Account\n\nHello ${customerName},\n\nYour BentoBabu verification code is: ${otp}\nThis code is valid for ${expiryMinutes} minutes.\n\nSECURITY NOTICE: Never share this code with anyone.\n\nBentoBabu - Healthy, Fresh & Nutritious Bento Delivery`;

  return sendEmail({
    to,
    subject: `🍱 Your BentoBabu Verification Code: ${otp}`,
    html,
    text,
  });
};

module.exports = {
  setResendClient,
  setTransporter,
  getResendClient,
  getTransporter,
  getEmailTemplate,
  sendEmail,
  sendSignupOtpEmail,
};
