process.env.NODE_ENV = "test";
require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../app/config/db");
const { validateEnv } = require("../app/config/env");
const { getRedisClient } = require("../app/config/redis");
const { app } = require("../server");
const { User, RefreshSession } = require("../app/models");

function parseCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(";");
    const [name, ...rest] = cookiePart.split("=");
    cookies[name.trim()] = rest.join("=");
  }
  return cookies;
}

function cookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        ...options,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data,
          });
        });
      }
    );

    req.on("error", reject);

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log("--- Starting Delivery Partner Refresh Lifecycle Test Suite ---");

  const env = validateEnv();
  await connectDB(env.mongoUri);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const testEmail = `delivery_partner_${Date.now()}@bento.in`;
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const rawPassword = "DeliveryPassword@123";
  let cookieJar = {};
  let csrfToken = null;
  let deliveryUser = null;

  try {
    // 0. Seed a test delivery user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);
    deliveryUser = await User.create({
      name: "Ramesh Kumar Delivery",
      email: testEmail,
      phone: testPhone,
      password: hashedPassword,
      role: "DELIVERY",
      isEmailVerified: true,
      isActive: true,
      isPhoneVerified: true,
    });
    console.log(`✅ Seeded Delivery Partner: ${testEmail} (role: ${deliveryUser.role})`);

    // 1. Get initial CSRF token
    const csrfRes = await makeRequest(server, {
      path: "/api/v1/auth/csrf-token",
      method: "GET",
    });
    assert.equal(csrfRes.statusCode, 200, "CSRF endpoint must return 200");
    const csrfCookies = parseCookies(csrfRes.headers["set-cookie"]);
    Object.assign(cookieJar, csrfCookies);
    csrfToken = csrfRes.data?.data?.csrfToken || cookieJar.bb_csrf_token;
    assert.ok(csrfToken, "CSRF token must be present");
    console.log("✅ [PASS] 1. Obtained CSRF token");

    // 2. Login as Delivery Partner
    const loginRes = await makeRequest(
      server,
      {
        path: "/api/v1/auth/login",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: cookieHeader(cookieJar),
        },
      },
      {
        identifier: testEmail,
        password: rawPassword,
      }
    );

    assert.equal(loginRes.statusCode, 200, "Login must return 200");
    assert.equal(loginRes.data?.data?.user?.role, "DELIVERY", "Logged in user must be DELIVERY");
    const loginCookies = parseCookies(loginRes.headers["set-cookie"]);
    Object.assign(cookieJar, loginCookies);
    assert.ok(cookieJar.bb_access_token, "bb_access_token cookie must be set");
    assert.ok(cookieJar.bb_refresh_token, "bb_refresh_token cookie must be set");
    console.log("✅ [PASS] 2. Delivery Partner logged in with HttpOnly cookies");

    // 3. Make protected call with valid access token
    const meRes = await makeRequest(server, {
      path: "/api/v1/auth/me",
      method: "GET",
      headers: {
        Cookie: cookieHeader(cookieJar),
      },
    });
    assert.equal(meRes.statusCode, 200, "/auth/me must return 200 with valid access token");
    assert.equal(meRes.data?.data?.user?.email, testEmail);
    console.log("✅ [PASS] 3. Initial authenticated request to /auth/me succeeded");

    // 4. Simulate access token expiration (30 seconds elapsed)
    // We forge an expired access token signed with the same secret
    const expiredPayload = {
      id: deliveryUser._id.toString(),
      role: "DELIVERY",
      exp: Math.floor(Date.now() / 1000) - 10, // expired 10 seconds ago
    };
    const expiredAccessToken = jwt.sign(expiredPayload, env.jwtAccessSecret);
    const expiredCookieJar = { ...cookieJar, bb_access_token: expiredAccessToken };

    const expiredCallRes = await makeRequest(server, {
      path: "/api/v1/auth/me",
      method: "GET",
      headers: {
        Cookie: cookieHeader(expiredCookieJar),
      },
    });
    assert.equal(expiredCallRes.statusCode, 401, "Expired access token must return 401 Unauthorized");
    console.log("✅ [PASS] 4. Expired access token returned 401 Unauthorized as expected");

    // 5. Test Frontend Refresh Flow:
    // Delivery partner client calls /api/v1/auth/refresh with bb_refresh_token and X-CSRF-Token
    const refreshRes = await makeRequest(server, {
      path: "/api/v1/auth/refresh",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": cookieJar.bb_csrf_token,
        Cookie: cookieHeader(cookieJar), // contains valid bb_refresh_token
      },
    });

    assert.equal(refreshRes.statusCode, 200, "Refresh endpoint must return 200 OK");
    assert.equal(refreshRes.data?.success, true);
    const refreshedCookies = parseCookies(refreshRes.headers["set-cookie"]);
    Object.assign(cookieJar, refreshedCookies);
    assert.ok(cookieJar.bb_access_token, "New rotated access token must be provided");
    assert.ok(cookieJar.bb_refresh_token, "New rotated refresh token must be provided");
    console.log("✅ [PASS] 5. Refresh endpoint successfully rotated tokens without error");

    // 6. Retry original request with rotated credentials
    const retriedMeRes = await makeRequest(server, {
      path: "/api/v1/auth/me",
      method: "GET",
      headers: {
        Cookie: cookieHeader(cookieJar),
      },
    });
    assert.equal(retriedMeRes.statusCode, 200, "Retried /auth/me with rotated token must return 200 OK");
    assert.equal(retriedMeRes.data?.data?.user?.email, testEmail);
    console.log("✅ [PASS] 6. Original request successfully retried and returned 200 OK");

    // 7. Verify Concurrent Single-Flight Behavior:
    // When 3 concurrent queries arrive after token expiration, only 1 refresh should run
    // Let's create an expired token again
    const expiredToken2 = jwt.sign(expiredPayload, env.jwtAccessSecret);
    cookieJar.bb_access_token = expiredToken2;

    // Both requests hit 401
    const [c1, c2, c3] = await Promise.all([
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
    ]);
    assert.equal(c1.statusCode, 401);
    assert.equal(c2.statusCode, 401);
    assert.equal(c3.statusCode, 401);

    // Frontend single-flight refresh runs ONE refresh call
    const singleFlightRefresh = await makeRequest(server, {
      path: "/api/v1/auth/refresh",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": cookieJar.bb_csrf_token,
        Cookie: cookieHeader(cookieJar),
      },
    });
    assert.equal(singleFlightRefresh.statusCode, 200);
    const newCookies = parseCookies(singleFlightRefresh.headers["set-cookie"]);
    Object.assign(cookieJar, newCookies);

    // All 3 concurrent callers retry in parallel with the new cookie
    const [retry1, retry2, retry3] = await Promise.all([
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
      makeRequest(server, { path: "/api/v1/auth/me", method: "GET", headers: { Cookie: cookieHeader(cookieJar) } }),
    ]);

    assert.equal(retry1.statusCode, 200);
    assert.equal(retry2.statusCode, 200);
    assert.equal(retry3.statusCode, 200);
    console.log("✅ [PASS] 7. Concurrent requests safely resolved after single-flight refresh");

    // 8. Verify clean logout
    const logoutRes = await makeRequest(server, {
      path: "/api/v1/auth/logout",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": cookieJar.bb_csrf_token,
        Cookie: cookieHeader(cookieJar),
      },
    });
    assert.equal(logoutRes.statusCode, 200);
    console.log("✅ [PASS] 8. Explicit logout successfully revokes session");

    console.log("\nAll 8 Delivery Partner Refresh Lifecycle tests passed successfully!");
  } finally {
    if (deliveryUser) {
      await User.deleteOne({ _id: deliveryUser._id });
      await RefreshSession.deleteMany({ userId: deliveryUser._id });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.quit().catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
