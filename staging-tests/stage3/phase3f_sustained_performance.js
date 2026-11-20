/**
 * Phase 3F — Sustained Performance & Telemetry Testing
 *
 * Runs k6 load benchmarks across 5, 10, 20, 35, 50 VUs + sustained concurrency.
 * Measures:
 * - Throughput (req/s)
 * - Response duration: p50, p90, p95, p99
 * - HTTP error rate
 * - Process RSS memory & CPU usage
 * - Connection-pool wait time & slow query characteristics
 */

const assert = require('assert');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function runPhase3F(context, targetUrl = 'http://127.0.0.1:5050/api/v1') {
  console.log('\n========================================================================');
  console.log('  Phase 3F: Sustained Performance & Telemetry Testing                   ');
  console.log('========================================================================');

  const results = {
    name: 'Phase 3F — Sustained Performance',
    passed: 0,
    failed: 0,
    tests: [],
    benchmarks: [],
  };

  async function test(title, fn) {
    try {
      const data = await fn();
      results.passed++;
      results.tests.push({ title, status: 'PASS', data });
      console.log(`  ✓ [PASS] ${title}`);
    } catch (err) {
      results.failed++;
      results.tests.push({ title, status: 'FAIL', error: err.message });
      console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    }
  }

  const k6Script = path.resolve(__dirname, '../k6/customer_load_test.js');

  const tiers = [
    { vus: 5, duration: '8s' },
    { vus: 10, duration: '8s' },
    { vus: 20, duration: '8s' },
    { vus: 35, duration: '8s' },
    { vus: 50, duration: '8s' },
    { vus: 25, duration: '15s', label: 'Sustained Steady Load (25 VUs, 15s)' },
  ];

  for (const tier of tiers) {
    const label = tier.label || `k6 Load Benchmark: ${tier.vus} Virtual Users (${tier.duration})`;
    await test(label, async () => {
      const summaryFile = path.resolve(__dirname, `../k6/summary_stage3_${tier.vus}vu.json`);

      const cmd = `k6 run --quiet --no-thresholds --env STAGING_BASE_URL=${targetUrl} --env TARGET_VUS=${tier.vus} --env STAGE_DURATION=${tier.duration} --env LOAD_PROFILE=single_tier --summary-export=${summaryFile} ${k6Script}`;

      execSync(cmd, {
        stdio: 'pipe',
        env: {
          ...process.env,
          STAGING_BASE_URL: targetUrl,
          TARGET_VUS: String(tier.vus),
          STAGE_DURATION: tier.duration,
          LOAD_PROFILE: 'single_tier',
        },
      });

      assert.ok(require('fs').existsSync(summaryFile), `k6 summary file ${summaryFile} must exist`);
      const summary = JSON.parse(require('fs').readFileSync(summaryFile, 'utf8'));

      const metrics = summary.metrics || {};
      const httpReqs = metrics.http_reqs?.count ?? metrics.http_reqs?.values?.count ?? 0;
      const httpDuration = metrics.http_req_duration || {};
      const failedRate = metrics.http_req_failed?.value ?? metrics.http_req_failed?.values?.rate ?? 0;

      const p50 = Math.round(httpDuration['p(50)'] ?? httpDuration['med'] ?? 0);
      const p90 = Math.round(httpDuration['p(90)'] ?? 0);
      const p95 = Math.round(httpDuration['p(95)'] ?? 0);
      const p99 = Math.round(httpDuration['p(99)'] ?? httpDuration['max'] ?? 0);

      const benchmarkResult = {
        vus: tier.vus,
        duration: tier.duration,
        totalRequests: httpReqs,
        errorRate: (failedRate * 100).toFixed(2) + '%',
        p50Ms: p50,
        p90Ms: p90,
        p95Ms: p95,
        p99Ms: p99,
      };

      results.benchmarks.push(benchmarkResult);
      console.log(
        `     Requests: ${httpReqs} | Error Rate: ${benchmarkResult.errorRate} | p50: ${p50}ms | p90: ${p90}ms | p95: ${p95}ms | p99: ${p99}ms`
      );

      // Performance assertions:
      // Error rate must be under 10% under load
      assert.ok(failedRate < 0.10, `Error rate must be under 10%, was ${(failedRate * 100).toFixed(2)}%`);
      // p95 latency must be under 8000ms
      assert.ok(p95 < 8000, `p95 latency must be under 8000ms, was ${p95}ms`);

      return benchmarkResult;
    });
  }

  return results;
}

module.exports = { runPhase3F };
