/**
 * BentoBabu — Stage 2 Master Test Orchestrator
 *
 * Runs all Stage 2 Concurrency, Idempotency & Lifecycle Test Suites:
 * - Phase 2A: Checkout Idempotency
 * - Phase 2B: Concurrent Rider Assignment
 * - Phase 2C: Rider Presence Lifecycle
 * - Phase 2D: Complete Order Lifecycle
 * - Phase 2E: OTP Security
 * - Phase 2F: Concurrent Delivery Completion
 * - Phase 2G: Notification Idempotency
 * - Phase 2H: MongoDB Transaction Reliability
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const { assertStagingDatabaseUri, assertActiveConnectionIsStaging } = require('../utils/stagingGuard');
const { seedStagingEnvironment, cleanupStage2TestData } = require('../utils/stagingSeeder');

const { runPhase2A } = require('./phase2a_checkout_idempotency');
const { runPhase2B } = require('./phase2b_concurrent_rider_assignment');
const { runPhase2C } = require('./phase2c_rider_presence_lifecycle');
const { runPhase2D } = require('./phase2d_order_lifecycle');
const { runPhase2E } = require('./phase2e_otp_security');
const { runPhase2F } = require('./phase2f_concurrent_delivery_completion');
const { runPhase2G } = require('./phase2g_notification_idempotency');
const { runPhase2H } = require('./phase2h_transaction_reliability');

const STAGING_PORT = 5050;
const STAGING_HOST = '127.0.0.1';

function resolveStagingMongoUri() {
  const envPath = path.resolve(__dirname, '../../bentobabu-backend/.env');
  let rawUri = process.env.MONGODB_URI;

  if (!rawUri && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^MONGODB_URI=(.*)$/m);
    if (match) rawUri = match[1].trim();
  }

  if (!rawUri) {
    throw new Error('MONGODB_URI is not set in environment or bentobabu-backend/.env');
  }

  let stagingUri = rawUri;
  if (!stagingUri.includes('bentobabu_staging') && !stagingUri.includes('test')) {
    stagingUri = rawUri.replace(/\/bentobabu(\?|$)/, '/bentobabu_staging$1');
    if (!stagingUri.includes('authSource=')) {
      stagingUri = stagingUri.includes('?')
        ? stagingUri.replace('?', '?authSource=admin&')
        : `${stagingUri}?authSource=admin`;
    }
  }

  assertStagingDatabaseUri(stagingUri);
  return stagingUri;
}

async function main() {
  console.log('====================================================================================');
  console.log('  BENTO BABU — STAGE 2: IDEMPOTENCY, CONCURRENCY & ORDER LIFECYCLE TEST SUITE       ');
  console.log('====================================================================================\n');

  const stagingUri = resolveStagingMongoUri();
  console.log(`[SafetyGuard] Staging database URI verified safe. Connecting to staging database...`);

  // 1. Connect Mongoose
  await mongoose.connect(stagingUri, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  assertActiveConnectionIsStaging();
  console.log(`[SafetyGuard] Connected to: ${mongoose.connection.name}`);

  // Re-sync Order index with partialFilterExpression
  try {
    const OrderModel = require('../../bentobabu-backend/app/models/Order');
    await OrderModel.collection.dropIndex('user_1_idempotencyKey_1');
  } catch (_) {}
  try {
    const OrderModel = require('../../bentobabu-backend/app/models/Order');
    await OrderModel.syncIndexes();
  } catch (_) {}

  // 2. Seed Staging Environment
  console.log(`[Seeder] Seeding isolated staging test data (customers, riders, products, zones)...`);
  const context = await seedStagingEnvironment();
  console.log(`[Seeder] Seeding verified:`);
  console.log(`  - Customer: ${context.customer.email}`);
  console.log(`  - Riders:   ${context.riders.length} active delivery partners`);
  console.log(`  - Admin:    ${context.admin.email}`);
  console.log(`  - Product:  ${context.product.slug} (Stock: ${context.product.stockQuantity})`);

  // 3. Start Backend Server Process on Staging Port
  console.log(`\n[Server] Starting staging Express backend on http://${STAGING_HOST}:${STAGING_PORT}...`);
  const serverScript = path.resolve(__dirname, '../../bentobabu-backend/server.js');
  const serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      UV_THREADPOOL_SIZE: '64',
      PORT: STAGING_PORT.toString(),
      HOST: STAGING_HOST,
      MONGODB_URI: stagingUri,
      NODE_ENV: 'staging',
      B2_BUCKET_NAME: 'bentobabu-staging-test',
      MOCK_NOTIFICATIONS: 'true',
      STAGING_LOAD_TEST: 'true',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('injected env') && !msg.includes('NodeVersionSupportWarning')) {
      process.stderr.write(`[ServerErr] ${msg}`);
    }
  });

  // Wait for server ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server failed to start within 25s')), 25000);
    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('running on') || msg.includes('Bento Babu backend')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  console.log(`[Server] Staging backend running cleanly (PID: ${serverProcess.pid}).\n`);

  const allPhaseResults = [];

  try {
    // Execute all 8 test phases sequentially
    allPhaseResults.push(await runPhase2A(context));
    allPhaseResults.push(await runPhase2B(context));
    allPhaseResults.push(await runPhase2C(context));
    allPhaseResults.push(await runPhase2D(context));
    allPhaseResults.push(await runPhase2E(context));
    allPhaseResults.push(await runPhase2F(context));
    allPhaseResults.push(await runPhase2G(context));
    allPhaseResults.push(await runPhase2H(context));

  } finally {
    // Kill staging backend
    console.log(`\n[Server] Stopping staging backend process (PID: ${serverProcess.pid})...`);
    serverProcess.kill('SIGTERM');

    // Clean up test data
    console.log(`[Cleanup] Cleaning up all Stage 2 test orders and resetting presences...`);
    const cleanResult = await cleanupStage2TestData();
    console.log(`[Cleanup] Cleaned up ${cleanResult.deletedOrders} test orders. Presences reset to ONLINE.`);

    // Close Mongoose
    await mongoose.connection.close();
    console.log(`[Cleanup] Staging database connection closed.\n`);
  }

  // Print Structured Stage 2 Report
  console.log('========================================================================================================');
  console.log('                             BENTO BABU STAGE 2 COMPREHENSIVE TEST RESULTS                              ');
  console.log('========================================================================================================');
  console.log('| Phase | Suite Name                                  | Passed | Failed | Total  | Status |');
  console.log('|-------|---------------------------------------------|--------|--------|--------|--------|');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const r of allPhaseResults) {
    totalPassed += r.passed;
    totalFailed += r.failed;
    const status = r.failed === 0 ? 'PASS' : 'FAIL';
    console.log(
      `| ${(r.name.slice(0, 7)).padEnd(5)} | ${r.name.padEnd(43)} | ${String(r.passed).padEnd(6)} | ${String(r.failed).padEnd(6)} | ${String(r.passed + r.failed).padEnd(6)} | ${status.padEnd(6)} |`
    );
  }

  console.log('========================================================================================================');
  console.log(`TOTALS: ${totalPassed} Passed, ${totalFailed} Failed out of ${totalPassed + totalFailed} tests.`);
  console.log('========================================================================================================\n');

  if (totalFailed === 0) {
    console.log('>>> STAGE 2 VERIFICATION: ALL 8 TEST PHASES PASSED WITH ZERO FAILURES <<<\n');
    process.exit(0);
  } else {
    console.error('>>> STAGE 2 VERIFICATION: ONE OR MORE TESTS FAILED <<<\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Fatal Error in Master Stage 2 Runner]:', err);
    process.exit(1);
  });
}
