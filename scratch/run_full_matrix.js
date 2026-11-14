/**
 * BentoBabu - Automated Lighthouse Matrix Runner
 * Runs 3 mobile and 3 desktop Lighthouse audits across all 10 customer frontend routes,
 * calculates median scores, and exports a comprehensive verification matrix.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3005';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const ROUTES = [
  { name: 'Homepage', path: '/' },
  { name: 'Menu', path: '/menu' },
  { name: 'Category (Gym & Fitness)', path: '/categories/gym-fitness' },
  { name: 'Product Detail', path: '/product/grilled-herb-chicken-quinoa-bowl' },
  { name: 'Cart', path: '/cart' },
  { name: 'Checkout', path: '/checkout' },
  { name: 'Login', path: '/login' },
  { name: 'Register', path: '/register' },
  { name: 'Account', path: '/account' },
  { name: 'Orders', path: '/orders' },
];

function getMedian(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function runAudit(url, isMobile, runIdx) {
  const tempPath = path.join(__dirname, `temp_lh_${Date.now()}_${runIdx}.json`);
  const flags = [
    `--output=json`,
    `--output-path="${tempPath}"`,
    `--only-categories=performance,accessibility,best-practices,seo`,
    isMobile
      ? `--form-factor=mobile --screenEmulation.mobile=true --throttling-method=simulate`
      : `--preset=desktop`,
    `--chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage"`,
    `--no-enable-error-reporting`,
    `--quiet`,
  ].join(' ');

  const cmd = `CHROME_PATH="${CHROME_PATH}" npx --yes lighthouse "${url}" ${flags}`;

  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 90000 });
    const content = fs.readFileSync(tempPath, 'utf8');
    fs.unlinkSync(tempPath);
    const data = JSON.parse(content);

    return {
      performance: Math.round((data.categories.performance?.score || 0) * 100),
      accessibility: Math.round((data.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((data.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((data.categories.seo?.score || 0) * 100),
      fcp: data.audits['first-contentful-paint']?.numericValue || 0,
      lcp: data.audits['largest-contentful-paint']?.numericValue || 0,
      tbt: data.audits['total-blocking-time']?.numericValue || 0,
      cls: data.audits['cumulative-layout-shift']?.numericValue || 0,
      si: data.audits['speed-index']?.numericValue || 0,
    };
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.error(`Audit failed for ${url} (Run ${runIdx}):`, err.message);
    throw err;
  }
}

async function main() {
  console.log('======================================================================');
  console.log(' BentoBabu - 10-Route Lighthouse Multi-Run Verification Matrix');
  console.log('======================================================================\n');

  const matrix = [];

  for (const route of ROUTES) {
    const fullUrl = `${BASE_URL}${route.path}`;
    console.log(`\nAuditing: ${route.name} (${fullUrl})`);

    // --- MOBILE AUDITS (3 runs) ---
    console.log('  Running Mobile Audits (3 runs)...');
    const mobileRuns = [];
    for (let i = 1; i <= 3; i++) {
      process.stdout.write(`    Mobile Run #${i}... `);
      const res = runAudit(fullUrl, true, i);
      mobileRuns.push(res);
      console.log(`P:${res.performance} A:${res.accessibility} BP:${res.bestPractices} SEO:${res.seo} | LCP:${(res.lcp / 1000).toFixed(2)}s`);
    }

    const mobileMedian = {
      performance: Math.round(getMedian(mobileRuns.map((r) => r.performance))),
      accessibility: Math.round(getMedian(mobileRuns.map((r) => r.accessibility))),
      bestPractices: Math.round(getMedian(mobileRuns.map((r) => r.bestPractices))),
      seo: Math.round(getMedian(mobileRuns.map((r) => r.seo))),
      fcp: +(getMedian(mobileRuns.map((r) => r.fcp)) / 1000).toFixed(2),
      lcp: +(getMedian(mobileRuns.map((r) => r.lcp)) / 1000).toFixed(2),
      tbt: Math.round(getMedian(mobileRuns.map((r) => r.tbt))),
      cls: +(getMedian(mobileRuns.map((r) => r.cls))).toFixed(3),
      si: +(getMedian(mobileRuns.map((r) => r.si)) / 1000).toFixed(2),
    };

    // --- DESKTOP AUDITS (3 runs) ---
    console.log('  Running Desktop Audits (3 runs)...');
    const desktopRuns = [];
    for (let i = 1; i <= 3; i++) {
      process.stdout.write(`    Desktop Run #${i}... `);
      const res = runAudit(fullUrl, false, i);
      desktopRuns.push(res);
      console.log(`P:${res.performance} A:${res.accessibility} BP:${res.bestPractices} SEO:${res.seo} | LCP:${(res.lcp / 1000).toFixed(2)}s`);
    }

    const desktopMedian = {
      performance: Math.round(getMedian(desktopRuns.map((r) => r.performance))),
      accessibility: Math.round(getMedian(desktopRuns.map((r) => r.accessibility))),
      bestPractices: Math.round(getMedian(desktopRuns.map((r) => r.bestPractices))),
      seo: Math.round(getMedian(desktopRuns.map((r) => r.seo))),
      fcp: +(getMedian(desktopRuns.map((r) => r.fcp)) / 1000).toFixed(2),
      lcp: +(getMedian(desktopRuns.map((r) => r.lcp)) / 1000).toFixed(2),
      tbt: Math.round(getMedian(desktopRuns.map((r) => r.tbt))),
      cls: +(getMedian(desktopRuns.map((r) => r.cls))).toFixed(3),
      si: +(getMedian(desktopRuns.map((r) => r.si)) / 1000).toFixed(2),
    };

    matrix.push({
      route: route.name,
      path: route.path,
      mobile: {
        runs: mobileRuns,
        median: mobileMedian,
      },
      desktop: {
        runs: desktopRuns,
        median: desktopMedian,
      },
    });
  }

  // Save report
  const outputPath = path.join(__dirname, 'lighthouse_final_matrix.json');
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2), 'utf8');

  console.log('\n======================================================================');
  console.log(' FINAL VERIFIED LIGHTHOUSE MEDIAN SUMMARY TABLE');
  console.log('======================================================================\n');

  console.log('| Route | Factor | Perf | A11y | BestPr | SEO | FCP | LCP | TBT | CLS |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
  for (const m of matrix) {
    console.log(`| ${m.route} | Mobile | ${m.mobile.median.performance} | ${m.mobile.median.accessibility} | ${m.mobile.median.bestPractices} | ${m.mobile.median.seo} | ${m.mobile.median.fcp}s | ${m.mobile.median.lcp}s | ${m.mobile.median.tbt}ms | ${m.mobile.median.cls} |`);
    console.log(`| ${m.route} | Desktop | ${m.desktop.median.performance} | ${m.desktop.median.accessibility} | ${m.desktop.median.bestPractices} | ${m.desktop.median.seo} | ${m.desktop.median.fcp}s | ${m.desktop.median.lcp}s | ${m.desktop.median.tbt}ms | ${m.desktop.median.cls} |`);
  }
  console.log('\nMatrix successfully exported to: ' + outputPath);
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});

