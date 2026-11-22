process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const { validateEnv } = require('../app/config/env');
const {
  EmailService,
  ResendProvider,
  ZohoProvider,
} = require('../app/services/email/emailService');
const {
  sendEmail,
  sendSignupOtpEmail,
  sendPasswordResetEmail,
  getEmailTemplate,
  setResendClient,
  setTransporter,
  setZeptoMailFetch,
} = require('../app/utils/email');

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Configurable Email Provider (Resend + ZeptoMail) Test Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  const originalEnv = { ...process.env };

  const restoreEnv = () => {
    process.env = { ...originalEnv };
    EmailService.resetProvider();
    setResendClient(undefined);
    setZeptoMailFetch(undefined);
  };

  async function test(title, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${title}`);
      console.error('    Error:', err.message);
      if (err.stack) {
        console.error('    ' + err.stack.split('\n').slice(1, 4).join('\n    '));
      }
      failed++;
    } finally {
      restoreEnv();
    }
  }

  // -------------------------------------------------------------------------
  // Test 1: EMAIL_PROVIDER=resend sends emails through Resend
  // -------------------------------------------------------------------------
  await test('Test 1: EMAIL_PROVIDER=resend dispatches via Resend provider', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    let resendPayload = null;

    setResendClient({
      emails: {
        send: async (payload) => {
          resendPayload = payload;
          return { data: { id: 'resend_msg_test_1' }, error: null };
        },
      },
    });

    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Welcome to BentoBabu',
      html: '<h1>Hello BentoBabu</h1>',
      text: 'Hello BentoBabu',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, 'resend_msg_test_1');
    assert.strictEqual(res.provider, 'resend');
    assert.ok(resendPayload);
    assert.strictEqual(resendPayload.to, 'customer@example.com');
    assert.strictEqual(resendPayload.subject, 'Welcome to BentoBabu');
    assert.strictEqual(resendPayload.html, '<h1>Hello BentoBabu</h1>');
  });

  // -------------------------------------------------------------------------
  // Test 2: EMAIL_PROVIDER=zoho sends emails through ZeptoMail
  // -------------------------------------------------------------------------
  await test('Test 2: EMAIL_PROVIDER=zoho dispatches via Zoho ZeptoMail API with required headers & body', async () => {
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'phl098testtoken';
    process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL = 'verify@bentobabu.com';
    process.env.ZOHO_ZEPTOMAIL_FROM_NAME = 'BentoBabu Team';

    let capturedUrl = null;
    let capturedOptions = null;

    setZeptoMailFetch(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{ code: 'EM_104', message: 'Email request accepted successfully' }],
          message: 'Email request accepted successfully',
          request_id: 'zeptomail_req_test_2',
        }),
      };
    });

    const res = await sendEmail({
      to: 'Arjun Verma <arjun@example.com>',
      subject: 'Your Bento Order',
      html: '<p>Delicious Bento inside</p>',
      text: 'Delicious Bento inside',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, 'zeptomail_req_test_2');
    assert.strictEqual(res.provider, 'zoho');

    // Verify endpoint
    assert.strictEqual(capturedUrl, 'https://api.zeptomail.com/v1.1/email');
    assert.strictEqual(capturedOptions.method, 'POST');

    // Verify headers
    const headers = capturedOptions.headers;
    assert.strictEqual(headers['Authorization'], 'Zoho-enczapikey phl098testtoken');
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers['Accept'], 'application/json');

    // Verify payload body
    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.from.address, 'verify@bentobabu.com');
    assert.strictEqual(body.from.name, 'BentoBabu Team');
    assert.strictEqual(body.subject, 'Your Bento Order');
    assert.strictEqual(body.htmlbody, '<p>Delicious Bento inside</p>');
    assert.strictEqual(body.textbody, 'Delicious Bento inside');
    assert.strictEqual(body.to.length, 1);
    assert.strictEqual(body.to[0].email_address.address, 'arjun@example.com');
    assert.strictEqual(body.to[0].email_address.name, 'Arjun Verma');
  });

  // -------------------------------------------------------------------------
  // Test 3: Existing Resend workflows & mocks continue working (setTransporter / setResendClient)
  // -------------------------------------------------------------------------
  await test('Test 3: Backward compatibility with legacy setTransporter and setResendClient', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    let transporterCall = null;

    setTransporter({
      sendMail: async (opts) => {
        transporterCall = opts;
        return { messageId: 'legacy_transporter_id_123' };
      },
    });

    const res = await sendEmail({
      to: 'legacy@example.com',
      subject: 'Legacy Transporter Test',
      html: '<p>Legacy HTML</p>',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, 'legacy_transporter_id_123');
    assert.strictEqual(res.provider, 'resend');
    assert.ok(transporterCall);
    assert.strictEqual(transporterCall.to, 'legacy@example.com');
    assert.strictEqual(transporterCall.subject, 'Legacy Transporter Test');
  });

  // -------------------------------------------------------------------------
  // Test 4: OTP emails work with both providers
  // -------------------------------------------------------------------------
  await test('Test 4: sendSignupOtpEmail works seamlessly with both Resend and ZeptoMail', async () => {
    // 4a. Resend
    process.env.EMAIL_PROVIDER = 'resend';
    let resendOtpPayload = null;
    setResendClient({
      emails: {
        send: async (p) => {
          resendOtpPayload = p;
          return { data: { id: 'otp_resend_999' }, error: null };
        },
      },
    });

    const resendOtpRes = await sendSignupOtpEmail({
      to: 'rahul@example.com',
      name: 'Rahul Sharma',
      otp: '782910',
      expiryMinutes: 5,
    });

    assert.strictEqual(resendOtpRes.success, true);
    assert.strictEqual(resendOtpRes.messageId, 'otp_resend_999');
    assert.ok(resendOtpPayload.html.includes('782910'));
    assert.ok(resendOtpPayload.subject.includes('782910'));

    // 4b. Zoho ZeptoMail
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'phl_test_key';
    process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL = 'verify@bentobabu.com';

    let zohoOtpBody = null;
    setZeptoMailFetch(async (url, options) => {
      zohoOtpBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ request_id: 'otp_zoho_888' }),
      };
    });

    const zohoOtpRes = await sendSignupOtpEmail({
      to: 'priya@example.com',
      name: 'Priya Sen',
      otp: '456123',
      expiryMinutes: 5,
    });

    assert.strictEqual(zohoOtpRes.success, true);
    assert.strictEqual(zohoOtpRes.messageId, 'otp_zoho_888');
    assert.ok(zohoOtpBody);
    assert.strictEqual(zohoOtpBody.to[0].email_address.address, 'priya@example.com');
    assert.ok(zohoOtpBody.htmlbody.includes('456123'));
    assert.ok(zohoOtpBody.subject.includes('456123'));
  });

  // -------------------------------------------------------------------------
  // Test 5: Password reset emails work with both providers
  // -------------------------------------------------------------------------
  await test('Test 5: sendPasswordResetEmail works with both Resend and ZeptoMail', async () => {
    // 5a. Resend
    process.env.EMAIL_PROVIDER = 'resend';
    let resendResetPayload = null;
    setResendClient({
      emails: {
        send: async (p) => {
          resendResetPayload = p;
          return { data: { id: 'pwd_resend_1' }, error: null };
        },
      },
    });

    const resendRes = await sendPasswordResetEmail({
      to: 'user@example.com',
      name: 'User One',
      resetUrl: 'https://bentobabu.com/reset-password?token=abc123resend',
      expiryMinutes: 15,
    });

    assert.strictEqual(resendRes.success, true);
    assert.ok(resendResetPayload.html.includes('https://bentobabu.com/reset-password?token=abc123resend'));
    assert.ok(resendResetPayload.subject.includes('Reset Your BentoBabu Password'));

    // 5b. Zoho ZeptoMail
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'phl_test_pwd';
    process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL = 'verify@bentobabu.com';

    let zohoResetBody = null;
    setZeptoMailFetch(async (url, options) => {
      zohoResetBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ request_id: 'pwd_zoho_2' }),
      };
    });

    const zohoRes = await sendPasswordResetEmail({
      to: 'user2@example.com',
      name: 'User Two',
      resetUrl: 'https://bentobabu.com/reset-password?token=xyz789zoho',
      expiryMinutes: 30,
    });

    assert.strictEqual(zohoRes.success, true);
    assert.ok(zohoResetBody.htmlbody.includes('https://bentobabu.com/reset-password?token=xyz789zoho'));
    assert.strictEqual(zohoResetBody.to[0].email_address.address, 'user2@example.com');
  });

  // -------------------------------------------------------------------------
  // Test 6: Existing order notification templates work with both providers
  // -------------------------------------------------------------------------
  await test('Test 6: Order notification templates (ORDER_PLACED, ORDER_DELIVERED) work with both providers', async () => {
    const orderData = {
      orderNumber: 'BB-TEST-7788',
      grandTotal: 599,
      customerName: 'Ananya Roy',
      items: [
        { productName: 'Nutritious Quinoa Bento', quantity: 2, subtotal: 598 },
      ],
    };

    const template = getEmailTemplate('ORDER_PLACED', orderData);
    assert.ok(template.subject.includes('BB-TEST-7788'));
    assert.ok(template.html.includes('Nutritious Quinoa Bento'));

    // 6a. Send via Resend
    process.env.EMAIL_PROVIDER = 'resend';
    setResendClient({
      emails: {
        send: async () => ({ data: { id: 'order_resend_ok' }, error: null }),
      },
    });

    const resendOrderRes = await sendEmail({
      to: 'ananya@example.com',
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    assert.strictEqual(resendOrderRes.success, true);
    assert.strictEqual(resendOrderRes.messageId, 'order_resend_ok');

    // 6b. Send via Zoho
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'phl_test_order';
    process.env.ZOHO_ZEPTOMAIL_FROM_EMAIL = 'orders@bentobabu.com';

    let capturedZohoOrder = null;
    setZeptoMailFetch(async (url, options) => {
      capturedZohoOrder = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ request_id: 'order_zoho_ok' }),
      };
    });

    const zohoOrderRes = await sendEmail({
      to: 'ananya@example.com',
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    assert.strictEqual(zohoOrderRes.success, true);
    assert.strictEqual(zohoOrderRes.messageId, 'order_zoho_ok');
    assert.ok(capturedZohoOrder.htmlbody.includes('Nutritious Quinoa Bento'));
  });

  // -------------------------------------------------------------------------
  // Test 7: Invalid provider names produce a clear startup error
  // -------------------------------------------------------------------------
  await test('Test 7: validateEnv throws clear error on unsupported EMAIL_PROVIDER', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    assert.throws(
      () => {
        validateEnv();
      },
      (err) => {
        return (
          err.message.includes('Invalid email configuration') &&
          err.message.includes('Unsupported EMAIL_PROVIDER "sendgrid"') &&
          err.message.includes('resend, zoho')
        );
      },
      'Should reject unsupported provider'
    );
  });

  // -------------------------------------------------------------------------
  // Test 8: Missing credentials for selected provider produce clear configuration error
  // -------------------------------------------------------------------------
  await test('Test 8: Missing RESEND_API_KEY throws when EMAIL_PROVIDER=resend and email OTP is enabled', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.OTP_EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = '';

    assert.throws(
      () => {
        validateEnv();
      },
      (err) => {
        return (
          err.message.includes('Missing required RESEND_API_KEY environment variable') &&
          err.message.includes('EMAIL_PROVIDER is "resend"')
        );
      },
      'Should throw missing RESEND_API_KEY error'
    );
  });

  await test('Test 8b: Missing ZOHO_ZEPTOMAIL_API_KEY throws when EMAIL_PROVIDER=zoho and email OTP is enabled', async () => {
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.OTP_EMAIL_ENABLED = 'true';
    delete process.env.ZOHO_ZEPTOMAIL_API_KEY;
    delete process.env.ZOHO_ZEPTOMAIL_TOKEN;
    delete process.env.ZEPTOMAIL_API_KEY;

    assert.throws(
      () => {
        validateEnv();
      },
      (err) => {
        return (
          err.message.includes('Missing required ZOHO_ZEPTOMAIL_API_KEY environment variable') &&
          err.message.includes('EMAIL_PROVIDER is "zoho"')
        );
      },
      'Should throw missing ZOHO_ZEPTOMAIL_API_KEY error'
    );
  });

  // -------------------------------------------------------------------------
  // Test 9: Inactive provider credentials are not required
  // -------------------------------------------------------------------------
  await test('Test 9: Inactive provider credentials are NOT required during startup', async () => {
    // When EMAIL_PROVIDER=zoho with valid zoho key, missing RESEND_API_KEY must not throw
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.OTP_EMAIL_ENABLED = 'true';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'valid_zoho_test_token_123';
    process.env.RESEND_API_KEY = '';

    const env = validateEnv();
    assert.strictEqual(env.emailProvider, 'zoho');
    assert.strictEqual(env.zohoZeptomailApiKey, 'valid_zoho_test_token_123');
  });

  // -------------------------------------------------------------------------
  // Test 10: ZeptoMail API failures (4xx, 5xx, timeout, network error) are handled correctly
  // -------------------------------------------------------------------------
  await test('Test 10: ZeptoMail HTTP 401 error is captured and returned with status code and error details', async () => {
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'invalid_token';

    setZeptoMailFetch(async () => {
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({
          error: {
            code: 'LE_101',
            message: 'Invalid Send Mail Token provided',
          },
        }),
      };
    });

    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.code, 'LE_101');
    assert.strictEqual(res.error, 'Invalid Send Mail Token provided');
    assert.strictEqual(res.provider, 'zoho');
  });

  await test('Test 10b: ZeptoMail network failure returns clean error without crash', async () => {
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'token_abc';

    setZeptoMailFetch(async () => {
      const netErr = new Error('getaddrinfo ENOTFOUND api.zeptomail.com');
      netErr.code = 'ENOTFOUND';
      throw netErr;
    });

    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'NETWORK_ERROR');
    assert.ok(res.error.includes('Network failure connecting to ZeptoMail API'));
  });

  await test('Test 10c: ZeptoMail timeout returns clean TIMEOUT error without crash', async () => {
    process.env.EMAIL_PROVIDER = 'zoho';
    process.env.ZOHO_ZEPTOMAIL_API_KEY = 'token_abc';

    setZeptoMailFetch(async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'TIMEOUT');
    assert.ok(res.error.includes('timed out'));
  });

  // -------------------------------------------------------------------------
  // Test 11: Resend API failures are handled correctly
  // -------------------------------------------------------------------------
  await test('Test 11: Resend API error response is captured and returned with status and message', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    setResendClient({
      emails: {
        send: async () => ({
          data: null,
          error: {
            statusCode: 422,
            name: 'validation_error',
            message: 'Domain not verified in Resend',
          },
        }),
      },
    });

    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.code, 'validation_error');
    assert.strictEqual(res.error, 'Domain not verified in Resend');
    assert.strictEqual(res.provider, 'resend');
  });

  // -------------------------------------------------------------------------
  // Test 12: Default fallback when EMAIL_PROVIDER is unset or empty
  // -------------------------------------------------------------------------
  await test('Test 12: Default provider falls back to resend when EMAIL_PROVIDER is omitted', async () => {
    delete process.env.EMAIL_PROVIDER;
    const providerName = EmailService.getProviderName();
    assert.strictEqual(providerName, 'resend', 'Must default to resend for backward compatibility');

    const provider = EmailService.getActiveProvider();
    assert.strictEqual(provider.name, 'resend');
  });

  console.log('\n========================================================================');
  console.log(` Test Suite Completed: ${passed} PASSED, ${failed} FAILED (Total ${passed + failed} Tests)`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
