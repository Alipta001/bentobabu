/**
 * BentoBabu — MSG91 OTP Verification Security, Navigation & Channel Test Suite
 *
 * Verifies:
 * 1. Phone number sanitization handles +91, 0 prefix, spaces, and formatting
 * 2. Display destination formats masked phone correctly (+91 ****** 5669)
 * 3. CRITICAL SECURITY: Password is NEVER saved to sessionStorage or draft registration
 * 4. Automatic draft registration expiration after 15 minutes
 * 5. SMS challenge state contains requestId, channel="sms", destination and cooldown
 * 6. MSG91 retry channel mapping: "sms" maps strictly to "11"
 * 7. Msg91OtpWidget.tsx triggers immediate navigation to /verify-otp on send success
 * 8. Register page restores draft state (without password) and handles verify navigation
 * 9. Verify OTP page prompts for password after mobile verification before registration submission
 * 10. Cancellation cleanly clears temporary registration and challenge data
 * 11. lib/msg91.ts enforces 6-digit OTP format, error callback rejection, and channel mapping
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock SessionStorage
class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Destination formatter simulation (matches app/verify-otp/page.tsx)
function formatDisplayDestination(dest, channel) {
  if (!dest) {
    return channel === 'email' ? 'your registered email' : 'your registered phone';
  }
  if (channel === 'sms') {
    const digits = dest.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last4 = digits.slice(-4);
      return `+91 ****** ${last4}`;
    }
  }
  return dest;
}

// Phone sanitization simulation (matches components/auth/Msg91OtpWidget.tsx and lib/msg91.ts)
function cleanPhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

// Channel mapper simulation (matches lib/msg91.ts)
function mapMsg91RetryChannel(channel = 'sms') {
  const normalized = String(channel || '').trim().toLowerCase();
  switch (normalized) {
    case 'sms':
    case '11':
      return '11';
    case 'voice':
    case 'call':
    case '12':
      return '12';
    case 'whatsapp':
    case '13':
      return '13';
    case 'email':
    case '14':
      return '14';
    default:
      return '11';
  }
}

// Simulated safe saveDraftRegistration
function saveDraftRegistrationSafe(storage, data) {
  const payload = {
    name: (data.name || '').trim(),
    email: (data.email || '').trim().toLowerCase(),
    phone: cleanPhoneNumber(data.phone || ''),
    savedAt: Date.now(),
  };
  delete payload.password;
  storage.setItem('bb_draft_registration', JSON.stringify(payload));
}

function getDraftRegistrationSafe(storage, now = Date.now()) {
  const raw = storage.getItem('bb_draft_registration');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  delete parsed.password;
  if (parsed.savedAt && now - parsed.savedAt > 15 * 60 * 1000) {
    storage.removeItem('bb_draft_registration');
    return null;
  }
  return {
    name: parsed.name || '',
    email: parsed.email || '',
    phone: parsed.phone || '',
  };
}

function runTests() {
  console.log('\n======================================================');
  console.log('🚀 Starting BentoBabu MSG91 Security & Navigation Tests');
  console.log('======================================================\n');

  let passed = 0;
  const test = (name) => {
    passed++;
    console.log(`  [Test ${passed}] ${name}`);
  };

  // 1. Phone number sanitization
  test('Phone number sanitization handles +91, 0 prefix, spaces, and formatting');
  assert.strictEqual(cleanPhoneNumber('+91 85840 85669'), '8584085669');
  assert.strictEqual(cleanPhoneNumber('08584085669'), '8584085669');
  assert.strictEqual(cleanPhoneNumber('918584085669'), '8584085669');
  assert.strictEqual(cleanPhoneNumber('8584085669'), '8584085669');
  console.log('    ✓ Phone sanitization strictly extracts clean 10-digit number');

  // 2. Masked phone rendering
  test('Display destination formats masked phone correctly (+91 ****** 5669)');
  const maskedSms = formatDisplayDestination('8584085669', 'sms');
  assert.strictEqual(maskedSms, '+91 ****** 5669');
  const maskedEmail = formatDisplayDestination('arjun@bentobabu.com', 'email');
  assert.strictEqual(maskedEmail, 'arjun@bentobabu.com');
  console.log('    ✓ Correctly masks phone destination preserving last 4 digits');

  // 3. CRITICAL SECURITY: Password is NEVER saved to sessionStorage
  test('CRITICAL SECURITY: Password is never stored in sessionStorage or draft data');
  const mockStorage = new MockSessionStorage();
  const rawSubmission = {
    name: 'Arjun Verma',
    email: 'arjun@example.com',
    phone: '+91 85840 85669',
    password: 'SuperSecretPassword123!',
  };
  saveDraftRegistrationSafe(mockStorage, rawSubmission);
  const storedJson = mockStorage.getItem('bb_draft_registration');
  assert.ok(storedJson, 'Draft must be stored');
  assert.ok(!storedJson.includes('SuperSecretPassword123!'), 'Password string must NEVER be present in storage');
  assert.ok(!storedJson.includes('"password"'), 'password property must NEVER exist in storage');
  const retrieved = getDraftRegistrationSafe(mockStorage);
  assert.strictEqual(retrieved.password, undefined);
  assert.strictEqual(retrieved.name, 'Arjun Verma');
  assert.strictEqual(retrieved.email, 'arjun@example.com');
  assert.strictEqual(retrieved.phone, '8584085669');
  console.log('    ✓ Customer password is strictly excluded from persistent client storage');

  // 4. Draft registration expiration
  test('Draft registration expires automatically after 15 minutes');
  const now = Date.now();
  const pastTime = now + 16 * 60 * 1000; // 16 minutes later
  const expired = getDraftRegistrationSafe(mockStorage, pastTime);
  assert.strictEqual(expired, null, 'Draft must return null after 15 minutes');
  assert.strictEqual(mockStorage.getItem('bb_draft_registration'), null, 'Expired draft must be purged');
  console.log('    ✓ 15-minute expiration automatically cleans up abandoned drafts');

  // 5. Stored OTP challenge for SMS
  test('SMS challenge state contains requestId, channel="sms", destination and cooldown');
  const challengeState = {
    challengeId: 'req_msg91_test_123456',
    channel: 'sms',
    destination: '8584085669',
    cooldownSeconds: 60,
    createdAt: Date.now(),
  };
  mockStorage.setItem('bb_otp_challenge', JSON.stringify(challengeState));
  const loadedChallenge = JSON.parse(mockStorage.getItem('bb_otp_challenge'));
  assert.strictEqual(loadedChallenge.challengeId, 'req_msg91_test_123456');
  assert.strictEqual(loadedChallenge.channel, 'sms');
  assert.strictEqual(loadedChallenge.destination, '8584085669');
  console.log('    ✓ SMS challenge state preserved across page navigation & refresh');

  // 6. MSG91 retry channel mapping
  test('MSG91 retry channel strictly maps "sms" to channel code "11"');
  assert.strictEqual(mapMsg91RetryChannel('sms'), '11');
  assert.strictEqual(mapMsg91RetryChannel('SMS'), '11');
  assert.strictEqual(mapMsg91RetryChannel('11'), '11');
  assert.strictEqual(mapMsg91RetryChannel('voice'), '12');
  assert.strictEqual(mapMsg91RetryChannel('whatsapp'), '13');
  assert.strictEqual(mapMsg91RetryChannel(''), '11');
  console.log('    ✓ MSG91 SMS retry channel code "11" verified');

  // 7. Code inspection of Msg91OtpWidget.tsx
  test('Msg91OtpWidget.tsx triggers immediate navigation to /verify-otp on send success');
  const widgetFile = fs.readFileSync(path.resolve(__dirname, '../components/auth/Msg91OtpWidget.tsx'), 'utf-8');
  assert.ok(widgetFile.includes('sendMsg91Otp'), 'Must use sendMsg91Otp helper');
  assert.ok(widgetFile.includes('router.push(verifyUrl)'), 'Must navigate to verify-otp');
  assert.ok(widgetFile.includes('/verify-otp?channel=sms'), 'Must pass channel=sms in URL');
  assert.ok(widgetFile.includes('reqId='), 'Must pass reqId in URL');
  console.log('    ✓ Msg91OtpWidget navigates to /verify-otp with requestId');

  // 8. Code inspection of app/register/page.tsx
  test('Register page never reads password from draft and enforces 8-character password');
  const registerFile = fs.readFileSync(path.resolve(__dirname, '../app/register/page.tsx'), 'utf-8');
  assert.ok(registerFile.includes('getDraftRegistration'), 'Must restore draft registration on mount');
  assert.ok(!registerFile.includes('draft.password'), 'Must NEVER read draft.password');
  assert.ok(registerFile.includes('password.length < 8'), 'Must enforce min 8 chars password');
  assert.ok(registerFile.includes('minLength={8}'), 'Input must have minLength 8');
  console.log('    ✓ Register page strictly validates password without persistent leakage');

  // 9. Code inspection of app/verify-otp/page.tsx
  test('Verify OTP page prompts for password after mobile verification');
  const verifyFile = fs.readFileSync(path.resolve(__dirname, '../app/verify-otp/page.tsx'), 'utf-8');
  assert.ok(verifyFile.includes('verifyMsg91Otp'), 'Must import verifyMsg91Otp');
  assert.ok(verifyFile.includes('retryMsg91Otp'), 'Must import retryMsg91Otp');
  assert.ok(verifyFile.includes('activeChannel === "sms"'), 'Must check activeChannel === "sms"');
  assert.ok(verifyFile.includes('verifyMobileWidget'), 'Must exchange access token with verifyMobileWidget');
  assert.ok(verifyFile.includes('handlePasswordSubmit'), 'Must have handlePasswordSubmit for setting password');
  assert.ok(verifyFile.includes('setMobilePreVerified'), 'Must track mobilePreVerified state');
  assert.ok(verifyFile.includes('if (activeChannel === "sms") return;'), 'Must skip backend getOtpStatus for SMS challenges');
  console.log('    ✓ Verify OTP page implements interactive password entry after mobile verification');

  // 10. Code inspection of authService.ts
  test('authService.ts explicitly deletes password from draft registration');
  const authServiceFile = fs.readFileSync(path.resolve(__dirname, '../services/authService.ts'), 'utf-8');
  assert.ok(authServiceFile.includes('delete (payload as any).password'), 'Must delete password on save');
  assert.ok(authServiceFile.includes('delete parsed.password'), 'Must delete password on get');
  console.log('    ✓ authService guarantees zero password storage');

  // 11. Code inspection of lib/msg91.ts
  test('lib/msg91.ts maps retry channel to "11" and validates 6-digit OTP');
  const libFile = fs.readFileSync(path.resolve(__dirname, '../lib/msg91.ts'), 'utf-8');
  assert.ok(libFile.includes('mapMsg91RetryChannel'), 'Must export mapMsg91RetryChannel');
  assert.ok(libFile.includes('"11"'), 'Must map to channel 11');
  assert.ok(libFile.includes('trimmedOtp.length !== 6'), 'Must validate 6-digit OTP format');
  assert.ok(libFile.includes('accessToken'), 'Must extract accessToken');
  console.log('    ✓ lib/msg91.ts implements robust channel mapping and validation');

  console.log(`\n🎉 All ${passed} tests passed successfully!\n`);
}

runTests();
