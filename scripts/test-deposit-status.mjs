import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

test("deposit status reads only the authenticated player's deposit and disables caching", async () => {
  let user = null, row = null;
  const queries = [];
  const api = load("src\\app\\api\\player\\deposit\\route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/models": { oid: value => value, Transaction: { findOne: query => { queries.push(query); return { lean: async () => row }; } } },
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
    "@/lib/platform": {}, "@/lib/notifications": {},
  });
  const get = id => api.GET(new Request("http://localhost/api/player/deposit" + (id ? `?id=${id}` : "")));
  assert.equal((await get("tx-a")).status, 401);
  user = { id: "staff", role: "admin" };
  assert.equal((await get("tx-a")).status, 401);
  user = { id: "player-a", role: "client" };
  assert.equal((await get()).status, 400);
  assert.equal((await get("another-player-tx")).status, 404);
  assert.deepEqual(queries.at(-1), { _id: "another-player-tx", userId: "player-a", type: "deposit" });
  row = { status: "approved", adminNote: null };
  const approved = await get("tx-a");
  assert.deepEqual(approved.body, row);
  assert.equal(approved.headers["Cache-Control"], "no-store");
});

for (const provider of ["jazzcash", "bank", "raast"]) test(`${provider}: deposit submission returns its saved receipt ID and the client action preserves it`, async () => {
  const form = new FormData();
  form.set("amount", "1000");
  form.set("paymentAccountId", "account-1");
  form.set("paymentMethod", provider);
  form.set("referenceId", "receipt-reference");
  const api = load("src\\app\\api\\player\\deposit\\route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/models": {
      oid: value => value,
      Transaction: { create: async data => { assert.equal(data.amount, 1000); assert.equal(data.userId, "player-1"); return { _id: "saved-deposit" }; } },
      User: { findById: () => ({ lean: async () => ({}) }) },
      PaymentAccount: { findById: () => ({ lean: async () => ({ _id: "account-1", isActive: true, provider, accountTitle: "Merchant" }) }) },
    },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "player-1", role: "client", name: "Player" }) },
    "@/lib/platform": { getSettings: async () => ({}), assignPaymentAccounts: async () => ({ [provider]: "account-1" }) },
    "@/lib/notifications": { notifyUser: async () => {}, notifyAdmins: async () => {} },
  });
  const receipt = await api.POST(new Request("http://localhost/api/player/deposit", { method: "POST", body: form }));
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.transactionId, "saved-deposit");
  const actions = load("src\\lib\\clientActions.ts", { "@/lib/auth": {} }, {
    window: { dispatchEvent() {} },
    fetch: async (url, options) => { assert.equal(url, "/api/player/deposit"); assert.equal(options.body, form); return { ok: true, json: async () => receipt.body }; },
    CustomEvent: Event,
  });
  assert.equal((await actions.depositAction(undefined, form)).transactionId, "saved-deposit");
});

function ui() {
  const states = [], refs = [], effects = [], pending = [], intervals = new Map(), listeners = new Map(), emitted = [], requests = [];
  let index = 0, refIndex = 0, effectIndex = 0, nextInterval = 0, reply = { status: "pending" }, fail = false, submittedId = "deposit-1";
  const browser = {
    setInterval(fn) { intervals.set(++nextInterval, fn); return nextInterval; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) { emitted.push(event.type); for (const fn of [...listeners.get(event.type) ?? []]) fn(); },
  };
  const component = load("src\\components\\DepositFlow.tsx", {
    react: {
      useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useEffect(fn, deps) {
        const i = effectIndex++, previous = effects[i];
        if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) pending.push(() => {
          previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() };
        });
      },
    },
    "react/jsx-runtime": jsx,
    "framer-motion": { motion: new Proxy({}, { get: (_, key) => `motion-${String(key)}` }), AnimatePresence: "presence" },
    "lucide-react": Object.fromEntries(["Copy", "Upload", "XCircle", "Gift", "Smartphone", "ChevronDown", "Clock"].map(name => [name, name])),
    "next/image": { default: "img" }, "./DepositFlow.module.css": { default: {} },
    "next/link": { default: "a" },
    "@/lib/clientActions": { depositAction: async () => ({ success: "Payment is in process", transactionId: submittedId }) },
    "@/lib/imageFile": { compressImage: async () => "data:image/jpeg;base64,abc" },
  }, {
    window: browser,
    URL: { createObjectURL: () => "blob:proof", revokeObjectURL() {} },
    fetch: async (url, options) => {
      if (url.startsWith("data:")) return { blob: async () => new Blob(["proof"], { type: "image/jpeg" }) };
      requests.push({ url, options });
      if (fail) throw new Error("Status offline");
      return { ok: true, json: async () => reply };
    },
  });
  const render = () => {
    index = refIndex = effectIndex = 0;
    const nodes = [];
    const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === "object") { nodes.push(node); visit(node.props?.children); } };
    visit(component.DepositFlow({ accounts: [{ id: "account-1", provider: "jazzcash", accountTitle: "Merchant", accountNumber: "123" }] }));
    while (pending.length) pending.shift()();
    return nodes;
  };
  const text = value => render().some(node => node.props?.children === value);
  const click = value => render().find(node => typeof node.props?.children === "string" && node.props.children === value).props.onClick();
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const submit = async () => {
    click("Continue to Pay →");
    render().find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [{ type: "image/jpeg" }] } });
    await click("Submit Payment"); render(); await flush();
  };
  return {
    render, text, click, submit, flush, requests, emitted, intervals,
    status(value) { reply = value; }, fail(value) { fail = value; }, noReceipt() { submittedId = undefined; },
    async tick() { for (const fn of [...intervals.values()]) fn(); await flush(); },
    async refresh() { browser.dispatchEvent(new Event("wx:data-refresh")); await flush(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

test("pending deposit becomes approved without reload and refreshes the wallet only on confirmed approval", async () => {
  const h = ui();
  await h.submit();
  assert.ok(h.text("Payment is in process"));
  assert.ok(!h.text("Your amount is added to the wallet"));
  assert.equal(h.requests[0].url, "/api/player/deposit?id=deposit-1");
  assert.equal(h.requests[0].options.cache, "no-store");
  const before = h.emitted.filter(name => name === "wx:balance-update").length;
  await h.tick();
  assert.equal(h.emitted.filter(name => name === "wx:balance-update").length, before);
  h.status({ status: "approved" });
  await h.refresh();
  assert.ok(h.text("Your amount is added to the wallet"));
  assert.equal(h.emitted.filter(name => name === "wx:balance-update").length, before + 1);
  assert.equal(h.intervals.size, 0);
  h.click("Make Another Deposit");
  assert.ok(!h.text("Your amount is added to the wallet"));
  h.unmount();
});

test("status failures remain pending and retry; rejection never claims a wallet credit", async () => {
  const h = ui();
  await h.submit();
  h.fail(true); await h.tick();
  assert.ok(h.text("Payment is in process"));
  assert.ok(h.render().some(node => node.props?.role === "alert"));
  h.fail(false); h.status({ status: "rejected", adminNote: "Receipt mismatch" }); await h.tick();
  assert.ok(h.text("Payment was rejected"));
  assert.ok(h.text("Receipt mismatch"));
  assert.ok(!h.text("Your amount is added to the wallet"));
  assert.equal(h.intervals.size, 0);
  h.unmount();
});

test("reset or unmount cancels status polling, and missing receipt does not show submission success", async () => {
  const h = ui();
  await h.submit();
  const signal = h.requests[0].options.signal;
  h.click("Make Another Deposit"); h.render();
  assert.equal(signal.aborted, true);
  assert.equal(h.intervals.size, 0);
  h.noReceipt();
  await h.submit();
  assert.ok(!h.text("Payment is in process"));
  h.unmount();
});
