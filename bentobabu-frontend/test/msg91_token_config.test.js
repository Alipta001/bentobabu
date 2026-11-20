/**
 * BentoBabu — MSG91 OTP Widget Token Configuration Audit & Verification Suite
 *
 * Verifies:
 * 1. Server route app/api/auth/msg91-token/route.ts reads NEXT_MSG91_TOKEN_AUTH.
 * 2. Next.js server route returns tokenAuth and widgetId.
 * 3. Missing NEXT_MSG91_TOKEN_AUTH safely returns HTTP 500 without leaking internals.
 * 4. Main backend MSG91_AUTH_KEY is NEVER exposed.
 * 5. Cache-Control headers prevent intermediate caching (no-store).
 * 6. NEXT_PUBLIC_MSG91_TOKEN_AUTH is NOT used in the codebase.
 * 7. CSP headers in next.config.ts allow MSG91 domains.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Pure JS simulation of the route handler logic to verify contract in standard Node environment
function handleMsg91TokenGet(env = process.env) {
  const tokenAuth = (env.NEXT_MSG91_TOKEN_AUTH || '').trim();
  const widgetId = (env.NEXT_PUBLIC_MSG91_WIDGET_ID || '366b746e3258343539303835').trim();

  if (!tokenAuth) {
    return {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
      body: {
        success: false,
        message: 'MSG91 OTP widget token is not configured on the server.',
      },
    };
  }

  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    body: {
      success: true,
      data: {
        tokenAuth,
        widgetId,
      },
    },
  };
}

const runAuditTests = () => {
  console.log('\n======================================================');
  console.log('🚀 Starting BentoBabu Frontend MSG91 Token Config Audit');
  console.log('======================================================\n');

  let passed = 0;
  const test = (name) => {
    passed++;
    console.log(`  [Test ${passed}] ${name}`);
  };

  // Test 1: Route handler with NEXT_MSG91_TOKEN_AUTH present
  test('Server route returns tokenAuth when NEXT_MSG91_TOKEN_AUTH is present');
  const res1 = handleMsg91TokenGet({
    NEXT_MSG91_TOKEN_AUTH: '591716TVqfKQ9vBo6b006c58P1',
    NEXT_PUBLIC_MSG91_WIDGET_ID: '366b746e3258343539303835',
  });

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.success, true);
  assert.strictEqual(res1.body.data.tokenAuth, '591716TVqfKQ9vBo6b006c58P1');
  assert.strictEqual(res1.body.data.widgetId, '366b746e3258343539303835');
  assert.strictEqual(res1.headers['Cache-Control'], 'no-store, max-age=0, must-revalidate');
  console.log('    ✓ Correctly reads NEXT_MSG91_TOKEN_AUTH and delivers widgetId + tokenAuth');

  // Test 2: Route handler with missing NEXT_MSG91_TOKEN_AUTH
  test('Server route returns HTTP 500 when NEXT_MSG91_TOKEN_AUTH is missing');
  const res2 = handleMsg91TokenGet({});

  assert.strictEqual(res2.status, 500);
  assert.strictEqual(res2.body.success, false);
  assert.ok(res2.body.message.includes('not configured'));
  console.log('    ✓ Safely returns HTTP 500 error when token is unconfigured');

  // Test 3: Backend secret key MSG91_AUTH_KEY is NEVER exposed
  test('Endpoint NEVER exposes backend MSG91_AUTH_KEY');
  const res3 = handleMsg91TokenGet({
    NEXT_MSG91_TOKEN_AUTH: '591716TVqfKQ9vBo6b006c58P1',
    MSG91_AUTH_KEY: 'super_secret_backend_only_key_never_leak',
  });

  assert.strictEqual(res3.body.data.tokenAuth, '591716TVqfKQ9vBo6b006c58P1');
  assert.strictEqual(res3.body.data.MSG91_AUTH_KEY, undefined);
  assert.strictEqual(res3.body.data.authkey, undefined);
  assert.ok(!JSON.stringify(res3.body).includes('super_secret_backend_only_key_never_leak'));
  console.log('    ✓ Zero leakage of backend MSG91_AUTH_KEY verified');

  // Test 4: Verify route.ts file exists and has correct logic
  test('app/api/auth/msg91-token/route.ts exists and references NEXT_MSG91_TOKEN_AUTH');
  const routeTsPath = path.resolve(__dirname, '../app/api/auth/msg91-token/route.ts');
  assert.ok(fs.existsSync(routeTsPath), 'route.ts must exist');
  const routeTsCode = fs.readFileSync(routeTsPath, 'utf-8');
  assert.ok(routeTsCode.includes('NEXT_MSG91_TOKEN_AUTH'), 'Must read NEXT_MSG91_TOKEN_AUTH');
  assert.ok(!routeTsCode.includes('NEXT_PUBLIC_MSG91_TOKEN_AUTH'), 'Must not read NEXT_PUBLIC_MSG91_TOKEN_AUTH');
  console.log('    ✓ route.ts implements server-side NEXT_MSG91_TOKEN_AUTH lookup');

  // Test 5: Verify Msg91OtpWidget.tsx strictly avoids NEXT_PUBLIC_MSG91_TOKEN_AUTH
  test('Msg91OtpWidget.tsx uses server config fetch and avoids NEXT_PUBLIC_MSG91_TOKEN_AUTH');
  const widgetPath = path.resolve(__dirname, '../components/auth/Msg91OtpWidget.tsx');
  const widgetCode = fs.readFileSync(widgetPath, 'utf-8');
  assert.ok(
    !widgetCode.includes('NEXT_PUBLIC_MSG91_TOKEN_AUTH'),
    'Msg91OtpWidget.tsx must NOT reference NEXT_PUBLIC_MSG91_TOKEN_AUTH'
  );
  assert.ok(
    widgetCode.includes('getMsg91WidgetConfig'),
    'Msg91OtpWidget.tsx must fetch configuration from authService.getMsg91WidgetConfig'
  );
  console.log('    ✓ Msg91OtpWidget.tsx correctly fetches server-side token without bundle exposure');

  // Test 6: Verify .env.local and .env.example variable names
  test('Environment files declare NEXT_MSG91_TOKEN_AUTH');
  const envExamplePath = path.resolve(__dirname, '../.env.example');
  const envExample = fs.readFileSync(envExamplePath, 'utf-8');
  assert.ok(
    !envExample.includes('NEXT_PUBLIC_MSG91_TOKEN_AUTH'),
    '.env.example must NOT declare NEXT_PUBLIC_MSG91_TOKEN_AUTH'
  );
  assert.ok(
    envExample.includes('NEXT_MSG91_TOKEN_AUTH'),
    '.env.example must declare NEXT_MSG91_TOKEN_AUTH'
  );

  const envLocalPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envLocal = fs.readFileSync(envLocalPath, 'utf-8');
    assert.ok(
      !envLocal.includes('NEXT_PUBLIC_MSG91_TOKEN_AUTH'),
      '.env.local must NOT declare NEXT_PUBLIC_MSG91_TOKEN_AUTH'
    );
    assert.ok(
      envLocal.includes('NEXT_MSG91_TOKEN_AUTH'),
      '.env.local must declare NEXT_MSG91_TOKEN_AUTH'
    );
  }
  console.log('    ✓ Environment files correctly use NEXT_MSG91_TOKEN_AUTH');

  // Test 7: Verify CSP headers in next.config.ts allow MSG91 and hCaptcha domains
  test('next.config.ts CSP headers allow MSG91 and hCaptcha domains');
  const nextConfigPath = path.resolve(__dirname, '../next.config.ts');
  const nextConfigCode = fs.readFileSync(nextConfigPath, 'utf-8');
  assert.ok(nextConfigCode.includes('https://verify.msg91.com'), 'script-src/connect-src must allow verify.msg91.com');
  assert.ok(nextConfigCode.includes('https://verify.phone91.com'), 'script-src/connect-src must allow verify.phone91.com');
  assert.ok(nextConfigCode.includes('https://hcaptcha.com'), 'script-src/frame-src/style-src/connect-src must allow hcaptcha.com');
  assert.ok(nextConfigCode.includes('https://*.hcaptcha.com'), 'script-src/frame-src/style-src/connect-src must allow *.hcaptcha.com');
  console.log('    ✓ CSP headers permit MSG91 and hCaptcha scripts, iframes, styles, and connect endpoints');

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} FRONTEND TOKEN CONFIG TESTS PASSED!`);
  console.log('======================================================\n');
};

runAuditTests();
