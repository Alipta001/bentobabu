const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadNotificationService(mockApiClient) {
  const filePath = path.resolve(__dirname, "../services/notificationService.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const customRequire = (id) => {
    if (id === "@/api/axios/axios") return { __esModule: true, default: mockApiClient };
    if (id === "@/api/endPoints/endPoints") {
      return {
        API_ENDPOINTS: {
          NOTIFICATIONS: {
            LIST: "/notifications",
            UNREAD_COUNT: "/notifications/unread-count",
            MARK_READ: (idStr) => `/notifications/${idStr}/read`,
            MARK_ALL_READ: "/notifications/read-all",
            PREFERENCES: "/notifications/preferences",
          },
        },
      };
    }
    if (id === "@/types") return {};
    return require(id);
  };

  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", transpiled.outputText);
  fn(mod.exports, customRequire, mod);
  return mod.exports.notificationService;
}

async function run() {
  console.log("Running BentoBabu Notification Error Propagation Tests...\n");

  // 1. API failure propagates original error instead of returning empty list
  {
    const networkErr = new Error("Network Error 503");
    const svc = loadNotificationService({
      get: async () => {
        throw networkErr;
      },
    });

    await assert.rejects(
      () => svc.getNotifications(),
      (err) => err === networkErr
    );
    console.log("  ✓ PASS: getNotifications propagates API errors");
  }

  // 2. Empty API response returns empty notifications array and 0 unreadCount
  {
    const svc = loadNotificationService({
      get: async () => ({
        data: { success: true, data: { notifications: [], unreadCount: 0 } },
      }),
    });

    const result = await svc.getNotifications();
    assert.deepStrictEqual(result, { notifications: [], unreadCount: 0 });
    console.log("  ✓ PASS: Empty API response returns empty array without error");
  }

  // 3. Populated API response preserves order, fields, and unreadCount
  {
    const svc = loadNotificationService({
      get: async () => ({
        data: {
          success: true,
          data: {
            notifications: [
              {
                _id: "n2",
                subject: "Order Preparing",
                message: "Your order is being prepared",
                isRead: false,
                createdAt: "2026-11-26T10:00:00.000Z",
              },
              {
                _id: "n1",
                subject: "Order Placed",
                message: "Your order has been placed",
                isRead: true,
                createdAt: "2026-11-26T09:50:00.000Z",
              },
            ],
          },
        },
      }),
    });

    const result = await svc.getNotifications();
    assert.strictEqual(result.notifications.length, 2);
    assert.strictEqual(result.notifications[0].id, "n2");
    assert.strictEqual(result.unreadCount, 1);
    console.log("  ✓ PASS: Populated response preserves ordering, fields, and unreadCount");
  }

  console.log("\nAll 3 notification service tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
