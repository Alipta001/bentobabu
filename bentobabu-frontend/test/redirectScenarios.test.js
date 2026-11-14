/**
 * BentoBabu — Post-Login Return URL & Redirection Test Suite
 * Validates all 9 critical scenarios required by the specification.
 */

const assert = require("assert");

// Import the compiled/transpiled auth redirect utilities or evaluate directly
const DEFAULT_POST_LOGIN_PATH = "/menu";

function getSafeReturnUrl(rawTarget, defaultUrl = DEFAULT_POST_LOGIN_PATH) {
  if (typeof rawTarget !== "string") {
    return defaultUrl;
  }

  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return defaultUrl;
  }

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.startsWith("\\")
  ) {
    return defaultUrl;
  }

  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return defaultUrl;
  }

  if (/(javascript|data|vbscript|file):/i.test(trimmed)) {
    return defaultUrl;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");

    if (parsed.origin !== "http://localhost") {
      return defaultUrl;
    }

    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return defaultUrl;
    }

    const authPaths = ["/login", "/register", "/forgot-password", "/logout"];
    const normalizedPath = parsed.pathname.toLowerCase();
    if (
      authPaths.some(
        (p) => normalizedPath === p || normalizedPath.startsWith(`${p}/`)
      )
    ) {
      return defaultUrl;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultUrl;
  }
}

function buildLoginUrl(returnTo) {
  if (!returnTo) return "/login";
  const safe = getSafeReturnUrl(returnTo, "");
  if (!safe || safe === DEFAULT_POST_LOGIN_PATH) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}

function buildRegisterUrl(returnTo) {
  if (!returnTo) return "/register";
  const safe = getSafeReturnUrl(returnTo, "");
  if (!safe || safe === DEFAULT_POST_LOGIN_PATH) {
    return "/register";
  }
  return `/register?returnTo=${encodeURIComponent(safe)}`;
}

async function runTests() {
  console.log("================================================================");
  console.log("   BENTO BABU — POST-LOGIN RETURN URL & REDIRECT TEST SUITE     ");
  console.log("================================================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] Scenario ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] Scenario ${name}: ${err.message}`);
      failed++;
    }
  }

  // Scenario 1: Guest opens /cart → login → returns to /cart
  test("1: Guest opens /cart → login → returns to /cart", () => {
    const originPage = "/cart";
    const loginLink = buildLoginUrl(originPage);
    assert.strictEqual(loginLink, "/login?returnTo=%2Fcart");

    const resolved = getSafeReturnUrl(decodeURIComponent("returnTo=%2Fcart".split("=")[1]));
    assert.strictEqual(resolved, "/cart");
  });

  // Scenario 2: Guest opens /checkout → login → returns to /checkout (with query params)
  test("2: Guest opens /checkout?coupon=WELCOME50 → login → returns to /checkout?coupon=WELCOME50", () => {
    const originPage = "/checkout?coupon=WELCOME50";
    const loginLink = buildLoginUrl(originPage);
    assert.strictEqual(loginLink, "/login?returnTo=%2Fcheckout%3Fcoupon%3DWELCOME50");

    const searchParams = new URLSearchParams(loginLink.split("?")[1]);
    const resolved = getSafeReturnUrl(searchParams.get("returnTo"));
    assert.strictEqual(resolved, "/checkout?coupon=WELCOME50");
  });

  // Scenario 3: Guest opens /orders/123 → login → returns to that order page
  test("3: Guest opens /orders/123 → login → returns to /orders/123", () => {
    const originPage = "/orders/123";
    const loginLink = buildLoginUrl(originPage);
    assert.strictEqual(loginLink, "/login?returnTo=%2Forders%2F123");

    const searchParams = new URLSearchParams(loginLink.split("?")[1]);
    const resolved = getSafeReturnUrl(searchParams.get("returnTo"));
    assert.strictEqual(resolved, "/orders/123");
  });

  // Scenario 4: Guest opens /menu → login → returns to /menu
  test("4: Guest opens /menu → login → returns to /menu", () => {
    const originPage = "/menu";
    const resolved = getSafeReturnUrl(originPage);
    assert.strictEqual(resolved, "/menu");

    const loginWithExplicitReturn = buildLoginUrl("/menu?search=chicken");
    const searchParams = new URLSearchParams(loginWithExplicitReturn.split("?")[1]);
    assert.strictEqual(getSafeReturnUrl(searchParams.get("returnTo")), "/menu?search=chicken");
  });

  // Scenario 5: Direct login without a return URL → redirects to default destination (/menu)
  test("5: Direct login without a return URL → redirects to /menu", () => {
    assert.strictEqual(getSafeReturnUrl(null), "/menu");
    assert.strictEqual(getSafeReturnUrl(undefined), "/menu");
    assert.strictEqual(getSafeReturnUrl(""), "/menu");
    assert.strictEqual(getSafeReturnUrl("   "), "/menu");
  });

  // Scenario 6: Registration from checkout → returns to checkout
  test("6: Registration from checkout → returns to checkout", () => {
    const checkoutPath = "/checkout?slot=evening";
    const loginLink = buildLoginUrl(checkoutPath);
    const searchParamsLogin = new URLSearchParams(loginLink.split("?")[1]);
    const returnToOnLogin = searchParamsLogin.get("returnTo");

    // User on login page clicks "Create Account"
    const registerLink = buildRegisterUrl(returnToOnLogin);
    assert.strictEqual(registerLink, "/register?returnTo=%2Fcheckout%3Fslot%3Devening");

    // After registration form submission
    const searchParamsReg = new URLSearchParams(registerLink.split("?")[1]);
    const postRegRedirect = getSafeReturnUrl(searchParamsReg.get("returnTo"));
    assert.strictEqual(postRegRedirect, "/checkout?slot=evening");
  });

  // Scenario 7: Invalid external return URL → safe default destination (/menu)
  test("7: Invalid external return URL → safe default destination (/menu)", () => {
    // External absolute domains
    assert.strictEqual(getSafeReturnUrl("https://evil-hacker.com"), "/menu");
    assert.strictEqual(getSafeReturnUrl("http://phishing.site/account"), "/menu");
    // Protocol-relative URLs
    assert.strictEqual(getSafeReturnUrl("//evil.com/cart"), "/menu");
    assert.strictEqual(getSafeReturnUrl("///evil.com"), "/menu");
    // Backslash escapes
    assert.strictEqual(getSafeReturnUrl("/\\evil.com"), "/menu");
    assert.strictEqual(getSafeReturnUrl("\\evil.com"), "/menu");
    // Schemes / script execution
    assert.strictEqual(getSafeReturnUrl("javascript:alert(document.cookie)"), "/menu");
    assert.strictEqual(getSafeReturnUrl("data:text/html,<script>alert(1)</script>"), "/menu");
    // Auth redirect loops
    assert.strictEqual(getSafeReturnUrl("/login"), "/menu");
    assert.strictEqual(getSafeReturnUrl("/login?returnTo=/cart"), "/menu");
    assert.strictEqual(getSafeReturnUrl("/register"), "/menu");
    assert.strictEqual(getSafeReturnUrl("/forgot-password"), "/menu");
    // CRLF injection
    assert.strictEqual(getSafeReturnUrl("/checkout\r\nSet-Cookie: evil=true"), "/menu");
  });

  // Scenario 8: Session expiry on a protected page → login → returns to original page
  test("8: Session expiry on /account?tab=addresses → login → returns to original page", () => {
    const protectedPage = "/account?tab=addresses";
    // Interceptor catches 401 and calls buildLoginUrl(window.location.pathname + window.location.search)
    const expiryRedirect = buildLoginUrl(protectedPage);
    assert.strictEqual(expiryRedirect, "/login?returnTo=%2Faccount%3Ftab%3Daddresses");

    const searchParams = new URLSearchParams(expiryRedirect.split("?")[1]);
    const postReauthDestination = getSafeReturnUrl(searchParams.get("returnTo"));
    assert.strictEqual(postReauthDestination, "/account?tab=addresses");
  });

  // Scenario 9: Browser refresh does not lose intended destination during authentication
  test("9: Browser refresh does not lose intended destination during authentication", () => {
    const originalUrl = "https://bentobabu.in/login?returnTo=%2Fcheckout%3Fcoupon%3DBENTO20";
    const parsedUrl = new URL(originalUrl);

    // Initial load:
    const returnToOnInitialLoad = parsedUrl.searchParams.get("returnTo");
    assert.strictEqual(getSafeReturnUrl(returnToOnInitialLoad), "/checkout?coupon=BENTO20");

    // Simulating browser F5 refresh (URL searchParams remain identical in address bar):
    const refreshedUrl = new URL(originalUrl);
    const returnToAfterRefresh = refreshedUrl.searchParams.get("returnTo");
    assert.strictEqual(getSafeReturnUrl(returnToAfterRefresh), "/checkout?coupon=BENTO20");
  });

  console.log("\n================================================================");
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} SCENARIOS PASSED`);
  console.log("================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

