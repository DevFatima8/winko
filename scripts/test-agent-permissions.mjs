import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

function load(path, imports) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const auth = load(join("src", "lib", "auth.ts"), { "@/lib/betPresets": load(join("src", "lib", "betPresets.ts"), {}) });

function pendingPaymentRoute({ level = 3, signedIn = true, fail = false, rows = [] } = {}) {
  const queries = [];
  const route = load(join("src", "app", "api", "admin", "pending-payments", "route.ts"), {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/auth": auth,
    "@/lib/serverAuth": { getServerSessionUser: async () => signedIn ? { id: "staff", dbRole: level === 3 ? "owner" : level === 2 ? "admin" : level === 1 ? "subadmin" : "client", level } : null },
    "@/lib/mysql": { getMysqlPool: async () => ({ execute: async (sql, values) => {
      queries.push({ sql, values });
      if (fail) throw new Error("fixture database unavailable");
      return [rows];
    } }) },
  });
  return { ...route, queries };
}

test("Pending payment counts are uncached, pending-only, unbounded and scoped to each staff level", async () => {
  for (const level of [1, 2, 3]) {
    const fixture = pendingPaymentRoute({ level, rows: [{ type: "deposit", count: 701 }, { type: "withdraw", count: "23" }] });
    const response = await fixture.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { deposits: 701, withdrawals: 23 });
    assert.match(fixture.queries[0].sql, /status.*= 'pending'/);
    assert.ok(!fixture.queries[0].sql.includes("LIMIT"));
    assert.equal(fixture.queries[0].sql.includes("'$.referredBy'"), level === 1);
    assert.deepEqual(fixture.queries[0].values, level === 1 ? ["staff"] : []);
  }
  assert.deepEqual(await (await pendingPaymentRoute().GET()).json(), { deposits: 0, withdrawals: 0 });
});

test("Pending payment counts deny non-staff and surface database failures, not false zeroes", async () => {
  for (const options of [{ signedIn: false }, { level: 0 }]) {
    const fixture = pendingPaymentRoute(options);
    assert.equal((await fixture.GET()).status, 403);
    assert.equal(fixture.queries.length, 0);
  }
  const response = await pendingPaymentRoute({ fail: true }).GET();
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
});

test("Payment badges hide zero, show exact counts, and distinguish loading/stale errors", () => {
  const jsx = (type, props) => ({ type, props });
  const { PendingPaymentBadge } = load(join("src", "components", "admin", "PendingPaymentBadge.tsx"), {
    "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  assert.equal(PendingPaymentBadge({ count: 0, error: null, label: "Deposits" }), null);
  const badge = PendingPaymentBadge({ count: 701, error: null, label: "Deposits" });
  assert.equal(badge.props.children, 701);
  assert.equal(badge.props["aria-label"], "Deposits: 701 pending requests");
  assert.equal(PendingPaymentBadge({ error: null, label: "Deposits" }).props.children, "...");
  assert.match(PendingPaymentBadge({ count: 4, error: "Retrying", label: "Deposits" }).props["aria-label"], /Last known pending count: 4/);
});

test("Pending payment subscription polls without reload, handles actions/focus and cleans up", async () => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document, originalFetch = globalThis.fetch;
  const windowListeners = new Map(), documentListeners = new Map(), effects = [], intervals = [];
  let state = { counts: null, error: null }, requests = 0, cleaned = 0;
  globalThis.window = {
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (fn, delay) => { intervals.push({ fn, delay }); return 1; }, clearInterval: () => cleaned++,
    addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: (name) => windowListeners.delete(name),
  };
  globalThis.document = {
    hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: (name) => documentListeners.delete(name),
  };
  globalThis.fetch = async () => { requests++; return Response.json({ deposits: requests, withdrawals: 2 }); };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    const loaded = load(join("src", "components", "admin", "usePendingPayments.ts"), {
      react: {
        useState: () => [state, (next) => { state = typeof next === "function" ? next(state) : next; }],
        useEffect: (effect) => effects.push(effect),
      },
    });
    loaded.usePendingPayments("staff");
    const cleanup = effects[0]();
    await settle();
    assert.equal(requests, 1);
    assert.deepEqual(state.counts, { deposits: 1, withdrawals: 2 });
    assert.equal(intervals[0].delay, 5000);
    intervals[0].fn(); await settle();
    assert.equal(requests, 2);
    windowListeners.get("wx:admin-refresh")(); await settle();
    assert.equal(state.counts.deposits, 3);
    globalThis.document.hidden = true;
    intervals[0].fn(); await settle();
    assert.equal(requests, 3);
    globalThis.document.hidden = false;
    documentListeners.get("visibilitychange")(); await settle();
    assert.equal(requests, 4);
    globalThis.fetch = async () => Response.json({ error: "Unavailable" }, { status: 503 });
    windowListeners.get("online")(); await settle();
    assert.equal(state.counts.deposits, 4);
    assert.equal(state.error, "Unavailable");
    cleanup();
    assert.equal(cleaned, 1);
    assert.equal(windowListeners.size, 0);
    assert.equal(documentListeners.size, 0);
  } finally {
    globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch;
  }
});

test("Approve/reject refreshes payment data without reloading and displays processing failures", async () => {
  const jsx = (type, props) => ({ type, props });
  const flatten = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const events = [], decisions = [], stateUpdates = [];
  let result = { success: "Processed" };
  const rows = [{ _id: "fixture-payment", type: "deposit", status: "pending", createdAt: new Date().toISOString(), amount: 25, provider: "jazzcash", userId: { name: "Fixture", phone: "fixture" } }];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => Response.json({ rows: [{ _id: "fixture-payment", type: "deposit", status: "pending", createdAt: new Date().toISOString(), amount: 25, provider: "jazzcash", userId: { name: "Fixture", phone: "fixture" } }] });
  try {
    const loaded = load(join("src", "app", "admin", "transactions", "Client.tsx"), {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      react: { useState: (initial) => [initial, (next) => stateUpdates.push(next)] },
      "next/link": { default: () => {} },
      "@/components/Shell": { Card: () => {}, ProviderBadge: () => {}, StatusBadge: () => {}, fmt: String, fmtDate: String },
      "@/lib/clientActions": { processTransactionAction: async (id, decision) => { decisions.push({ id, decision }); return result; } },
      "@/lib/useDb": { useDb: () => ({ data: { status: "", rows }, error: null, reload: () => {} }) },
      "next/navigation": { useRouter: () => ({ push: () => {} }) },
      "react-dom": { createPortal: (node) => node },
      "@/lib/imageFile": {},
      "@/lib/adminLiveUpdates": { refreshAdminData: () => globalThis.window.dispatchEvent(new Event("wx:admin-refresh")) },
    });
    const view = loaded.default({ type: "deposit" });
    const page = view.type(view.props);
    const controls = flatten(page).find((node) => node.type?.name === "PendingActions");
    assert.ok(controls);
    const nodes = flatten(controls.type(controls.props));
    for (const decision of ["approved", "rejected"]) {
      const label = decision === "approved" ? "Approve" : "Reject";
      await nodes.find((node) => node.type === "button" && node.props.children === label).props.onClick();
    }
    assert.deepEqual(events, ["wx:admin-refresh", "wx:admin-refresh"]);
    assert.deepEqual(decisions.map(({ decision }) => decision), ["approved", "rejected"]);
    result = { error: "Fixture denied" };
    await nodes.find((node) => node.type === "button" && node.props.children === "Approve").props.onClick();
    assert.equal(events.length, 2);
    assert.ok(stateUpdates.includes("Fixture denied"));
  } finally { globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

function actionFixture(level = 3) {
  let lookups = 0;
  let resets = 0;
  const cleanups = [];
  const user = { role: level === 3 ? "owner" : level === 2 ? "admin" : "subadmin", passwordHash: "plain:fixture-password" };
  const models = { User: { findById: () => { lookups++; return { lean: async () => user }; } } };
  const actions = load(join("src", "lib", "actions.ts"), {
    "next/cache": { revalidatePath() {} },
    "@/models": models,
    "./auth": auth,
    "./serverAuth": { getServerSessionUser: async () => ({ id: "staff", name: "Agent", dbRole: user.role, role: "admin", level }) },
    "./platform": {}, "./notifications": {}, "./cloudinary": {}, "./gameCatalog": {},
    "./playerDataReset": { resetPlayerData: async () => { resets++; return { players: 1, deleted: 5 }; } },
    "./historySelection": { parseHistorySelection: (...args) => history.parseHistorySelection(...args) },
    "./selectedHistoryCleanup": { deleteSelectedHistory: async (options) => { cleanups.push(options); return { deleted: 2 }; } },
  });
  const form = new FormData();
  form.set("mode", "reset");
  form.set("userId", "player-1");
  form.set("password", "fixture-password");
  form.set("confirmation", "RESET PLAYER");
  return { actions, form, cleanups, counts: () => ({ lookups, resets }) };
}

test("Agent is above Super Admin; referral agents retain their player role", () => {
  assert.equal(auth.staffLevel("owner"), 3);
  assert.equal(auth.staffLevel("admin"), 2);
  assert.equal(auth.isStaff("agent"), false);
});

test("Super Admin and Sub Admin cannot invoke any history deletion or legacy player deletion", async () => {
  for (const level of [1, 2]) {
    const fixture = actionFixture(level);
    await assert.rejects(fixture.actions.resetPlayerHistoryAction(undefined, fixture.form), /Unauthorized/);
    await assert.rejects(fixture.actions.cleanupHistoryAction(undefined, fixture.form), /Unauthorized/);
    await assert.rejects(fixture.actions.deleteSelectedHistoryAction(undefined, fixture.form), /Unauthorized/);
    await assert.rejects(fixture.actions.deleteUserAction("player-1"), /Unauthorized/);
    assert.deepEqual(fixture.counts(), { lookups: 0, resets: 0 });
  }
});

test("Super Admin cannot create Super Admin, owner or forged roles", async () => {
  const fixture = actionFixture(2);
  for (const role of ["admin", "owner", "client", "invalid", ""]) {
    fixture.form.set("role", role);
    assert.ok((await fixture.actions.createSubAdminAction(undefined, fixture.form)).error);
  }
  assert.equal(fixture.counts().lookups, 0);
});

test("Super Admin can still create Sub Admin; only Agent can create Super Admin", async () => {
  for (const [level, role] of [[2, "subadmin"], [3, "admin"], [3, "subadmin"]]) {
    const created = [];
    const actions = load(join("src", "lib", "actions.ts"), {
      "next/cache": { revalidatePath() {} },
      "@/models": {
        oid: String,
        User: { find: () => ({ lean: async () => [] }), exists: async () => false, create: async (account) => created.push(account) },
        AdminLog: { create: async () => {} },
      },
      "./auth": auth,
      "./serverAuth": { getServerSessionUser: async () => ({ id: "staff", name: "Staff", role: "admin", dbRole: level === 3 ? "owner" : "admin", level }) },
      "./platform": { genReferralCode: () => "FIXTURE" }, "./notifications": {}, "./cloudinary": {}, "./gameCatalog": {},
    });
    const form = new FormData();
    form.set("name", "Fixture"); form.set("password", "fixture-password"); form.set("role", role);
    assert.ok((await actions.createSubAdminAction(undefined, form)).success);
    assert.equal(created.length, 1);
    assert.equal(created[0].role, role);
  }
});

const history = load(join("src", "lib", "historySelection.ts"), {});
function historyForm() {
  const form = new FormData();
  form.set("scope", "selected");
  form.append("categories", "deposits");
  form.set("period", "week");
  form.set("direction", "last");
  return form;
}

test("History selection calculates exact recent/older day, week, month, year and custom bounds", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  for (const [period, days] of [["day", 1], ["week", 7], ["month", 30], ["year", 365], ["custom", 19]]) {
    for (const direction of ["last", "older"]) {
      const form = historyForm();
      form.set("period", period); form.set("days", String(days)); form.set("direction", direction);
      const selection = history.parseHistorySelection(form, now);
      const cutoff = new Date(now.getTime() - days * 86400000);
      assert.deepEqual(selection.categories, ["deposits"]);
      assert.deepEqual(selection.before, direction === "last" ? now : cutoff);
      assert.deepEqual(selection.from, direction === "last" ? cutoff : undefined);
    }
  }
  const all = historyForm();
  all.set("scope", "all"); all.set("period", "all");
  assert.equal(history.parseHistorySelection(all, now).categories.length, history.HISTORY_CATEGORIES.length);
  assert.equal(history.parseHistorySelection(all, now).from, undefined);
  const multiple = historyForm(); multiple.set("count", "3");
  assert.equal(history.parseHistorySelection(multiple, now).from.getTime(), now.getTime() - 21 * 86400000);
  for (const count of ["0", "-1", "1.5", "Infinity", "999999"]) {
    multiple.set("count", count);
    assert.throws(() => history.parseHistorySelection(multiple, now));
  }
});

test("History selection rejects empty/forged scope, categories and invalid custom ranges", () => {
  for (const [key, value] of [["scope", ""], ["scope", "invalid"], ["categories", "users"], ["period", "invalid"], ["direction", "invalid"]]) {
    const form = historyForm(); form.set(key, value);
    assert.throws(() => history.parseHistorySelection(form));
  }
  const empty = historyForm(); empty.delete("categories");
  assert.throws(() => history.parseHistorySelection(empty));
  for (const days of ["", "0", "-1", "1.2", "NaN", "Infinity", "36501"]) {
    const form = historyForm(); form.set("period", "custom"); form.set("days", days);
    assert.throws(() => history.parseHistorySelection(form));
  }
});

test("Selected cleanup requires Agent password/phrase, validates selection, and forwards exact player scope", async () => {
  const fixture = actionFixture();
  const form = historyForm();
  form.set("userId", "player-1");
  assert.match((await fixture.actions.deleteSelectedHistoryAction(undefined, form)).error, /DELETE SELECTED HISTORY/);
  form.set("confirmation", "DELETE SELECTED HISTORY");
  form.set("password", "wrong");
  assert.match((await fixture.actions.deleteSelectedHistoryAction(undefined, form)).error, /password/i);
  assert.equal(fixture.cleanups.length, 0);
  form.set("password", "fixture-password");
  const result = await fixture.actions.deleteSelectedHistoryAction(undefined, form);
  assert.match(result.success, /2 selected history/);
  assert.match(result.success, /unchanged/);
  assert.equal(fixture.cleanups.length, 1);
  assert.equal(fixture.cleanups[0].userId, "player-1");
  assert.deepEqual(fixture.cleanups[0].selection.categories, ["deposits"]);
});

function selectedHistoryFixture({ fail = false, missing = false } = {}) {
  const queries = [];
  let committed = false, rolledBack = false, released = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith("SELECT id FROM users")) return [missing ? [] : [{ id: "player-1" }]];
      if (sql.startsWith("SELECT id FROM supportthreads")) return [[{ id: "thread-1" }]];
      if (fail && sql.startsWith("INSERT INTO adminlogs")) throw new Error("audit write failed");
      return [{ affectedRows: 1 }];
    },
    async commit() { committed = true; },
    async rollback() { rolledBack = true; },
    release() { released = true; },
  };
  return {
    ...load(join("src", "lib", "selectedHistoryCleanup.ts"), {
      "./mysql": { getMysqlPool: async () => ({ getConnection: async () => connection }) },
      "./multiplayer-cleanup": { ensureMultiplayerCleanupTables: async () => {}, lockMultiplayerCleanupRooms: async () => {}, cleanupMultiplayerPlayerData: async () => 0 },
    }),
    queries, state: () => ({ committed, rolledBack, released }),
  };
}

test("Selected history uses player/category/date scopes, preserves balances and audits transactionally", async () => {
  const fixture = selectedHistoryFixture();
  const selection = history.parseHistorySelection(historyForm(), new Date("2026-10-23T12:00:00Z"));
  const result = await fixture.deleteSelectedHistory({ userId: "player-1", selection, actorId: "owner", actorName: "Agent" });
  assert.deepEqual(result, { deleted: 1 });
  const deletes = fixture.queries.filter(({ sql }) => sql.startsWith("DELETE"));
  assert.equal(deletes.length, 1);
  assert.match(deletes[0].sql, /DELETE FROM `transactions`/);
  assert.match(deletes[0].sql, /status.*IN \('approved', 'rejected'\)/);
  assert.match(deletes[0].sql, /created_at < \? AND created_at >= \?/);
  assert.deepEqual(deletes[0].values, ["player-1", "deposit", selection.before, selection.from]);
  assert.ok(!fixture.queries.some(({ sql }) => sql.startsWith("UPDATE")));
  assert.deepEqual(fixture.state(), { committed: true, rolledBack: false, released: true });
});

test("All selected history preserves staff, active operations, sessions and win holds", async () => {
  const fixture = selectedHistoryFixture();
  const form = historyForm(); form.set("scope", "all"); form.set("period", "all");
  await fixture.deleteSelectedHistory({ selection: history.parseHistorySelection(form), actorId: "owner", actorName: "Agent" });
  const deletes = fixture.queries.filter(({ sql }) => sql.startsWith("DELETE"));
  assert.ok(deletes.every(({ sql }) => !/DELETE FROM `(users|devicesessions|winholds|games|settings|cardrounds|aviatorrounds|adminlogs)`/.test(sql)));
  assert.ok(deletes.every(({ sql }) => sql.includes("IN ('client', 'agent')") || sql.includes("'$.threadId'")));
  assert.ok(deletes.some(({ sql }) => sql.includes("'$.outcome'") && sql.includes("('win', 'lose')")));
  assert.ok(deletes.filter(({ sql }) => /DELETE FROM `(gameresults|chickengames|chickendashes)`/.test(sql)).every(({ sql }) => sql.includes("'$.poolPending'")));
  assert.ok(!deletes.some(({ sql }) => /DELETE FROM `dailypool/.test(sql)));
  assert.ok(deletes.some(({ sql }) => sql.includes("`gatewaysessions`") && sql.includes("'paid'")));
  assert.ok(!fixture.queries.some(({ sql }) => sql.startsWith("UPDATE")));
});

test("History cleanup rejects staff/missing players and rolls back on audit failure", async () => {
  for (const options of [{ missing: true }, { fail: true }]) {
    const fixture = selectedHistoryFixture(options);
    await assert.rejects(fixture.deleteSelectedHistory({ userId: "player-1", selection: history.parseHistorySelection(historyForm()), actorId: "owner", actorName: "Agent" }));
    assert.deepEqual(fixture.state(), { committed: false, rolledBack: true, released: true });
    if (options.missing) assert.ok(!fixture.queries.some(({ sql }) => sql.startsWith("DELETE")));
  }
});

test("History form wires category selection, custom days and period quantities for player/global scopes", () => {
  const jsx = (type, props) => ({ type, props });
  const flatten = (node) => {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    return [node, ...flatten(node.props?.children)];
  };
  for (const [scope, period, userId] of [["selected", "week", "player-1"], ["all", "custom", undefined], ["all", "all", "player-1"]]) {
    let index = 0;
    const loaded = load(join("src", "components", "admin", "SelectedHistoryForm.tsx"), {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      react: { useState: () => [[scope, period][index++], () => {}] },
      "@/lib/actions": { deleteSelectedHistoryAction: () => {} },
      "@/lib/historySelection": history,
      "./HistoryActionForm": { HistoryActionForm: () => {} },
    });
    const nodes = flatten(loaded.SelectedHistoryForm({ userId }));
    const inputs = nodes.filter((node) => node.type === "input");
    assert.equal(inputs.filter(({ props }) => props.name === "categories").length, scope === "selected" ? 9 : 0);
    assert.equal(inputs.some(({ props }) => props.name === "days"), period === "custom");
    assert.equal(inputs.some(({ props }) => props.name === "count"), period !== "all" && period !== "custom");
    assert.equal(inputs.find(({ props }) => props.name === "userId")?.props.value, userId);
    assert.equal(nodes[0].props.confirmation, "DELETE SELECTED HISTORY");
  }
});

test("Agent reset requires password, exact confirmation and a single deletion target", async () => {
  const fixture = actionFixture();
  fixture.form.set("confirmation", "incorrect");
  assert.match((await fixture.actions.resetPlayerHistoryAction(undefined, fixture.form)).error, /RESET PLAYER/);
  fixture.form.set("confirmation", "RESET PLAYER");
  fixture.form.set("password", "wrong");
  assert.match((await fixture.actions.resetPlayerHistoryAction(undefined, fixture.form)).error, /password/);
  fixture.form.set("mode", "delete");
  fixture.form.delete("userId");
  assert.match((await fixture.actions.resetPlayerHistoryAction(undefined, fixture.form)).error, /one player/);
  assert.equal(fixture.counts().resets, 0);
});

test("Valid Agent confirmation invokes reset and returns explicit success", async () => {
  const fixture = actionFixture();
  assert.match((await fixture.actions.resetPlayerHistoryAction(undefined, fixture.form)).success, /1 player/);
  assert.equal(fixture.counts().resets, 1);
});

function blockFixture({ level = 3, target = { role: "client", phone: "fixture", referredBy: "staff" }, save = true } = {}) {
  const writes = [], notifications = [], paths = [];
  let active = true;
  const actions = load(join("src", "lib", "actions.ts"), {
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/models": {
      oid: String,
      User: {
        findById: (_, fields) => ({ lean: async () => fields === "isActive" ? { isActive: active } : target }),
        updateOne: async (filter, update) => { writes.push({ filter, update }); if (save) active = update.$set.isActive; },
      },
      AdminLog: { create: async () => {} },
    },
    "./auth": auth,
    "./serverAuth": { getServerSessionUser: async () => ({ id: "staff", name: "Agent", role: "admin", dbRole: level === 3 ? "owner" : "subadmin", level }) },
    "./platform": {}, "./cloudinary": {}, "./gameCatalog": {},
    "./notifications": { notifyUser: async (...args) => notifications.push(args) },
  });
  return { actions, writes, notifications, paths };
}

test("Block/unblock confirms persisted state, notifies and invalidates both views", async () => {
  const fixture = blockFixture();
  const form = new FormData();
  form.set("reason", "Fixture reason");
  const blocked = await fixture.actions.toggleUserActiveAction("player-1", false, form);
  assert.equal(blocked.isActive, false);
  assert.ok(blocked.success);
  assert.equal(fixture.writes[0].update.$set.adminNote, "Fixture reason");
  assert.deepEqual(fixture.paths, ["/admin/users", "/admin/users/player-1"]);
  assert.equal(fixture.notifications.length, 1);
  const unblocked = await fixture.actions.toggleUserActiveAction("player-1", true);
  assert.equal(unblocked.isActive, true);
  assert.ok(unblocked.success);
});

test("Block failures and unauthorized targets return visible errors, never false success", async () => {
  for (const options of [{ target: null }, { target: { role: "admin" } }, { level: 1, target: { role: "client", referredBy: "other" } }]) {
    const fixture = blockFixture(options);
    assert.ok((await fixture.actions.toggleUserActiveAction("player-1", false)).error);
    assert.equal(fixture.writes.length, 0);
  }
  const failed = blockFixture({ save: false });
  assert.ok((await failed.actions.toggleUserActiveAction("player-1", false)).error);
  assert.equal(failed.notifications.length, 0);
});

function formFixture(filename, imports) {
  let submit;
  const jsx = (type, props) => ({ type, props });
  const component = load(join("src", "components", "admin", filename), {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState: (initial) => [initial, () => {}],
      useActionState: (action, initial) => { submit = (form) => action(initial, form); return [initial, () => {}, false]; },
    },
    "@/lib/adminLiveUpdates": { refreshAdminData: () => globalThis.window.dispatchEvent(new Event("wx:admin-refresh")) },
    ...imports,
  });
  return { component, submit: (form = new FormData()) => submit(form) };
}

test("Delete success navigates without refreshing a deleted detail; reset refreshes and errors stay put", async () => {
  const events = [];
  const originalWindow = globalThis.window;
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  try {
    for (const [result, destination, expected] of [
      [{ success: "Deleted" }, "/admin/users", ["navigate:/admin/users"]],
      [{ success: "Reset" }, undefined, ["wx:admin-refresh"]],
      [{ error: "Password incorrect" }, "/admin/users", []],
    ]) {
      events.length = 0;
      const fixture = formFixture("HistoryActionForm.tsx", {
        "next/navigation": { useRouter: () => ({ replace: (path) => events.push(`navigate:${path}`) }) },
      });
      fixture.component.HistoryActionForm({ action: async () => result, destination, confirmation: "DELETE PLAYER", label: "Delete" });
      assert.deepEqual(await fixture.submit(), result);
      assert.deepEqual(events, expected);
    }
  } finally { globalThis.window = originalWindow; }
});

test("Block control updates local badge before refreshing; failure preserves existing status", async () => {
  const events = [];
  const originalWindow = globalThis.window;
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  try {
    for (const result of [{ success: "Blocked", isActive: false }, { error: "Denied" }]) {
      events.length = 0;
      const fixture = formFixture("UserActiveForm.tsx", {
        "@/lib/actions": { toggleUserActiveAction: async (id, active) => { assert.equal(id, "player-1"); assert.equal(active, false); return result; } },
      });
      fixture.component.UserActiveForm({ userId: "player-1", isActive: true, onChange: (active) => events.push(active) });
      const state = await fixture.submit();
      assert.equal(state.isActive, result.success ? false : true);
      assert.deepEqual(events, result.success ? [false, "wx:admin-refresh"] : []);
    }
  } finally { globalThis.window = originalWindow; }
});

function resetFixture({ active = false, fail = false, missing = false, unsettled = false } = {}) {
  const queries = [];
  let committed = false, rolledBack = false, released = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith("SELECT id, data FROM users")) return [missing ? [] : [{ id: "player-1", data: { isActive: active } }]];
      if (sql.startsWith("SELECT id FROM dailypoolentries")) return [unsettled ? [{ id: "pending-pool-wager" }] : []];
      if (sql.startsWith("SELECT id FROM supportthreads")) return [[{ id: "thread-1" }]];
      if (sql.startsWith("SELECT JSON_UNQUOTE")) return [[{ beneficiaryId: "other-player", amount: 15 }]];
      if (fail && sql.startsWith("DELETE FROM `transactions`")) throw new Error("simulated write failure");
      return [{ affectedRows: 1 }];
    },
    async commit() { committed = true; },
    async rollback() { rolledBack = true; },
    release() { released = true; },
  };
  const reset = load(join("src", "lib", "playerDataReset.ts"), {
    "./sharedLegacyCardCleanup": load(join("src", "lib", "sharedLegacyCardCleanup.ts"), {}),
    "./mysql": { ensureMysqlReady: async () => true, getMysqlPool: async () => ({ getConnection: async () => connection }) },
    "./multiplayer-cleanup": { ensureMultiplayerCleanupTables: async () => {}, lockMultiplayerCleanupRooms: async () => {}, cleanupMultiplayerPlayerData: async () => 0 },
  });
  return { ...reset, queries, state: () => ({ committed, rolledBack, released }) };
}

test("Player reset/deletion cannot remove unresolved daily-pool obligations", async () => {
  for (const deleteAccount of [false, true]) {
    const fixture = resetFixture({ unsettled: true });
    await assert.rejects(fixture.resetPlayerData({ userId: "player-1", deleteAccount, actorId: "owner", actorName: "Agent" }), /Daily-pool wagers/);
    assert.deepEqual(fixture.state(), { committed: false, rolledBack: true, released: true });
    assert.ok(!fixture.queries.some(query => query.sql.startsWith("DELETE")));
  }
});

test("Individual reset uses one transaction, clears linked history, preserves configuration and audits", async () => {
  const fixture = resetFixture();
  await fixture.resetPlayerData({ userId: "player-1", actorId: "owner-1", actorName: "Agent" });
  assert.deepEqual(fixture.state(), { committed: true, rolledBack: false, released: true });
  const deletes = fixture.queries.filter(({ sql }) => sql.startsWith("DELETE"));
  for (const table of ["gameresults", "transactions", "winholds", "devicesessions", "supportmessages", "commissions"]) {
    assert.ok(deletes.some(({ sql }) => sql.includes(`\`${table}\``)), `Missing ${table}`);
  }
  assert.ok(deletes.every(({ sql, values }) => sql.includes("WHERE") && values.length > 0));
  assert.ok(!deletes.some(({ sql }) => /`(users|settings|games|paymentaccounts|cardrounds)`/.test(sql)));
  assert.ok(fixture.queries.some(({ sql }) => sql.includes("'$.balance', 0") && sql.includes("'$.vipBetPoints', 0")));
  assert.ok(fixture.queries.some(({ sql }) => sql.startsWith("INSERT INTO adminlogs")));
});

test("Active accounts and staff/nonexistent targets are rejected before deletion", async () => {
  for (const options of [{ active: true }, { missing: true }]) {
    const fixture = resetFixture(options);
    await assert.rejects(fixture.resetPlayerData({ userId: "staff-or-player", actorId: "owner-1", actorName: "Agent" }));
    assert.ok(!fixture.queries.some(({ sql }) => sql.startsWith("DELETE")));
    assert.deepEqual(fixture.state(), { committed: false, rolledBack: true, released: true });
    assert.match(fixture.queries[0].sql, /IN \('client', 'agent'\)/);
  }
});

test("Write failure rolls back without reporting success", async () => {
  const fixture = resetFixture({ fail: true });
  await assert.rejects(fixture.resetPlayerData({ userId: "player-1", actorId: "owner-1", actorName: "Agent" }), /simulated write failure/);
  assert.deepEqual(fixture.state(), { committed: false, rolledBack: true, released: true });
});

test("Account deletion detaches referrals; all-player reset also clears shared round histories", async () => {
  const deletion = resetFixture();
  await deletion.resetPlayerData({ userId: "player-1", deleteAccount: true, actorId: "owner-1", actorName: "Agent" });
  assert.ok(deletion.queries.some(({ sql, values }) => sql.startsWith("DELETE FROM `users`") && values[0] === "player-1"));
  assert.ok(deletion.queries.some(({ sql }) => sql.includes("'$.referredBy', NULL")));
  const all = resetFixture();
  await all.resetPlayerData({ actorId: "owner-1", actorName: "Agent" });
  for (const table of ["aviatorrounds", "cardrounds"]) {
    assert.ok(all.queries.some(({ sql }) => sql === `DELETE FROM \`${table}\` WHERE 1 = 1`));
  }
});

test("Only Agent receives Super Admin saved passwords; hashes never reach admin API responses", async () => {
  const rows = [
    { _id: "super", role: "admin", name: "Super", passwordPlain: "fixture-super-password", passwordHash: "private-hash" },
    { _id: "sub", role: "subadmin", name: "Sub", passwordPlain: "fixture-sub-password", passwordHash: "private-hash" },
  ];
  for (const level of [2, 3]) {
    const route = load(join("src", "app", "api", "admin", "data", "route.ts"), {
      "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
      "@/models": {
        User: { find: (filter) => ({ sort() { return this; }, lean: async () => rows.filter((row) => filter.role.$in.includes(row.role)) }) },
        SupportThread: { aggregate: async () => [] }, AdminLog: { aggregate: async () => [] },
      },
      "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "staff", dbRole: level === 3 ? "owner" : "admin", level }) },
      "@/lib/auth": auth, "@/lib/platform": {}, "@/lib/gameCatalog": {}, "@/lib/gameResultGames": {},
    });
    const response = await route.GET(new Request("http://localhost/api/admin/data?view=staff"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.staff.every((row) => !("passwordHash" in row)));
    if (level === 3) {
      assert.equal(body.staff.find((row) => row.role === "admin").passwordPlain, "fixture-super-password");
    } else {
      assert.ok(body.staff.every((row) => row.role !== "admin"));
      assert.ok(!JSON.stringify(body).includes("fixture-super-password"));
    }
  }
});
