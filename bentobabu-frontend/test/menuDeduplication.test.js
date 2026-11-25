const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", transpiled.outputText);
  fn(mod.exports, require, mod);
  return mod.exports;
}

const { deduplicateProductsById, getCanonicalProductId } = loadTsModule(
  path.resolve(__dirname, "../lib/menuUtils.ts")
);

console.log("Running BentoBabu Menu Search Deduplication Tests...\n");

// 1. Signature product appearing multiple times with same id is deduplicated to 1
{
  const signatureItem = {
    id: "prod_sig_1",
    name: "Signature Chicken Bento",
    isSignatureItem: true,
    isAvailable: true,
  };
  const regularItem = {
    id: "prod_reg_2",
    name: "Veg Quinoa Bowl",
    isSignatureItem: false,
    isAvailable: true,
  };

  const combined = [signatureItem, regularItem, { ...signatureItem }];
  const deduped = deduplicateProductsById(combined);

  assert.strictEqual(deduped.length, 2);
  assert.strictEqual(deduped[0].id, "prod_sig_1");
  assert.strictEqual(deduped[0].isSignatureItem, true);
  assert.strictEqual(deduped[1].id, "prod_reg_2");
  console.log("  ✓ PASS: Signature product deduplicated by canonical ID");
}

// 2. Different products with identical or similar names remain separate results
{
  const bowlA = { id: "prod_101", name: "Protein Teriyaki Bowl" };
  const bowlB = { id: "prod_102", name: "Protein Teriyaki Bowl" };
  const bowlC = { _id: "prod_103", name: "Protein Teriyaki Bowl (Spicy)" };

  const deduped = deduplicateProductsById([bowlA, bowlB, bowlC]);
  assert.strictEqual(deduped.length, 3);
  assert.deepStrictEqual(
    deduped.map((p) => getCanonicalProductId(p)),
    ["prod_101", "prod_102", "prod_103"]
  );
  console.log("  ✓ PASS: Distinct products with similar/identical names stay separate");
}

// 3. Fallback to _id deduplication when id and _id represent the same product
{
  const itemA = { id: "prod_201", name: "Herb Salmon Bento" };
  const itemADup = { _id: "prod_201", name: "Herb Salmon Bento" };

  const deduped = deduplicateProductsById([itemA, itemADup]);
  assert.strictEqual(deduped.length, 1);
  console.log("  ✓ PASS: Canonical ID deduplicates across id and _id");
}

console.log("\nAll 3 menu deduplication tests passed.");
