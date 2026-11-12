import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const devices = load("src\\lib\\deviceSessions.ts", { "node:crypto": crypto });
const now = Date.now();
const session = (extra = {}) => ({
  _id: crypto.randomUUID(), userId: "player", sessionId: crypto.randomUUID(), deviceId: "browser",
  deviceName: "Chrome / Windows", userAgent: "Fixture", ip: "127.0.0.1", revokedAt: null,
  createdAt: new Date(now), lastSeenAt: new Date(now), expiresAt: new Date(now + 60000), ...extra,
});

test("active device sessions exclude revoked, expired and expired legacy rows, including the expiry boundary", () => {
  const live = session(), legacy = session({ expiresAt: undefined });
  assert.deepEqual(devices.activeDeviceSessions([
    live, legacy, session({ revokedAt: new Date() }), session({ expiresAt: new Date(now) }),
    session({ expiresAt: undefined, createdAt: new Date(now - devices.DEVICE_SESSION_TTL_MS) }),
    session({ expiresAt: "invalid" }),
  ], now), [live, legacy]);
});

function loginStore(users) {
  const committed = { users: new Map(users.map(user => [user._id, user])), devicesessions: new Map(), notifications: new Map() };
  let queue = Promise.resolve();
  let failNotice = false;
  const transact = work => {
    const result = queue.then(async () => {
      const staged = structuredClone(committed);
      const tx = {
        now: async () => now,
        get: async (table, id, lock) => { assert.equal(lock, true); return staged[table].get(id) ?? null; },
        findWhere: async (table, filter) => [...staged[table].values()].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)),
        insert: async (table, id, row) => {
          if (table === "notifications" && failNotice) throw new Error("Notice insert failed");
          staged[table].set(id, row);
        },
      };
      await work(tx);
      Object.assign(committed, staged);
    });
    queue = result.catch(() => {});
    return result;
  };
  return { committed, transact, fail: () => { failNotice = true; } };
}

test("Super Admin new browsers warn only owners; repeat/concurrent logins and IP changes do not repeat warnings", async () => {
  const store = loginStore([{ _id: "super", role: "admin", name: "Fixture Super", isActive: true }]);
  const input = { userId: "super", sessionId: "first", deviceId: "browser-a", deviceName: "Chrome", userAgent: "Fixture", ip: "127.0.0.1" };
  await Promise.all(["first", "second"].map(sessionId => store.transact(tx => devices.recordDeviceLogin(tx, { ...input, sessionId }))));
  await store.transact(tx => devices.recordDeviceLogin(tx, { ...input, sessionId: "third", ip: "127.0.0.2" }));
  assert.equal(store.committed.devicesessions.size, 3);
  assert.equal(store.committed.notifications.size, 1);
  const notice = [...store.committed.notifications.values()][0];
  assert.equal(notice.audience, "owners");
  assert.equal(notice.href, "/admin/devices");
  assert.equal(notice.type, "warning");
  assert.match(notice.body, /Fixture Super.*Chrome/);
  await store.transact(tx => devices.recordDeviceLogin(tx, { ...input, deviceId: "browser-b", sessionId: "fourth" }));
  assert.equal(store.committed.notifications.size, 2);
});

test("device identity is per account, other roles do not alert, and a failed warning rolls back the new session", async () => {
  const store = loginStore(["owner", "admin", "subadmin", "agent", "client"].map(role => ({ _id: role, role, name: role, isActive: true })));
  const input = { deviceId: "shared-browser", deviceName: "Chrome", userAgent: "Fixture", ip: null };
  for (const role of ["owner", "admin", "subadmin", "agent", "client"]) {
    await store.transact(tx => devices.recordDeviceLogin(tx, { ...input, userId: role, sessionId: role }));
  }
  assert.equal(store.committed.notifications.size, 1);
  store.fail();
  await assert.rejects(store.transact(tx => devices.recordDeviceLogin(tx, { ...input, userId: "admin", sessionId: "failed", deviceId: "another-browser" })), /Notice insert failed/);
  assert.equal(store.committed.devicesessions.size, 5);
  assert.equal(store.committed.notifications.size, 1);
});

function notificationService() {
  const writes = [], updates = [];
  const service = load("src\\lib\\notifications.ts", {
    "./mongo": { dbConnect: async () => {} },
    "@/models": {
      oid: String,
      Notification: { create: async row => { writes.push(row); return row; }, updateMany: async filter => updates.push(filter) },
      User: { find: () => ({ lean: async () => [{ _id: "team-player" }] }), findById: () => ({ lean: async () => ({ role: "admin" }) }) },
    },
  });
  return { ...service, writes, updates };
}

test("owner activity creates no notices; normal staff and system notifications retain recipients and links", async () => {
  const service = notificationService();
  assert.equal(await service.notifyUser("p", "Wallet", "Changed", "success", { actorRole: "owner" }), null);
  assert.equal(await service.notifyAdmins("Owner", "Changed", "info", { actorRole: "owner" }), null);
  assert.equal(service.writes.length, 0);
  await service.notifyUser("p", "Wallet", "Changed", "success", { actorRole: "admin", href: "/player/wallet" });
  await service.notifyAdmins("System", "Notice");
  assert.deepEqual(service.writes.map(row => [row.audience, row.href]), [["user", "/player/wallet"], ["admins", null]]);
});

test("shared poll/SSE/read filters expose security warnings to owners only, not referral agents or team admins", async () => {
  const service = notificationService();
  for (const role of ["owner", "admin", "subadmin", "agent", "client", null]) {
    const filter = await service.notificationFilter(role ? "account" : null, role);
    const audience = filter.$or?.find(row => row.audience?.$in)?.audience.$in ?? [];
    assert.equal(audience.includes("owners"), role === "owner");
    if (role === "subadmin") assert.deepEqual(filter.$or[1].userId.$in, ["team-player", "account"]);
  }
  await service.markAllNotificationsRead("account");
  assert.ok(!service.updates[0].$or[0].audience.$in.includes("owners"));
});

function overview(role, accounts, rows, fail = false) {
  const route = load("src\\app\\api\\admin\\devices\\route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/models": {
      User: { find: () => ({ sort: () => ({ lean: async () => accounts }) }) },
      DeviceSession: { find: () => ({ lean: async () => rows }) },
    },
    "@/lib/deviceSessions": devices,
    "@/lib/serverAuth": { getServerSessionUser: async () => role ? { dbRole: role } : null },
    "@/lib/mysql": { isMysqlEnabled: () => fail, getMysqlPool: async () => { throw new Error("Fixture unavailable"); } },
  });
  return route;
}

test("device overview is owner-only, deduplicates browsers, excludes inactive sessions and returns no credentials", async () => {
  for (const role of [null, "admin", "subadmin", "agent", "client"]) {
    assert.equal((await overview(role).GET(new Request("http://localhost/api/admin/devices"))).status, 403);
  }
  const response = await overview("owner", [
    { _id: "player", name: "Fixture", role: "client", isActive: true, passwordHash: "private-hash" },
    { _id: "blocked", name: "Blocked", role: "admin", isActive: false },
  ], [
    session(), session(), session({ deviceId: "other" }), session({ deviceId: "revoked", revokedAt: new Date() }),
    session({ deviceId: "old", expiresAt: new Date(now - 1) }), session({ userId: "blocked" }),
  ]).GET(new Request("http://localhost/api/admin/devices"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json();
  assert.deepEqual(result.users.map(user => user.deviceCount), [2, 0]);
  assert.ok(!JSON.stringify(result).includes("private-hash"));
  for (const row of result.users[0].devices) {
    assert.deepEqual(Object.keys(row).sort(), ["deviceName", "ip", "lastSeenAt"]);
  }
  assert.equal((await overview("owner", [], []).GET(new Request("http://localhost/api/admin/devices?page=0"))).status, 400);
  assert.equal((await overview("owner", [], [], true).GET(new Request("http://localhost/api/admin/devices"))).status, 503);
});

test("signed remembered-browser cookie survives logouts/IP changes but rejects tampering; expired sessions cannot authenticate", async () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "fixture-device-signing-secret";
  let requestCookie = "", authCookie = "", expired = false;
  const writes = [];
  const auth = load("src\\lib\\serverAuth.ts", {
    "node:crypto": crypto, "./mongo": { dbConnect: async () => {} },
    "next/headers": { cookies: async () => ({ get: () => ({ value: authCookie }) }) },
    "./auth": { toCurrentUser: row => ({ id: row._id, role: "admin", dbRole: row.role }) },
    "./playerDisplayId": {}, "./winHold": {}, "./mysql": { isMysqlEnabled: () => true },
    "./multiplayer-store": { mysqlMultiplayerStore: { transact: async (key, work) => work({}) } },
    "./deviceSessions": { ...devices, recordDeviceLogin: async (_tx, input) => writes.push(input) },
    "@/models": {
      DeviceSession: { findOne: () => ({ lean: async () => session({ expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)) }) }) },
      User: { findById: () => ({ lean: async () => ({ _id: "staff", role: "admin", isActive: true }) }) },
    },
  });
  try {
    const response = { cookies: { set: (name, value, options) => {
      assert.equal(options.httpOnly, true);
      if (name === "wx_device") requestCookie = `wx_device=${value}`;
      if (name === "wx_auth") authCookie = value;
    } } };
    const first = await auth.createDeviceSession("staff", new Request("http://localhost"), null);
    auth.setAuthCookie(response, "staff", first);
    const secondRequest = new Request("http://localhost", { headers: { cookie: requestCookie } });
    const second = await auth.createDeviceSession("staff", secondRequest, "127.0.0.2");
    assert.equal(writes[0].deviceId, writes[1].deviceId);
    assert.notEqual(first, second);
    auth.setAuthCookie(response, "staff", second, secondRequest);
    assert.equal((await auth.getServerSessionUser()).dbRole, "admin");
    expired = true;
    assert.equal(await auth.getServerSessionUser(), null);
    await auth.createDeviceSession("staff", new Request("http://localhost", { headers: { cookie: requestCookie + "tampered" } }), null);
    assert.notEqual(writes[2].deviceId, writes[0].deviceId);
  } finally {
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previousSecret;
  }
});

test("transaction approval carries owner actor context to bonus, commission and notifications while preserving audit", async () => {
  for (const role of ["owner", "admin"]) {
    const service = notificationService(), calls = [], logs = [];
    const transaction = { _id: "deposit", userId: "player", type: "deposit", status: "pending", amount: 1000 };
    const route = load("src\\app\\api\\admin\\transactions\\[id]\\route.ts", {
      "next/server": { NextResponse: { json: Response.json } },
      "@/models": {
        oid: String, Transaction: { findOne: () => ({ lean: async () => transaction }) },
        AdminLog: { create: async row => logs.push(row) },
      },
      "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "staff", name: "Fixture", dbRole: role, level: role === "owner" ? 3 : 2 }) },
      "@/lib/auth": { isStaff: () => true },
      "@/lib/notifications": service,
      "@/lib/platform": { recomputeVip: async () => {}, payDepositCommission: async (...args) => calls.push(["commission", args[2]]) },
      "@/lib/depositApproval": { approveDeposit: async (...args) => { calls.push(["bonus", args[3]]); return { transaction }; } },
    });
    const response = await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ decision: "approved" }) }), { params: Promise.resolve({ id: "deposit" }) });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [["bonus", role], ["commission", role]]);
    assert.equal(service.writes.length, role === "owner" ? 0 : 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actorRole, role);
  }
});

test("owner approval keeps principal and first-deposit bonus while omitting the transactional bonus notice", async () => {
  for (const role of ["owner", "admin"]) {
    const writes = [];
    const approval = load("src\\lib\\depositApproval.ts", {
      "node:crypto": crypto,
      "./mysql": { getMysqlPool: async () => ({ getConnection: async () => ({
        beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
        query: async sql => [sql.startsWith("SELECT data FROM users")
          ? [{ data: { balance: 100, totalDeposited: 0 } }]
          : sql.startsWith("SELECT data FROM transactions")
            ? [{ data: { _id: "deposit", userId: "player", type: "deposit", status: "pending", amount: 1000 } }] : []],
        execute: async (sql, values) => writes.push({ sql, values }),
      }) }) },
    });

    test("owner block/unblock and wallet actions keep state/audit updates but no notices; owner manual sending is explicitly refused", async () => {
      for (const role of ["owner", "admin"]) {
        const service = notificationService(), logs = [];
        const player = { role: "client", phone: "fixture", isActive: true, balance: 100, save: async () => {} };
        const actions = load("src\\lib\\actions.ts", {
          "next/cache": { revalidatePath: () => {} },
          "@/models": {
            oid: String, User: {
              findById: () => Object.assign(Promise.resolve(player), { lean: async () => player }),
              updateOne: async (_filter, update) => Object.assign(player, update.$set),
            },
            AdminLog: { create: async row => logs.push(row) },
          },
          "./auth": { isStaff: value => ["owner", "admin", "subadmin"].includes(value) },
          "./serverAuth": { getServerSessionUser: async () => ({ id: "staff", name: "Fixture", role: "admin", dbRole: role, level: role === "owner" ? 3 : 2 }) },
          "./platform": {}, "./notifications": service, "./cloudinary": {}, "./siteGameCatalog": {},
        });
        assert.ok((await actions.toggleUserActiveAction("player", false)).success);
        assert.equal(player.isActive, false);
        assert.ok((await actions.toggleUserActiveAction("player", true)).success);
        assert.equal(player.isActive, true);
        for (const direction of ["add", "remove"]) {
          const form = new FormData();
          form.set("id", "player"); form.set("amount", "25"); form.set("direction", direction);
          assert.ok((await actions.adjustUserBalanceAction(undefined, form)).success);
          assert.equal(player.balance, direction === "add" ? 125 : 100);
        }
        assert.equal(logs.length, 4);
        assert.equal(service.writes.length, role === "owner" ? 0 : 4);
        if (role === "owner") {
          const result = await actions.sendNotificationAction(undefined, new FormData());
          assert.match(result.error, /disabled/);
          assert.equal(result.success, undefined);
          assert.equal(service.writes.length, 0);
        }
      }
    });

    test("MySQL account lookup paginates/searches safely and device counts are not limited by a model history cap", async () => {
      const queries = [];
      const route = load("src\\app\\api\\admin\\devices\\route.ts", {
        "next/server": { NextResponse: { json: Response.json } }, "@/models": {},
        "@/lib/deviceSessions": devices,
        "@/lib/serverAuth": { getServerSessionUser: async () => ({ dbRole: "owner" }) },
        "@/lib/mysql": { isMysqlEnabled: () => true, getMysqlPool: async () => ({ execute: async (sql, values) => {
          queries.push({ sql, values });
          if (sql.startsWith("SELECT COUNT")) return [[{ total: "77" }]];
          if (sql.startsWith("SELECT data FROM users")) return [[{ data: JSON.stringify({ _id: "player", role: "client", name: "Fixture", passwordPlain: "never-return" }) }]];
          return [Array.from({ length: 10001 }, (_, i) => ({ data: session({ deviceId: `browser-${i}` }) }))];
        } }) },
      });
      const response = await route.GET(new Request("http://localhost/api/admin/devices?page=2&q=%27%25"));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.total, 77);
      assert.equal(result.users[0].deviceCount, 10001);
      assert.ok(!JSON.stringify(result).includes("never-return"));
      assert.match(queries[0].sql, /LIMIT 50 OFFSET 50/);
      assert.deepEqual(queries[0].values, ["'%", "'%", "'%", "'%"]);
      assert.ok(!queries[2].sql.includes("LIMIT"));
    });

    test("polling API preserves security alert links and prevents other accounts marking Agent warnings read", async () => {
      const service = notificationService(), queries = [], updates = [];
      for (const role of ["owner", "admin", "agent"]) {
        const route = load("src\\app\\api\\notifications\\route.ts", {
          "next/server": { NextResponse: { json: Response.json } },
          "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "staff", dbRole: role }) },
          "@/lib/mongo": { dbConnect: async () => {} },
          "@/lib/notifications": service,
          "@/models": {
            oid: String,
            Notification: {
              find: filter => ({ sort: () => ({ limit: () => ({ lean: async () => {
                queries.push(filter);
                return filter.$or[0].audience.$in.includes("owners") ? [{ _id: "alert", title: "New device", body: "Fixture", type: "warning", audience: "owners", href: "/admin/devices", createdAt: new Date(), readBy: [] }] : [];
              } }) }) }),
              updateMany: async filter => updates.push(filter),
            },
          },
        });
        const result = await (await route.GET()).json();
        assert.equal(result.items.length, role === "owner" ? 1 : 0);
        if (role === "owner") assert.equal(result.items[0].href, "/admin/devices");
        assert.equal((await route.POST()).status, 200);
        assert.equal(updates.at(-1).$or[0].audience.$in.includes("owners"), role === "owner");
      }
      assert.equal(queries.length, 3);
    });

    test("live Agent alerts are filtered, and a revoked or demoted owner stream closes before querying warnings", async () => {
      const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
      const service = notificationService(), timers = [], filters = [];
      let role = "owner", revoked = false, rows = [];
      globalThis.setInterval = callback => { timers.push(callback); return timers.length; };
      globalThis.clearInterval = () => {};
      const settle = () => new Promise(resolve => setImmediate(resolve));
      const route = load("src\\app\\api\\events\\route.ts", {
        "@/lib/serverAuth": { getServerSessionUser: async () => revoked ? null : { id: "staff", dbRole: role } },
        "@/lib/mongo": { dbConnect: async () => {} },
        "@/lib/platform": { getSettings: async () => ({ announcement: "", updatedAt: new Date(now) }) },
        "@/lib/notifications": service,
        "@/models": { Notification: { find: filter => ({ sort: () => ({ limit: () => ({ lean: async () => {
          filters.push(filter);
          return filter.$or[0].audience.$in.includes("owners") ? rows : [];
        } }) }) }) } },
      });
      try {
        for (const initialRole of ["owner", "admin"]) {
          role = initialRole; revoked = false; rows = []; timers.length = 0;
          const controller = new AbortController();
          const response = await route.GET(new Request("http://localhost/api/events", { signal: controller.signal }));
          const reader = response.body.getReader();
          await reader.read(); await settle();
          const announcement = await reader.read();
          assert.match(new TextDecoder().decode(announcement.value), /event: announcement/);
          rows = [{ _id: "new-alert", audience: "owners", title: "New device", type: "warning", href: "/admin/devices", createdAt: new Date() }];
          await timers[0](); await settle();
          assert.equal(filters.at(-1).$or[0].audience.$in.includes("owners"), initialRole === "owner");
          if (initialRole === "owner") {
            assert.match(new TextDecoder().decode((await reader.read()).value), /event: notification.*\n.*admin\/devices/);
            const previousCount = filters.length;
            revoked = true;
            await timers[0](); await settle();
            assert.equal(filters.length, previousCount);
            assert.equal((await reader.read()).done, true);
          }
          controller.abort();
          await reader.cancel();
        }
      } finally {
        globalThis.setInterval = originalInterval;
        globalThis.clearInterval = originalClear;
      }
    });
    const result = await approval.approveDeposit("deposit", "player", { processedById: "staff", processedByName: "Fixture", adminNote: null, accountName: null }, role);
    assert.equal(result.bonus, 50);
    assert.equal(JSON.parse(writes[0].values[0]).balance, 1150);
    assert.equal(writes.filter(row => row.sql.startsWith("INSERT INTO notifications")).length, role === "owner" ? 0 : 1);
  }
});
