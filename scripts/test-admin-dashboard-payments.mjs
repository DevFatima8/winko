import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const { planPaymentAssignments } = load("src\\lib\\paymentAssignments.ts", {
  "@/models": {}, "./mysql": {}, "./multiplayer-store": {},
});
const account = (id, provider = "jazzcash", extra = {}) => ({ _id: id, provider, isActive: true, ownerId: null, qrImage: `https://img/${id}`, ...extra });

test("ten receiving accounts are distributed equally; each player sees one per method, stable until submission", () => {
  const accounts = Array.from({ length: 10 }, (_, i) => account(`account-${i}`));
  accounts.push(account("easy", "easypaisa"), account("raast", "raast"));
  const users = [];
  for (let i = 0; i < 100; i++) {
    const user = { _id: `player-${i}` };
    const next = planPaymentAssignments(user, accounts, users, []);
    users.push({ ...user, ...next });
    assert.equal(Object.keys(next.assignedAccounts).length, 4);
    assert.equal(next.assignedAccounts.easypaisa, "easy");
    assert.equal(next.assignedAccounts.raast, "raast");
    assert.deepEqual(planPaymentAssignments(users.at(-1), accounts, users, []).assignedAccounts, next.assignedAccounts);
  }
  const counts = accounts.filter(a => a.provider === "jazzcash").map(a => users.filter(u => u.assignedAccounts.jazzcash === a._id).length);
  assert.deepEqual(counts, Array(10).fill(10));
});

test("a completed deposit rotates only its method, once; one account stays shared; disabled accounts are replaced", () => {
  const accounts = [account("a"), account("b"), account("c"), account("easy", "easypaisa")];
  let user = { _id: "p1", assignedAccounts: { jazzcash: "a", easypaisa: "easy", qr: "a" } };
  const deposit = { _id: "deposit-1", provider: "jazzcash", paymentMethod: "jazzcash", paymentAccountId: "a", createdAt: new Date() };
  const next = planPaymentAssignments(user, accounts, [user], [deposit]);
  assert.notEqual(next.assignedAccounts.jazzcash, "a");
  assert.equal(next.assignedAccounts.easypaisa, "easy");
  assert.equal(next.assignedAccounts.qr, "a");
  user = { ...user, ...next };
  assert.deepEqual(planPaymentAssignments(user, accounts, [user], [deposit]), next);
  const qrDeposit = { ...deposit, _id: "deposit-2", paymentMethod: "qr", paymentAccountId: "a" };
  assert.notEqual(planPaymentAssignments(user, accounts, [user], [deposit, qrDeposit]).assignedAccounts.qr, "a");
  const one = planPaymentAssignments({ _id: "p" }, [account("single")], [], []);
  assert.equal(one.assignedAccounts.jazzcash, "single");
  assert.equal(one.assignedAccounts.qr, "single");
  assert.equal(planPaymentAssignments({ _id: "p", ...one }, [account("single")], [], [{ ...deposit, paymentAccountId: "single" }]).assignedAccounts.jazzcash, "single");
  assert.equal(planPaymentAssignments({ _id: "p", assignedAccounts: { jazzcash: "a" } }, [account("a", "jazzcash", { isActive: false }), account("b")], [], []).assignedAccounts.jazzcash, "b");
});

test("referring-admin ownership is preserved for provider and QR assignments", () => {
  const accounts = [account("public"), account("own", "jazzcash", { ownerId: "staff" }), account("other", "easypaisa", { ownerId: "other-staff" })];
  const assigned = planPaymentAssignments({ _id: "p", referredBy: "staff" }, accounts, [], []).assignedAccounts;
  assert.deepEqual(assigned, { jazzcash: "own", qr: "own" });
});

test("wallet API returns exactly one provider account and one QR account, never the whole pool", async () => {
  const rows = [account("a"), account("b"), account("easy", "easypaisa"), account("raast", "raast")];
  const route = load("src\\app\\api\\player\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "p", role: "client", vipLevel: 0 }) },
    "@/lib/platform": {
      assignPaymentAccounts: async () => ({ jazzcash: "a", easypaisa: "easy", raast: "raast", qr: "b" }),
      getSettings: async () => ({ wallet: {}, vipLevels: [] }),
      vipInfo: () => ({ cur: {} }), withdrawnToday: async () => 0, withdrawalCountToday: async () => 0,
    },
    "@/lib/gateway": { gatewayConfig: async () => ({}) },
    "@/lib/winHold": { getWinHoldSummary: async () => ({}) },
    "@/models": {
      PaymentAccount: { find: () => ({ sort: () => ({ lean: async () => rows }) }) },
      User: { findById: () => ({ lean: async () => ({}) }) },
      Transaction: { countDocuments: async () => 0 },
    },
  });
  const response = await route.GET();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.accounts.map(row => row.id), ["a", "easy", "raast"]);
  assert.equal(data.qrAccount.id, "b");
});

test("deposit submission records the displayed Till ID account and method; forged choices never create requests", async () => {
  const writes = [];
  const route = load("src\\app\\api\\player\\deposit\\route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "p", role: "client", name: "Fixture" }) },
    "@/lib/platform": { assignPaymentAccounts: async () => ({ jazzcash: "a", qr: "b" }), getSettings: async () => ({ wallet: { minDeposit: 10 } }) },
    "@/lib/notifications": { notifyUser: async () => {}, notifyAdmins: async () => {} },
    "@/models": {
      oid: String, User: { findById: () => ({ lean: async () => ({}) }) },
      PaymentAccount: { findById: id => ({ lean: async () => account(id) }) },
      Transaction: { create: async data => { writes.push(data); return data; } },
    },
  });
  for (const [id, method, expected] of [["a", "jazzcash", 200], ["b", "qr", 200], ["b", "jazzcash", 409], ["a", "qr", 409]]) {
    const form = new FormData();
    form.set("amount", "100");
    form.set("paymentAccountId", id);
    form.set("paymentMethod", method);
    form.set("referenceId", "fixture-proof");
    assert.equal((await route.POST(new Request("http://localhost/api/player/deposit", { method: "POST", body: form }))).status, expected);
  }
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(row => [row.paymentAccountId, row.assignedAccountId, row.paymentMethod, row.provider]), [
    ["a", "a", "jazzcash", "jazzcash"], ["b", "b", "qr", "jazzcash"],
  ]);
});

test("simultaneous assignment requests serialize through one database transaction and preserve wallet data", async () => {
  const users = Array.from({ length: 20 }, (_, i) => ({ _id: `p-${String(i).padStart(2, "0")}`, role: "client", balance: 123 }));
  const accounts = [account("a"), account("b")];
  let queue = Promise.resolve(), locks = 0;
  const allocator = load("src\\lib\\paymentAssignments.ts", {
    "@/models": {},
    "./mysql": { isMysqlEnabled: () => true },
    "./multiplayer-store": { mysqlMultiplayerStore: { transact: (room, callback) => {
      assert.equal(room, "payments:assign");
      const result = queue.then(async () => {
        locks++;
        return callback({
          now: async () => Date.now(),
          get: async (_, id) => users.find(user => user._id === id),
          page: async table => table === "users" ? users : table === "paymentaccounts" ? accounts : [],
          put: async (_, id, value) => { users[users.findIndex(user => user._id === id)] = value; },
        });
      });
      queue = result.catch(() => undefined);
      return result;
    } } },
  });
  await Promise.all(users.map(user => allocator.assignAccounts(user._id)));
  assert.equal(locks, 20);
  assert.equal(users.filter(user => user.assignedAccounts.jazzcash === "a").length, 10);
  assert.equal(users.filter(user => user.assignedAccounts.jazzcash === "b").length, 10);
  assert.ok(users.every(user => user.balance === 123));
});

const { recordedPlayerLogins } = load("src\\lib\\dashboardLogins.ts");
test("statistics recover only actual last-login timestamps, deduplicate events and exclude staff", () => {
  const now = new Date("2026-10-30T20:00:00Z");
  const users = [
    { _id: "old", role: "client", lastLoginAt: now, lastLoginIp: "fixture" },
    { _id: "new", role: "agent", lastLoginAt: now, lastLoginIp: null },
    { _id: "staff", role: "admin", lastLoginAt: now },
    { _id: "never", role: "client", lastLoginAt: null },
  ];
  const events = [{ userId: "new", role: "agent", createdAt: now, ip: null }];
  const rows = recordedPlayerLogins(users, events);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.userId)), new Set(["old", "new"]));
  assert.equal(rows.find(row => row.userId === "old").createdAt, now);
  assert.equal(recordedPlayerLogins(users, rows).length, 2);
});

test("dashboard totals and date-filtered modal use real records, PKT dates and bounded earner percentages", async () => {
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00+05:00`);
  const at = new Date(start.getTime() + 3600000);
  const earlier = new Date(start.getTime() - 86400000);
  const users = [
    { _id: "p1", role: "client", name: "First", phone: "fixture", balance: 90, createdAt: earlier, lastLoginAt: at },
    { _id: "p2", role: "client", name: "New", phone: "fixture", balance: 10, createdAt: at, lastLoginAt: null },
  ];
  const results = [
    { _id: "r1", userId: "p1", gameId: "g", betAmount: 10, winAmount: 20, outcome: "win", createdAt: at },
    { _id: "r2", userId: "p2", gameId: "g", betAmount: 5, winAmount: 8, outcome: "win", createdAt: at },
    { _id: "r3", userId: "p1", gameId: "g", betAmount: 3, winAmount: 0, outcome: "lose", createdAt: earlier },
  ];
  const txs = [
    { _id: "t1", userId: "p1", type: "deposit", status: "approved", amount: 100, createdAt: at },
    { _id: "t2", userId: "p1", type: "deposit", status: "pending", amount: 999, createdAt: at },
    { _id: "t3", userId: "p1", type: "withdraw", status: "approved", amount: 25, createdAt: at },
  ];
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([op, rhs]) => op === "$in" ? rhs.includes(row[key]) :
        op === "$gte" ? new Date(row[key]) >= rhs : op === "$lt" ? new Date(row[key]) < rhs :
        op === "$ne" ? row[key] !== rhs : true);
    }
    return row[key] === value;
  });
  const model = rows => ({ find: (filter = {}) => {
    const query = { sort: () => query, lean: async () => rows.filter(row => matches(row, filter)) };
    return query;
  } });
  const route = load("src\\app\\api\\admin\\data\\route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "admin", dbRole: "admin", level: 2 }) },
    "@/lib/auth": { isStaff: () => true },
    "@/lib/platform": {}, "@/lib/gregmornCatalog": {},
    "@/lib/gameResultGames": { gameResultGameMap: () => new Map([["g", { name: "API Game" }]]) },
    "@/lib/dashboardLogins": { recordedPlayerLogins },
    "@/models": { User: model(users), GameResult: model(results), Transaction: model(txs), LoginEvent: model([]), PaymentAccount: model([]), SupportThread: model([]), Game: model([]) },
  });
  const response = await route.GET(new Request("http://localhost/api/admin/data?view=dashboard"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual([data.totalUsers, data.todayUsers, data.totalDeposits, data.totalWithdrawals, data.balance], [2, 1, 100, 25, 100]);
  assert.equal(data.repeatedPlayers.length, 1);
  const stats = data.statsRows.at(-1);
  assert.equal(stats.key, today);
  assert.deepEqual([stats.logins, stats.repeats, stats.winners, stats.repeatPct, stats.earningPct, stats.repeatEarningPct, stats.bet, stats.payout], [1, 1, 1, 100, 100, 100, 15, 28]);
  const detail = await route.GET(new Request("http://localhost/api/admin/data?view=dashboard-detail&metric=login-earners&period=today"));
  const body = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0].user, "First");
  assert.equal(body.summaries.find(row => row.label === "Winning users").value, 1);
  assert.equal(body.summaries.find(row => row.label === "Earner rate").value, "100.0%");
});

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object") return [];
  return [node, ...flatten(node.props?.children)];
}

test("dashboard cards open their detail modal immediately without fetching the dashboard again", async () => {
  let loader, cursor = 0;
  const states = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const oldFetch = globalThis.fetch;
  const data = {
    me: { name: "Fixture Admin", level: 2 }, totalUsers: 2, todayUsers: 1,
    totalDeposits: 10, totalWithdrawals: 5, pending: 0, activeAccounts: 2, balance: 20,
    resultStats: { c: 2, bet: 4, win: 2 }, todayDeposits: [{ amount: 10 }],
    todayResults: [{ userId: "p", betAmount: 4, winAmount: 2 }], todaySignups: [],
    repeatedPlayers: [], statsRows: [{ key: "2026-10-31", logins: 2, repeatPct: 50, earningPct: 50, repeatEarningPct: 100, winners: 1, repeats: 1, bet: 10, payout: 5, earned: 5 }],
    agents: 0, openChats: 0, unreadChats: 0, recentResults: [], recentUsers: [], pendingTx: [],
  };
  globalThis.fetch = async () => Response.json(data);
  try {
    const icons = new Proxy({}, { get: (_, name) => name === "__esModule" ? true : () => null });
    const client = load("src\\app\\admin\\Client.tsx", {
      react: { useState: initial => { const slot = cursor++; if (!(slot in states)) states[slot] = initial; return [states[slot], value => { states[slot] = value; }]; } },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": { default: () => null },
      "framer-motion": {}, "lucide-react": icons,
      "@/components/Shell": { fmt: value => `Rs. ${value}`, fmtDate: String, Card: () => null },
      "@/lib/useDb": { usePage: fn => { loader = fn; } },
    });
    client.default({});
    const view = await loader(new AbortController().signal);
    const render = () => { cursor = 0; return flatten(view.type(view.props)); };
    const user = { _id: "p", name: "Long player name", phone: "03123456789", balance: 90215762544.89, createdAt: "2026-10-31", lastLoginAt: "2026-10-31", registrationIp: "2001:db8:abcd:1234:5678:9012:abcd:ef12" };
    view.props.data.recentUsers = [user];
    view.props.data.todaySignups = [user];
    view.props.data.repeatedPlayers = [{ id: "p", name: user.name, registeredAt: user.createdAt, registrationIp: user.registrationIp, playedAt: user.lastLoginAt }];
    const mobile = render().filter(node => node.type?.name === "MobileDetails");
    assert.equal(mobile.length, 4, "all four dashboard table sections have a mobile layout");
    assert.deepEqual(mobile[0].props.fields.map(([label]) => label), ["Phone", "Balance", "Registered", "Last Login"]);
    assert.deepEqual(mobile[1].props.fields.map(([label]) => label), ["Phone", "Signup date", "Registration IP", "Today status"]);
    assert.deepEqual(mobile[2].props.fields.map(([label]) => label), ["Signup date", "Registration IP", "Played today"]);
    assert.equal(mobile[3].props.fields.length, 8, "mobile statistics retain all eight metrics");
    for (const node of mobile) {
      const details = flatten(node.type(node.props));
      assert.equal(details.filter(item => item.type === "dt").length, node.props.fields.length);
      assert.ok(details.filter(item => item.type === "dd").every(item => item.props.className.includes("[overflow-wrap:anywhere]")));
    }
    assert.equal(render().filter(node => node.props?.className === "hidden overflow-x-auto md:block").length, 4, "desktop tables stay available");
    for (const metric of ["Total Users", "Today's Payments", "Today's Earnings", "Repeat Players Today", "Today's Logins"]) {
      const card = render().find(node => node.props?.label === metric);
      assert.ok(card, metric);
      card.props.onClick();
      const modal = render().find(node => node.type?.name === "MetricDetailModal");
      assert.ok(modal.props.metric, `${metric} must open immediately`);
      modal.props.onClose();
      assert.equal(render().find(node => node.type?.name === "MetricDetailModal").props.metric, null);
    }
  } finally { globalThis.fetch = oldFetch; }
});
