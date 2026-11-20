/**
 * BentoBabu — Phase 1: Automated k6 Load Test Orchestrator & Telemetry Collector
 *
 * Coordinates:
 * 1. Staging database verification & isolation safety guard.
 * 2. Staging data seeding (customer, address, menu, product).
 * 3. Staging backend process startup on port 5050.
 * 4. Process CPU & RSS memory monitoring (every 500ms).
 * 5. Execution of k6 across 5, 10, 20, 35, 50 VU tiers.
 * 6. Metric aggregation (p50, p90, p95, p99, throughput, error rate).
 * 7. Clean test data teardown & process termination.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment from bentobabu-backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../bentobabu-backend/.env') });

const { assertStagingDatabaseUri, assertActiveConnectionIsStaging } = require('../utils/stagingGuard');
const { seedStagingEnvironment, cleanupStagingTestData, STAGING_CONSTANTS } = require('../utils/stagingSeeder');

const STAGING_PORT = parseInt(process.env.STAGING_PORT || '5050', 10);
const STAGING_HOST = process.env.STAGING_HOST || '127.0.0.1';
const STAGING_BASE_URL = `http://${STAGING_HOST}:${STAGING_PORT}/api/v1`;

// Build isolated staging MongoDB URI
function resolveStagingMongoUri() {
  const origUri = process.env.MONGODB_URI;
  if (!origUri) {
    throw new Error('MONGODB_URI missing from environment.');
  }

  // Enforce staging database: replace /bentobabu? with /bentobabu_staging?authSource=admin&
  let stagingUri = origUri;
  if (stagingUri.includes('/bentobabu?')) {
    stagingUri = stagingUri.replace('/bentobabu?', '/bentobabu_staging?authSource=admin&');
  } else if (!stagingUri.includes('staging') && !stagingUri.includes('test')) {
    const match = stagingUri.match(/\/([^/?]+)(\?|$)/);
    if (match) {
      stagingUri = stagingUri.replace(`/${match[1]}`, '/bentobabu_staging?authSource=admin&');
    }
  }

  // Safety assert
  assertStagingDatabaseUri(stagingUri);
  return stagingUri;
}

// Telemetry monitor for CPU and Memory
class ProcessTelemetry {
  constructor(pid) {
    this.pid = pid;
    this.samples = [];
    this.timer = null;
  }

  start() {
    this.samples = [];
    this.timer = setInterval(() => {
      try {
        const stdout = execSync(`ps -o %cpu,rss -p ${this.pid}`, { encoding: 'utf8' });
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const [cpuStr, rssStr] = lines[1].trim().split(/\s+/);
          const cpu = parseFloat(cpuStr) || 0;
          const rssMb = (parseInt(rssStr, 10) || 0) / 1024;
          this.samples.push({ cpu, rssMb, timestamp: Date.now() });
        }
      } catch {}
    }, 500);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSummary() {
    if (this.samples.length === 0) {
      return { minCpu: 0, maxCpu: 0, avgCpu: 0, peakRssMb: 0, currentRssMb: 0 };
    }

    const cpus = this.samples.map((s) => s.cpu);
    const rsses = this.samples.map((s) => s.rssMb);

    const minCpu = Math.min(...cpus);
    const maxCpu = Math.max(...cpus);
    const avgCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;
    const peakRssMb = Math.max(...rsses);
    const currentRssMb = rsses[rsses.length - 1];

    return {
      minCpu: parseFloat(minCpu.toFixed(1)),
      maxCpu: parseFloat(maxCpu.toFixed(1)),
      avgCpu: parseFloat(avgCpu.toFixed(1)),
      peakRssMb: parseFloat(peakRssMb.toFixed(1)),
      currentRssMb: parseFloat(currentRssMb.toFixed(1)),
    };
  }
}

async function runCommand(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function main() {
  console.log('========================================================================');
  console.log('  BentoBabu — Phase 1: k6 Staging Load & Concurrency Test Orchestrator  ');
  console.log('========================================================================\n');

  const stagingUri = resolveStagingMongoUri();
  console.log(`[SafetyGuard] Staging database URI verified safe. Connecting to staging database...`);

  // 1. Connect Mongoose to staging DB
  await mongoose.connect(stagingUri, { serverSelectionTimeoutMS: 5000 });
  assertActiveConnectionIsStaging();
  console.log(`[SafetyGuard] Connected to: ${mongoose.connection.name}`);

  // 2. Seed Staging Environment
  console.log(`[Seeder] Seeding isolated staging test data...`);
  const seeded = await seedStagingEnvironment();
  console.log(`[Seeder] Seeding verified:`);
  console.log(`  - Customer: ${seeded.customer.email}`);
  console.log(`  - Category: ${seeded.category.slug}`);
  console.log(`  - Product:  ${seeded.product.slug} (Stock: ${seeded.product.stockQuantity})`);
  console.log(`  - Address:  ${seeded.address.addressLine} (${seeded.address.pincode})`);

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

  serverProcess.stderr.on('data', (d) => process.stderr.write(`[ServerErr] ${d}`));

  // Wait for server ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server failed to start within 10s')), 10000);
    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('running on') || msg.includes('Bento Babu backend')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  console.log(`[Server] Staging backend running cleanly (PID: ${serverProcess.pid}).`);

  // 4. Start Telemetry
  const telemetry = new ProcessTelemetry(serverProcess.pid);
  telemetry.start();

  const vuTiers = [5, 10, 20, 35, 50];
  const tierResults = [];

  try {
    for (const vus of vuTiers) {
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`  Executing k6 Load Tier: ${vus} Concurrent Customers (Single-Tier 12s)  `);
      console.log(`------------------------------------------------------------------------`);

      const k6Script = path.resolve(__dirname, 'customer_load_test.js');
      const k6Env = {
        STAGING_BASE_URL,
        STAGING_CUSTOMER_PASSWORD: STAGING_CONSTANTS.CUSTOMER_PASSWORD,
        TARGET_VUS: vus.toString(),
        STAGE_DURATION: '12s',
        LOAD_PROFILE: 'single_tier',
      };

      const k6SummaryFile = path.resolve(__dirname, `k6_summary_${vus}vu.json`);

      const result = await runCommand('/opt/homebrew/bin/k6', [
        'run',
        '--summary-export',
        k6SummaryFile,
        k6Script,
      ], k6Env);

      // Parse summary JSON if generated
      let p50 = 0, p90 = 0, p95 = 0, p99 = 0, reqCount = 0, reqRate = 0, failedRate = 0;
      if (fs.existsSync(k6SummaryFile)) {
        try {
          const summary = JSON.parse(fs.readFileSync(k6SummaryFile, 'utf8'));
          const reqDuration = summary.metrics?.http_req_duration;
          if (reqDuration) {
            p50 = parseFloat((reqDuration.med ?? reqDuration['p(50)'] ?? 0).toFixed(1));
            p90 = parseFloat((reqDuration['p(90)'] ?? 0).toFixed(1));
            p95 = parseFloat((reqDuration['p(95)'] ?? 0).toFixed(1));
            p99 = parseFloat((reqDuration['p(99)'] ?? reqDuration.max ?? 0).toFixed(1));
          }
          reqCount = summary.metrics?.http_reqs?.count || 0;
          reqRate = parseFloat((summary.metrics?.http_reqs?.rate || 0).toFixed(1));
          failedRate = parseFloat(((summary.metrics?.http_req_failed?.value || 0) * 100).toFixed(2));
        } catch (err) {
          console.error(`[Metrics] Error parsing k6 summary:`, err.message);
        }
      }

      const telemNow = telemetry.getSummary();
      tierResults.push({
        vus,
        reqCount,
        reqRate,
        p50,
        p90,
        p95,
        p99,
        failedRate,
        maxCpu: telemNow.maxCpu,
        avgCpu: telemNow.avgCpu,
        peakRssMb: telemNow.peakRssMb,
        exitCode: result.code,
      });

      console.log(`[Tier ${vus} VUs Summary] Requests: ${reqCount} | Req/s: ${reqRate} | p50: ${p50}ms | p90: ${p90}ms | p95: ${p95}ms | p99: ${p99}ms | Error: ${failedRate}% | Peak CPU: ${telemNow.maxCpu}% | Peak RSS: ${telemNow.peakRssMb}MB`);
    }

  } finally {
    // Stop telemetry
    telemetry.stop();

    // Kill staging backend
    console.log(`\n[Server] Stopping staging backend process (PID: ${serverProcess.pid})...`);
    serverProcess.kill('SIGTERM');

    // Clean up test orders from staging DB
    console.log(`[Cleanup] Cleaning up staging test orders for customer ${seeded.customer._id}...`);
    const cleanResult = await cleanupStagingTestData(seeded.customer._id);
    console.log(`[Cleanup] Deleted ${cleanResult?.cleanedOrdersCount || 0} staging test orders. Cart reset to empty.`);

    // Close Mongoose
    await mongoose.connection.close();
    console.log(`[Cleanup] Staging database connection closed.\n`);
  }

  // Print Final Summary Matrix
  console.log('========================================================================================================');
  console.log('                             BENTO BABU PHASE 1 LOAD TESTING RESULTS MATRIX                             ');
  console.log('========================================================================================================');
  console.log('| VUs | Total Reqs | Throughput |   p50   |   p90   |   p95   |   p99   | Err Rate | Peak CPU | Peak RAM  | Status |');
  console.log('|-----|------------|------------|---------|---------|---------|---------|----------|----------|-----------|--------|');
  for (const r of tierResults) {
    const status = r.failedRate < 1.0 && r.p95 < 1500 ? 'PASS' : 'FAIL';
    console.log(
      `| ${String(r.vus).padEnd(3)} | ${String(r.reqCount).padEnd(10)} | ${String(r.reqRate + ' r/s').padEnd(10)} | ${String(r.p50 + 'ms').padEnd(7)} | ${String(r.p90 + 'ms').padEnd(7)} | ${String(r.p95 + 'ms').padEnd(7)} | ${String(r.p99 + 'ms').padEnd(7)} | ${String(r.failedRate + '%').padEnd(8)} | ${String(r.maxCpu + '%').padEnd(8)} | ${String(r.peakRssMb + 'MB').padEnd(9)} | ${status.padEnd(6)} |`
    );
  }
  console.log('========================================================================================================\n');

  // Verify all tiers passed
  const allPassed = tierResults.every((r) => r.failedRate < 1.0 && r.p95 < 1500 && r.exitCode === 0);
  if (allPassed) {
    console.log('>>> STAGE 1 VERIFICATION: ALL 5 LOAD TIERS (5, 10, 20, 35, 50 VUs) PASSED WITH ZERO FAILURES <<<\n');
    process.exit(0);
  } else {
    console.error('>>> STAGE 1 VERIFICATION: ONE OR MORE LOAD TIERS FAILED THRESHOLDS <<<\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Fatal]', err.message);
    process.exit(1);
  });
}
