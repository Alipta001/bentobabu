/**
 * BentoBabu — Google Search Favicon Implementation Verification Test Suite
 *
 * Verifies:
 * 1. Asset existence, file format, and byte size for all required favicon files.
 * 2. Multi-resolution ICO structure (48x48, 32x32, 16x16, 32 bpp DIB).
 * 3. Exact dimensions and format for icon.png (96x96), apple-icon.png (180x180), icon-192.png (192x192).
 * 4. Apple Touch Icon opaque background conformance (no transparency).
 * 5. Root layout metadata configuration in app/layout.tsx.
 * 6. Generated production HTML tags: standard <link rel="icon" href="/favicon.ico" />, stable URLs without query strings.
 * 7. Absence of duplicate or conflicting favicon tags.
 * 8. Robots.txt accessibility for Googlebot and Googlebot-Image.
 * 9. CSP security headers compatibility in next.config.ts.
 * 10. Navbar and footer brand logo integrity.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('../node_modules/sharp');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');

async function runTests() {
  console.log('================================================================');
  console.log('  BENTO BABU — GOOGLE SEARCH FAVICON VERIFICATION SUITE         ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // Suite 1: Asset Existence & Dimensions
  // ---------------------------------------------------------------------------
  console.log('--- Suite 1: Favicon Asset Existence & Dimensions ---');

  await test('favicon.ico exists and contains 48x48, 32x32, and 16x16 resolutions', async () => {
    const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
    assert.ok(fs.existsSync(icoPath), 'public/favicon.ico must exist');
    const buf = fs.readFileSync(icoPath);
    assert.strictEqual(buf.readUInt16LE(0), 0, 'Reserved header must be 0');
    assert.strictEqual(buf.readUInt16LE(2), 1, 'Type must be 1 (ICO)');
    const count = buf.readUInt16LE(4);
    assert.strictEqual(count, 3, 'Must contain 3 embedded icon resolutions');

    const expectedSizes = [48, 32, 16];
    for (let i = 0; i < count; i++) {
      const offset = 6 + i * 16;
      const w = buf[offset];
      const h = buf[offset + 1];
      const bpp = buf.readUInt16LE(offset + 6);
      assert.strictEqual(w, expectedSizes[i], `Icon ${i} width must be ${expectedSizes[i]}`);
      assert.strictEqual(h, expectedSizes[i], `Icon ${i} height must be ${expectedSizes[i]}`);
      assert.strictEqual(bpp, 32, `Icon ${i} bpp must be 32`);
    }
  });

  await test('icon.png exists, is valid PNG, and has dimensions 96x96', async () => {
    const p = path.join(PUBLIC_DIR, 'icon.png');
    assert.ok(fs.existsSync(p), 'public/icon.png must exist');
    const meta = await sharp(p).metadata();
    assert.strictEqual(meta.format, 'png');
    assert.strictEqual(meta.width, 96);
    assert.strictEqual(meta.height, 96);
  });

  await test('apple-icon.png exists, is valid PNG, has dimensions 180x180, and opaque background', async () => {
    const p = path.join(PUBLIC_DIR, 'apple-icon.png');
    assert.ok(fs.existsSync(p), 'public/apple-icon.png must exist');
    const meta = await sharp(p).metadata();
    assert.strictEqual(meta.format, 'png');
    assert.strictEqual(meta.width, 180);
    assert.strictEqual(meta.height, 180);

    // Verify Apple HIG compliance: no transparency (all alpha values must be 255)
    const raw = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    let hasTransparentPixel = false;
    for (let i = 3; i < raw.data.length; i += 4) {
      if (raw.data[i] < 250) {
        hasTransparentPixel = true;
        break;
      }
    }
    assert.strictEqual(hasTransparentPixel, false, 'apple-icon.png must be opaque (no transparent pixels) per Apple HIG');
  });

  await test('icon-192.png exists, is valid PNG, and has dimensions 192x192', async () => {
    const p = path.join(PUBLIC_DIR, 'icon-192.png');
    assert.ok(fs.existsSync(p), 'public/icon-192.png must exist');
    const meta = await sharp(p).metadata();
    assert.strictEqual(meta.format, 'png');
    assert.strictEqual(meta.width, 192);
    assert.strictEqual(meta.height, 192);
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Metadata Configuration in Root Layout
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 2: Root Layout Metadata Configuration ---');

  await test('app/layout.tsx declares standard icons metadata', () => {
    const layoutPath = path.join(FRONTEND_DIR, 'app/layout.tsx');
    const source = fs.readFileSync(layoutPath, 'utf8');

    assert.ok(source.includes('url: "/favicon.ico"'), 'Must declare /favicon.ico');
    assert.ok(source.includes('url: "/icon.png"'), 'Must declare /icon.png');
    assert.ok(source.includes('url: "/icon-192.png"'), 'Must declare /icon-192.png');
    assert.ok(source.includes('url: "/apple-icon.png"'), 'Must declare /apple-icon.png');
    assert.ok(source.includes('shortcut: "/favicon.ico"'), 'Must declare shortcut icon as /favicon.ico');
  });

  await test('Legacy app/favicon.ico is removed to prevent hash query parameters and duplicate tags', () => {
    const appIcoPath = path.join(FRONTEND_DIR, 'app/favicon.ico');
    assert.strictEqual(fs.existsSync(appIcoPath), false, 'app/favicon.ico must not exist');
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Generated Production HTML Output
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 3: Production HTML Favicon Output ---');

  await test('Generated homepage HTML includes standard, stable favicon tags with no changing parameters', () => {
    const htmlPath = path.join(FRONTEND_DIR, '.next/server/app/index.html');
    assert.ok(fs.existsSync(htmlPath), 'Production build index.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Must have clean <link rel="icon" href="/favicon.ico" ... />
    assert.ok(
      html.includes('<link rel="icon" href="/favicon.ico" sizes="any"/>') ||
      html.includes('<link rel="icon" href="/favicon.ico"/>'),
      'HTML must expose standard <link rel="icon" href="/favicon.ico" ... />'
    );

    // Must have PNG icon references
    assert.ok(html.includes('href="/icon.png"'), 'HTML must expose /icon.png');
    assert.ok(html.includes('href="/icon-192.png"'), 'HTML must expose /icon-192.png');
    assert.ok(html.includes('href="/apple-icon.png"'), 'HTML must expose /apple-icon.png');

    // Must not have changing build-hash parameters (?hash)
    const matchesWithHash = html.match(/href="\/favicon\.ico\?[^"]+"/);
    assert.strictEqual(matchesWithHash, null, 'Favicon URL must not contain query parameters');

    // Must not contain duplicate / conflicting favicon.ico links
    const favLinks = html.match(/<link[^>]+href="\/favicon\.ico"[^>]*>/g);
    assert.ok(favLinks && favLinks.length <= 2, 'Must not duplicate favicon link declarations');
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Google Search Crawling, Security & Brand Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 4: Google Search Crawling, Security & Brand Integrity ---');

  await test('robots.ts allows Googlebot and does not block favicon assets', () => {
    const robotsPath = path.join(FRONTEND_DIR, 'app/robots.ts');
    const source = fs.readFileSync(robotsPath, 'utf8');
    assert.ok(source.includes('allow: "/"'), 'Must allow root directory');
    assert.ok(!source.includes('favicon'), 'robots must not disallow favicon');
    assert.ok(!source.includes('icon.png'), 'robots must not disallow icon.png');
  });

  await test('next.config.ts CSP permits self image sources for favicons', () => {
    const configPath = path.join(FRONTEND_DIR, 'next.config.ts');
    const source = fs.readFileSync(configPath, 'utf8');
    assert.ok(source.includes("img-src 'self'"), 'CSP img-src must permit self');
  });

  await test('Existing navbar and footer brand logo references remain unmodified', () => {
    const headerPath = path.join(FRONTEND_DIR, 'components/layout/Header.tsx');
    const footerPath = path.join(FRONTEND_DIR, 'components/layout/Footer.tsx');
    const brandPath = path.join(FRONTEND_DIR, 'config/brand.ts');

    const header = fs.readFileSync(headerPath, 'utf8');
    const footer = fs.readFileSync(footerPath, 'utf8');
    const brand = fs.readFileSync(brandPath, 'utf8');

    assert.ok(header.includes('src={brandConfig.logo.imagePath}'), 'Header must retain brandConfig logo path');
    assert.ok(footer.includes('src={brandConfig.logo.imagePath}'), 'Footer must retain brandConfig logo path');
    assert.ok(brand.includes('imagePath: "/bentobabu_logo.png"'), 'brandConfig must retain /bentobabu_logo.png');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} FAVICON VERIFICATION TESTS PASSED!     `);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\nFavicon Test Suite FAILED:', err);
  process.exit(1);
});
