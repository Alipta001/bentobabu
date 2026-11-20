/**
 * BentoBabu — Stage 3 Master Test Orchestrator
 *
 * Runs the full suite of Stage 3 Network Resilience, Recovery & Production Stability Tests:
 * - Phase 3A: Network Resilience
 * - Phase 3B: Server Restart & Recovery
 * - Phase 3C: Socket Reliability
 * - Phase 3D: Auth & Session Resilience
 * - Phase 3E: Rider Concurrency
 * - Phase 3F: Sustained Performance
 * - Phase 3G: Frontend Resilience
 * - Phase 3H: Observability & Diagnostics
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const { assertStagingDatabaseUri, assertActiveConnectionIsStaging } = require('../utils/stagingGuard');
const { seedStagingEnvironment, cleanupStage2TestData } = require('../utils/stagingSeeder');

const { runPhase3A } = require('./phase3a_network_resilience');
const { runPhase3B } = require('./phase3b_server_restart_recovery');
const { runPhase3C } = require('./phase3c_socket_reliability');
const { runPhase3D } = require('./phase3d_auth_session_resilience');
const { runPhase3E } = require('./phase3e_rider_concurrency');
const { runPhase3F } = require('./phase3f_sustained_performance');
const { runPhase3G } = require('./phase3g_frontend_resilience');
const { runPhase3H } = require('./phase3h_observability');

const PORT_1 = 5050;
const PORT_2 = 5051;
const HOST = '127.0.0.1';

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

function spawnServer(port, stagingUri) {
  const serverScript = path.resolve(__dirname, '../../bentobabu-backend/server.js');
  const serverProcess = spawn('node', [serverScript], {
    env: {
      ...process.env,
      UV_THREADPOOL_SIZE: '64',
      PORT: port.toString(),
      HOST: HOST,
      MONGODB_URI: stagingUri,
      NODE_ENV: 'staging',
      B2_BUCKET_NAME: 'bentobabu-staging-test',
      MOCK_NOTIFICATIONS: 'true',
      STAGING_LOAD_TEST: 'true',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server on port ${port} failed to start within 30s`)),
      30000
    );
    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('running on') || msg.includes('Bento Babu backend')) {
        clearTimeout(timeout);
        resolve(serverProcess);
      }
    });
    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (!msg.includes('injected env') && !msg.includes('NodeVersionSupportWarning')) {
        process.stderr.write(`[ServerErr-${port}] ${msg}`);
      }
    });
  });
}

async function main() {
  console.log('====================================================================================');
  console.log('  BENTO BABU — STAGE 3: NETWORK RESILIENCE, RECOVERY & PRODUCTION STABILITY         ');
  console.log('====================================================================================\n');

  const stagingUri = resolveStagingMongoUri();
  console.log(`[SafetyGuard] Staging database URI verified safe. Connecting to staging database...`);

  await mongoose.connect(stagingUri, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  assertActiveConnectionIsStaging();
  console.log(`[SafetyGuard] Connected to: ${mongoose.connection.name}`);

  // Re-sync models & indexes
  try {
    const OrderModel = require('../../bentobabu-backend/app/models/Order');
    await OrderModel.syncIndexes();
  } catch (_) {}

  console.log(`[Seeder] Seeding isolated staging environment...`);
  const context = await seedStagingEnvironment();
  console.log(`[Seeder] Seeding verified:`);
  console.log(`  - Customer: ${context.customer.email}`);
  console.log(`  - Riders:   ${context.riders.length} active delivery partners`);
  console.log(`  - Admin:    ${context.admin.email}`);

  // Spawn dual instances
  console.log(`\n[Cluster] Spawning Server Instance 1 on http://${HOST}:${PORT_1}...`);
  let server1 = await spawnServer(PORT_1, stagingUri);
  console.log(`[Cluster] Server Instance 1 running (PID: ${server1.pid})`);

  console.log(`[Cluster] Spawning Server Instance 2 on http://${HOST}:${PORT_2}...`);
  let server2 = await spawnServer(PORT_2, stagingUri);
  console.log(`[Cluster] Server Instance 2 running (PID: ${server2.pid})\n`);

  const serverControls = {
    stopServer1: async () => {
      if (server1) {
        console.log(`[Cluster] Stopping Server 1 (PID: ${server1.pid})...`);
        const proc = server1;
        server1 = null;
        await new Promise((resolve) => {
          proc.on('exit', () => resolve());
          proc.kill('SIGTERM');
          setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch (_) {}
            resolve();
          }, 3000);
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
    },
    startServer1: async () => {
      if (!server1) {
        console.log(`[Cluster] Starting Server 1 on port ${PORT_1}...`);
        server1 = await spawnServer(PORT_1, stagingUri);
        console.log(`[Cluster] Server 1 started (PID: ${server1.pid})`);
      }
    },
    restartServer1: async () => {
      await serverControls.stopServer1();
      await serverControls.startServer1();
    },
  };

  const allPhaseResults = [];

  try {
    allPhaseResults.push(await runPhase3A(context));
    allPhaseResults.push(await runPhase3B(context, serverControls));
    allPhaseResults.push(await runPhase3C(context));
    allPhaseResults.push(await runPhase3D(context));
    allPhaseResults.push(await runPhase3E(context));
    allPhaseResults.push(await runPhase3F(context));
    allPhaseResults.push(await runPhase3G(context));
    allPhaseResults.push(await runPhase3H(context));
  } finally {
    console.log(`\n[Teardown] Shutting down Server instances...`);
    if (server1) server1.kill('SIGTERM');
    if (server2) server2.kill('SIGTERM');

    console.log(`[Cleanup] Cleaning up all test data and resetting presences...`);
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(stagingUri, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
      }
      const cleanResult = await cleanupStage2TestData();
      console.log(`[Cleanup] Cleaned up ${cleanResult.deletedOrders} test orders. Presences reset to ONLINE.`);
    } catch (cleanErr) {
      console.warn(`[Cleanup] Warning during cleanup: ${cleanErr.message}`);
    }

    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    } catch (_) {}
    console.log(`[Cleanup] Staging database connection closed cleanly.\n`);
  }

  // Print Structured Report Table
  console.log('========================================================================================================');
  console.log('                             BENTO BABU STAGE 3 COMPREHENSIVE TEST RESULTS                              ');
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
    console.log('>>> STAGE 3 VERIFICATION: ALL 8 TEST PHASES PASSED WITH ZERO FAILURES <<<\n');
    process.exit(0);
  } else {
    console.error('>>> STAGE 3 VERIFICATION: ONE OR MORE TESTS FAILED <<<\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Fatal Error in Stage 3 Master Runner]:', err);
    process.exit(1);
  });
}
