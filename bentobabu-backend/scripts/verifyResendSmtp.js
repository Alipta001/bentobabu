/**
 * BentoBabu — Resend SMTP Diagnostic & Verification CLI
 *
 * Verifies Nodemailer SMTP connectivity to Resend without starting Express or exposing secrets.
 *
 * Usage:
 *   node scripts/verifyResendSmtp.js
 *   node scripts/verifyResendSmtp.js --send <recipient_email>
 */

require('dotenv').config();
const { validateEnv } = require('../app/config/env');
const { getTransporter, sendSignupOtpEmail } = require('../app/utils/email');

async function main() {
  console.log('----------------------------------------------------');
  console.log(' BentoBabu — Resend SMTP Verification Tool');
  console.log('----------------------------------------------------');

  let env;
  try {
    env = validateEnv();
  } catch (err) {
    console.error(`❌ Environment Validation Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n📋 Configuration:`);
  console.log(`- EMAIL_PROVIDER:    ${env.emailProvider}`);
  console.log(`- OTP_EMAIL_ENABLED: ${env.otpEmailEnabled}`);
  console.log(`- SMTP_HOST:         ${env.smtpHost}`);
  console.log(`- SMTP_PORT:         ${env.smtpPort}`);
  console.log(`- SMTP_SECURE:       ${env.smtpSecure}`);
  console.log(`- SMTP_USER:         ${env.smtpUser}`);
  console.log(`- SMTP_PASSWORD:     ${env.smtpPassword ? `${env.smtpPassword.slice(0, 6)}...${env.smtpPassword.slice(-4)}` : '(not set)'}`);
  console.log(`- EMAIL_FROM:        ${env.emailFrom}`);

  const transporter = getTransporter();
  if (!transporter) {
    console.error('❌ Failed to create Nodemailer transporter (missing SMTP_HOST or credentials).');
    process.exit(1);
  }

  console.log('\n⏳ Testing SMTP Connection & Authentication with Resend...');
  try {
    await transporter.verify();
    console.log('✅ SMTP Connection & Authentication successful!');
  } catch (verifyErr) {
    console.error(`❌ SMTP Verify Failed: ${verifyErr.message}`);
    if (verifyErr.code) console.error(`   Error Code: ${verifyErr.code}`);
    if (verifyErr.response) console.error(`   Server Response: ${verifyErr.response}`);
    process.exit(1);
  }

  // Check if test send is requested
  const sendIndex = process.argv.indexOf('--send');
  const recipient = sendIndex !== -1 ? process.argv[sendIndex + 1] : null;

  if (recipient) {
    console.log(`\n📨 Sending test OTP verification email to: ${recipient}...`);
    try {
      const sendResult = await sendSignupOtpEmail({
        to: recipient,
        name: 'Verification Tester',
        otp: '123456',
        expiryMinutes: env.otpExpiryMinutes || 5,
      });

      if (sendResult.success) {
        console.log('✅ Test email sent successfully!');
        console.log(`   Message ID: ${sendResult.messageId}`);
        if (sendResult.response) console.log(`   Response: ${sendResult.response}`);
      } else {
        console.error(`❌ Email delivery failed: ${sendResult.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`❌ Unexpected error sending test email: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('\n💡 Tip: Run `node scripts/verifyResendSmtp.js --send <email>` to test live email delivery.');
  }

  console.log('\n----------------------------------------------------');
  console.log(' Verification Complete');
  console.log('----------------------------------------------------');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled Exception:', err);
  process.exit(1);
});
