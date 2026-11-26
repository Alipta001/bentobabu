const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadSeoModule(envUrl) {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = envUrl;
  }

  try {
    const filePath = path.resolve(__dirname, "../lib/seo.ts");
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
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  }
}

console.log("Running BentoBabu SEO Canonical URL Tests...\n");

assert.strictEqual(loadSeoModule(undefined).SITE_URL, "https://www.bentobabu.com");
console.log("  ✓ PASS: Default SITE_URL is https://www.bentobabu.com");

assert.strictEqual(loadSeoModule("https://bentobabu.com").SITE_URL, "https://www.bentobabu.com");
console.log("  ✓ PASS: Apex https://bentobabu.com normalizes to https://www.bentobabu.com");

assert.strictEqual(loadSeoModule("https://www.bentobabu.com/").SITE_URL, "https://www.bentobabu.com");
console.log("  ✓ PASS: Trailing slash stripped cleanly");

console.log("\nAll 3 SEO canonical URL tests passed.");
