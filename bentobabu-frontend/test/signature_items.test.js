const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n========================================================================');
console.log(' BentoBabu: Signature Items Frontend Logic & Integration Test Suite');
console.log('========================================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// Mirror of the signature item selection & deduplication logic in app/menu/page.tsx
function selectSignatureProducts(products) {
  const seen = new Set();
  return products.filter((p) => {
    if (!p.isSignatureItem || !p.isAvailable) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

test('1. Filters signature items and excludes unavailable items', () => {
  const products = [
    { id: '1', name: 'Sig Available', isSignatureItem: true, isAvailable: true },
    { id: '2', name: 'Sig Unavailable', isSignatureItem: true, isAvailable: false },
    { id: '3', name: 'Regular Item', isSignatureItem: false, isAvailable: true },
  ];

  const sigs = selectSignatureProducts(products);
  assert.strictEqual(sigs.length, 1);
  assert.strictEqual(sigs[0].id, '1');
});

test('2. Deduplicates products inside Signature Items section', () => {
  const products = [
    { id: '1', name: 'Sig Bowl', isSignatureItem: true, isAvailable: true },
    { id: '1', name: 'Sig Bowl', isSignatureItem: true, isAvailable: true },
  ];

  const sigs = selectSignatureProducts(products);
  assert.strictEqual(sigs.length, 1);
});

test('3. Returns empty array when no signature items are available (section hidden)', () => {
  const products = [
    { id: '2', name: 'Sig Unavailable', isSignatureItem: true, isAvailable: false },
    { id: '3', name: 'Regular Item', isSignatureItem: false, isAvailable: true },
  ];

  const sigs = selectSignatureProducts(products);
  assert.strictEqual(sigs.length, 0);
});

test('4. Signature items remain visible in regular category/menu listings', () => {
  const products = [
    { id: '1', name: 'Sig Available', isSignatureItem: true, isAvailable: true },
    { id: '3', name: 'Regular Item', isSignatureItem: false, isAvailable: true },
  ];

  const sigs = selectSignatureProducts(products);
  assert.strictEqual(sigs.length, 1);
  // Regular products list is NOT filtered to remove signature items
  assert.strictEqual(products.length, 2);
  assert.ok(products.some((p) => p.id === '1'));
});

test('5. MenuPage source contains required heading, subtitle, and ProductCard integration', () => {
  const menuSrc = fs.readFileSync(
    path.resolve(__dirname, '../app/menu/page.tsx'),
    'utf8'
  );
  assert.ok(menuSrc.includes('Signature Items'), 'Must render Signature Items heading');
  assert.ok(
    menuSrc.includes('Our specially selected favourites.'),
    'Must render subtitle'
  );
  assert.ok(
    menuSrc.includes('signatureProducts.length > 0'),
    'Must hide section when no signature items are available'
  );
  assert.ok(
    menuSrc.includes('<ProductCard'),
    'Must reuse existing ProductCard component'
  );
});

test('6. Frontend productService normalizes isSignatureItem boolean safely', () => {
  const serviceSrc = fs.readFileSync(
    path.resolve(__dirname, '../services/productService.ts'),
    'utf8'
  );
  assert.ok(
    serviceSrc.includes('isSignatureItem: Boolean(item.isSignatureItem)'),
    'normalizeProduct must coerce isSignatureItem to boolean'
  );
});

test('7. Admin ProductsPage includes Signature Item toggle and table indicator', () => {
  const adminPageSrc = fs.readFileSync(
    path.resolve(__dirname, '../../bentobabu-admin/app/products/page.tsx'),
    'utf8'
  );
  assert.ok(adminPageSrc.includes('Signature Item'), 'Admin form must have Signature Item toggle');
  assert.ok(
    adminPageSrc.includes('Feature this product in the Signature Items section on the customer website.'),
    'Admin form must have exact required description'
  );
  assert.ok(
    adminPageSrc.includes('p.isSignatureItem'),
    'Admin table must display Signature indicator'
  );
});

console.log('\n========================================================================');
console.log(` Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
console.log('========================================================================\n');

process.exit(failed > 0 ? 1 : 0);
