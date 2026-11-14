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

async function supportFixture() {
  const { Model } = load("src\\lib\\localdb.ts");
  const models = {
    oid: String,
    SupportThread: new Model("SupportThread", { collection: "supportthreads", defaults: () => ({ userId: null, assignedTo: null, unreadForAdmin: 0, unreadForUser: 0, lastMessageAt: new Date(), status: "open" }) }),
    SupportMessage: new Model("SupportMessage", { collection: "supportmessages" }),
    User: new Model("User", { collection: "users" }),
  };
  models.SupportThread.updateOneAtomic = models.SupportThread.updateOne.bind(models.SupportThread);
  let session = { id: "staff", role: "admin", dbRole: "admin", level: 2, name: "Staff" };
  const server = load("src\\lib\\supportServer.ts", {
    "node:crypto": { randomUUID: () => "guest" },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "guest" }) }) },
    "@/models": models,
    "./platform": { getSettings: async () => ({ support: {} }), supportOnline: () => true },
    "./mongo": { dbConnect: async () => {} },
    "./serverAuth": { getServerSessionUser: async () => session },
    "./notifications": { notifyAdmins: async () => {} },
  });
  const route = load("src\\app\\api\\admin\\support\\route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/supportServer": server,
  });
  const count = async () => {
    const response = await route.GET(new Request("http://localhost/api/admin/support?unread=1"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return (await response.json()).unread;
  };
  return { ...server, ...models, route, count, setSession: value => { session = value; } };
}

test("support count sums messages beyond the 150-chat inbox limit and preserves team/assignment visibility", async () => {
  const fixture = await supportFixture();
  await fixture.User.create({ _id: "own-player", referredBy: "staff", role: "client" });
  for (let i = 0; i < 151; i++) await fixture.SupportThread.create({ userId: "other-player", unreadForAdmin: 2 });
  await fixture.SupportThread.create({ userId: "own-player", unreadForAdmin: 3 });
  await fixture.SupportThread.create({ userId: "own-player", assignedTo: "another-admin", unreadForAdmin: 4 });
  await fixture.SupportThread.create({ assignedTo: "staff", unreadForAdmin: 5 });
  await fixture.SupportThread.create({ unreadForAdmin: 6 });
  assert.equal(await fixture.count(), 320);
  fixture.setSession({ id: "staff", role: "admin", dbRole: "subadmin", level: 1 });
  assert.equal(await fixture.count(), 8);
  const visible = await fixture.listAdminSupportThreads();
  assert.equal(visible.threads.reduce((sum, thread) => sum + thread.unread, 0), 8);
  fixture.setSession(null);
  assert.equal((await fixture.route.GET(new Request("http://localhost/api/admin/support?unread=1"))).status, 401);
  fixture.setSession({ id: "player", role: "client" });
  assert.equal((await fixture.route.GET(new Request("http://localhost/api/admin/support?unread=1"))).status, 401);
});

test("incoming messages increment the badge total and reading one chat leaves other unread messages intact", async () => {
  const fixture = await supportFixture();
  fixture.setSession({ id: "player", role: "client", dbRole: "client", name: "Player" });
  await fixture.sendClientSupportMessage("first");
  await fixture.sendClientSupportMessage("second");
  const playerThread = await fixture.SupportThread.findOne({ userId: "player" }).lean();
  const other = await fixture.SupportThread.create({ unreadForAdmin: 4 });
  fixture.setSession({ id: "staff", role: "admin", dbRole: "admin", level: 2 });
  assert.equal(await fixture.count(), 6);
  const messages = await fixture.getAdminSupportMessages(playerThread._id);
  assert.deepEqual(messages.messages.map(message => message.text), ["first", "second"]);
  assert.equal(await fixture.count(), 4);
  await fixture.getAdminSupportMessages(other._id);
  assert.equal(await fixture.count(), 0);
});

test("reading latest messages and replying cannot erase a message arriving during the read", async () => {
  const fixture = await supportFixture();
  const thread = await fixture.SupportThread.create({ userId: "player", unreadForAdmin: 1 });
  for (let i = 0; i < 301; i++) {
    await fixture.SupportMessage.create({ threadId: thread._id, from: "user", text: String(i), createdAt: new Date(i * 1000) });
  }
  const find = fixture.SupportMessage.find.bind(fixture.SupportMessage);
  let arriveDuringRead = true;
  fixture.SupportMessage.find = (...args) => {
    const query = find(...args);
    const lean = query.lean.bind(query);
    query.lean = async () => {
      const messages = await lean();
      if (arriveDuringRead) {
        arriveDuringRead = false;
        await fixture.SupportMessage.create({ threadId: thread._id, from: "user", text: "new arrival" });
        await fixture.SupportThread.updateOneAtomic({ _id: thread._id }, { $inc: { unreadForAdmin: 1 }, $set: { lastMessageAt: new Date() } });
      }
      return messages;
    };
    return query;
  };
  const first = await fixture.getAdminSupportMessages(thread._id);
  assert.equal(first.messages.length, 300);
  assert.equal(first.messages[0].text, "1");
  assert.equal(first.messages.at(-1).text, "300");
  assert.equal(await fixture.count(), 2, "a raced read conservatively leaves the count until the next successful read");
  await fixture.replyAsAdmin(thread._id, "reply");
  assert.equal(await fixture.count(), 2);
  const second = await fixture.getAdminSupportMessages(thread._id);
  assert.ok(second.messages.some(message => message.text === "new arrival"));
  assert.equal(await fixture.count(), 0);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props) => ({ type, props });

function reactHarness() {
  const state = [], effects = [];
  return {
    state, effects,
    react: {
      useState: initial => {
        const index = state.length;
        state.push(initial);
        return [initial, next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
      useEffect: effect => effects.push(effect),
      useCallback: fn => fn,
      useRef: () => ({ current: null }),
    },
  };
}

function browserFixture() {
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  const intervals = new Map(), timeouts = new Map();
  const target = () => {
    const events = new Map();
    return {
      addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener: (type, fn) => { events.get(type)?.delete(fn); },
      dispatchEvent: event => { for (const fn of events.get(event.type) ?? []) fn(event); return true; },
      listenerCount: () => [...events.values()].reduce((sum, set) => sum + set.size, 0),
    };
  };
  let id = 0;
  globalThis.window = {
    ...target(),
    setInterval: (fn, delay) => { intervals.set(++id, { fn, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => { timeouts.set(++id, fn); return id; },
    clearTimeout: id => timeouts.delete(id),
  };
  globalThis.document = { ...target(), hidden: false };
  globalThis.setInterval = window.setInterval;
  globalThis.clearInterval = window.clearInterval;
  return { intervals, timeouts, restore: () => Object.assign(globalThis, previous) };
}

function startCounts(harness) {
  const polling = load("src\\components\\admin\\useAdminCounts.ts", { react: harness.react });
  const { useSupportUnread } = load("src\\components\\admin\\useSupportUnread.ts", { "./useAdminCounts": polling });
  useSupportUnread("staff");
  return harness.effects[0]();
}

test("sidebar subscription updates on new/seen events without reload, hides zero, and retains errors until recovery", async () => {
  const browser = browserFixture(), harness = reactHarness();
  let unread = 3, fail = false, calls = 0, cleanup;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/admin/support?unread=1");
    assert.equal(options.cache, "no-store");
    calls++;
    return fail ? Response.json({ error: "Unavailable" }, { status: 503 }) : Response.json({ unread });
  };
  try {
    cleanup = startCounts(harness);
    await settle();
    assert.equal(harness.state[0].counts.unread, 3);
    unread = 5;
    window.dispatchEvent(new Event("wx:support-update"));
    await settle();
    assert.equal(harness.state[0].counts.unread, 5);
    unread = 0;
    window.dispatchEvent(new Event("wx:support-read"));
    await settle();
    const { AdminCountBadge } = load("src\\components\\admin\\AdminCountBadge.tsx", { "react/jsx-runtime": { jsx } });
    const badge = () => AdminCountBadge({ count: harness.state[0].counts.unread, error: harness.state[0].error, label: "Support", description: "unread messages" });
    assert.equal(badge(), null);
    unread = 12;
    [...browser.intervals.values()][0].fn();
    await settle();
    assert.equal(badge().props.children, 12);
    assert.equal(badge().props["aria-label"], "Support: 12 unread messages");
    fail = true;
    window.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(harness.state[0].counts.unread, 12);
    assert.equal(harness.state[0].error, "Unavailable");
    assert.match(badge().props["aria-label"], /Last known count: 12/);
    const before = calls;
    document.hidden = true;
    [...browser.intervals.values()][0].fn();
    await settle();
    assert.equal(calls, before);
    document.hidden = false; fail = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(harness.state[0].error, null);
    cleanup(); cleanup = null;
    assert.equal(window.listenerCount(), 0);
    assert.equal(document.listenerCount(), 0);
    assert.equal(browser.intervals.size, 0);
    assert.equal(browser.timeouts.size, 0);
  } finally { cleanup?.(); browser.restore(); }
});

test("a read during an in-flight count queues a fresh total and unmount aborts without applying stale results", async () => {
  const browser = browserFixture(), harness = reactHarness(), requests = [];
  let cleanup;
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal }));
  try {
    cleanup = startCounts(harness);
    window.dispatchEvent(new Event("wx:support-read"));
    [...browser.intervals.values()][0].fn();
    assert.equal(requests.length, 1, "polls must not overlap");
    requests[0].resolve(Response.json({ unread: 6 }));
    await settle();
    assert.equal(requests.length, 2, "the seen event must not be lost behind an old count request");
    requests[1].resolve(Response.json({ unread: 0 }));
    await settle();
    assert.equal(harness.state[0].counts.unread, 0);
    window.dispatchEvent(new Event("focus"));
    cleanup(); cleanup = null;
    assert.ok(requests[2].signal.aborted);
    requests[2].resolve(Response.json({ unread: 99 }));
    await settle();
    assert.equal(harness.state[0].counts.unread, 0);
  } finally { cleanup?.(); browser.restore(); }
});

test("only successful visible inbox reads publish the badge refresh, without recursive support-update fetches", async () => {
  const browser = browserFixture(), harness = reactHarness();
  let reads = 0, seen = 0, fail = false;
  const cleanups = [];
  globalThis.fetch = async url => {
    if (url.includes("thread=")) {
      reads++;
      return fail ? Response.json({ error: "Read failed" }, { status: 503 }) : Response.json({ messages: [] });
    }
    return Response.json({ threads: [], me: { id: "staff", level: 2 } });
  };
  window.addEventListener("wx:support-read", () => seen++);
  try {
    const { SupportInbox } = load("src\\components\\admin\\SupportInbox.tsx", { react: harness.react, "react/jsx-runtime": { jsx, jsxs: jsx } });
    SupportInbox({ initialThread: "chat" });
    for (const effect of harness.effects) cleanups.push(effect());
    await settle();
    assert.equal(reads, 1);
    assert.equal(seen, 1);
    document.hidden = true;
    for (const interval of browser.intervals.values()) interval.fn();
    window.dispatchEvent(new Event("wx:support-update"));
    await settle();
    assert.equal(reads, 1);
    document.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(reads, 2);
    assert.equal(seen, 2);
    fail = true;
    window.dispatchEvent(new Event("wx:support-update"));
    await settle();
    assert.equal(reads, 3);
    assert.equal(seen, 2);
    assert.equal(harness.state[2], "Read failed");
  } finally { for (const cleanup of cleanups) cleanup?.(); browser.restore(); }
});
