import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}
const methods = load("src\\lib\\paymentMethods.ts");
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };

test("existing withdrawal minimums migrate once without changing configured maximums", async () => {
  let settings = {
    _id: "settings", vipLevels: [{ level: 0, minWithdraw: 1000, perWithdrawMax: 600, dailyWithdrawLimit: 700 }],
    wallet: { minWithdraw: 1000 }, leaderboard: [],
    referral: { depositCommissionPct: 1.5, referralDepositBonus: 0, betCommissionPct: 0, agentDepositCommissionPct: 0 },
  };
  let migrations = 0;
  const platform = load("src\\lib\\platform.ts", {
    "./mongo": { dbConnect: async () => {} }, "./notifications": {}, "./seed": {}, "./paymentAssignments": {}, "./providerWinnings": {},
    "@/models": { Settings: {
      findOne: () => ({ lean: async () => structuredClone(settings) }),
      updateOneAtomic: async (filter, update) => {
        assert.equal(filter._id, "settings");
        migrations++;
        settings = { ...settings, vipLevels: update.$set.vipLevels, wallet: { minWithdraw: update.$set["wallet.minWithdraw"] }, withdrawalMinimum500Migrated: true };
        return { modifiedCount: 1 };
      },
    } },
  });
  let result = await platform.getSettings();
  assert.equal(result.vipLevels[0].minWithdraw, 500);
  assert.equal(result.wallet.minWithdraw, 500);
  assert.equal(result.vipLevels[0].perWithdrawMax, 600);
  assert.equal(result.vipLevels[0].dailyWithdrawLimit, 700);
  settings.vipLevels[0].minWithdraw = 800;
  result = await platform.getSettings(true);
  assert.equal(result.vipLevels[0].minWithdraw, 800);
  assert.equal(migrations, 1);
});

test("withdrawal destinations persist mobile numbers, bank IBANs, crypto networks and arbitrary services", async () => {
  let saved;
  const api = load("src\\app\\api\\player\\receiving-accounts\\route.ts", {
    "next/server": next, "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "alice", role: "client" }) },
    "@/models": { User: { updateOne: async (filter, update) => { saved = { filter, update }; return { matchedCount: 1 }; } } },
    "@/lib/paymentMethods": methods,
  });
  for (const [provider, number, institution] of [
    ["jazzcash", "03001234567", ""], ["easypaisa", "03121234567", ""],
    ["bank", "PK00BANK12345", "Bank account"], ["crypto", "T123456789", "USDT TRC20"],
    ["other", "1234567890", "SadaPay"],
  ]) {
    const body = { provider, holderName: "Test holder", accountNumber: number, institution };
    const reply = await api.POST(new Request("http://local/accounts", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(reply.status, 200);
    const account = (await reply.json()).account;
    assert.equal(account.accountNumber, number);
    assert.equal(account.institution ?? "", institution);
    assert.equal(saved.filter._id, "alice");
    assert.equal(saved.update.$set[`withdrawalAccounts.${provider}`].accountNumber, number);
  }
  for (const body of [
    { provider: "no-wallet" }, { provider: "other", holderName: "Test holder", accountNumber: "123", institution: "" },
    { provider: "jazzcash", holderName: "Test holder", accountNumber: "abc" },
  ]) {
    saved = null;
    const reply = await api.POST(new Request("http://local/accounts", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(reply.status, 400);
    assert.equal(saved, null);
  }
});

test("withdrawal tracking is owner scoped and expanded destinations retain payment details and receipt", async () => {
  let viewer = { id: "alice", role: "client", name: "Test player" }, row = null, created;
  const queries = [], notices = [], debits = [];
  const api = load("src\\app\\api\\player\\withdraw\\route.ts", {
    "next/server": next, "@/lib/serverAuth": { getServerSessionUser: async () => viewer },
    "@/lib/paymentMethods": methods,
    "@/lib/platform": { getSettings: async () => ({ wallet: { minWithdraw: 500 } }), vipInfo: () => ({ cur: { minWithdraw: 500, perWithdrawMax: 700, dailyWithdrawLimit: 700 } }), withdrawalCountToday: async () => 0, withdrawnToday: async () => 0 },
    "@/lib/notifications": { notifyUser: async (...args) => notices.push(args), notifyAdmins: async () => {} },
    "@/models": {
      oid: id => id, PaymentAccount: {},
      User: { findById: () => ({ lean: async () => ({ withdrawPin: "1234" }) }), updateOneAtomic: async (filter, update) => { debits.push({ filter, update }); return { modifiedCount: 1 }; } },
      Transaction: {
        findOne: query => { queries.push(query); return { lean: async () => row }; },
        create: async data => { created = data; return { _id: "saved-withdrawal", ...data }; },
      },
    },
  });
  const get = () => api.GET(new Request("http://local/withdraw?id=tx-other"));
  assert.equal((await get()).status, 404);
  assert.deepEqual(queries.at(-1), { _id: "tx-other", userId: "alice", type: "withdraw" });
  row = { status: "rejected", adminNote: "Account details do not match." };
  const rejected = await get();
  assert.equal(rejected.headers.get("cache-control"), "no-store");
  assert.deepEqual(await rejected.json(), row);
  viewer = null;
  assert.equal((await get()).status, 401);
  viewer = { id: "alice", role: "client" };
  for (const provider of ["bank", "crypto", "other"]) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ provider, institution: "Test destination", accountNumber: "Address-1234", holderName: "Test holder", amount: "500", pin: "1234" })) form.set(key, value);
    for (const invalid of ["499", "500.5", "701"]) {
      form.set("amount", invalid);
      assert.equal((await api.POST(new Request("http://local/withdraw", { method: "POST", body: form }))).status, 400);
    }
    form.set("amount", "500");
    const reply = await api.POST(new Request("http://local/withdraw", { method: "POST", body: form }));
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { success: "Your request is in process", transactionId: "saved-withdrawal" });
    assert.equal(created.provider, provider);
    assert.equal(created.institution, "Test destination");
    assert.equal(created.senderNumber, "Address-1234");
    assert.equal(debits.at(-1).update.$inc.balance, -500);
    assert.match(notices.at(-1)[2], /request is in process/);
  }
});

for (const type of ["deposit", "withdraw"]) {
  test(`${type} rejection requires an admin reason, notifies the player and refunds only withdrawal`, async () => {
    const notices = [], refunds = [];
    let updated = null;
    const transaction = { _id: "tx", userId: "alice", amount: 100, type, status: "pending" };
    const api = load("src\\app\\api\\admin\\transactions\\[id]\\route.ts", {
      "next/server": next, "@/lib/auth": { isStaff: () => true },
      "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "admin", dbRole: "admin", level: 2 }) },
      "@/lib/notifications": { notifyUser: async (...args) => notices.push(args) },
      "@/lib/platform": {}, "@/lib/depositApproval": {},
      "@/models": {
        oid: id => id, PaymentAccount: {}, AdminLog: { create: async () => {} },
        User: { updateOneAtomic: async (...args) => refunds.push(args) },
        Transaction: {
          findOne: () => ({ lean: async () => transaction }),
          updateOneAtomic: async (filter, update) => { updated = update; return { modifiedCount: 1 }; },
          findById: () => ({ lean: async () => ({ ...transaction, status: "rejected" }) }),
        },
      },
    });
    const patch = note => api.PATCH(new Request("http://local/transaction/tx", { method: "PATCH", body: JSON.stringify({ decision: "rejected", note }) }), { params: Promise.resolve({ id: "tx" }) });
    assert.equal((await patch("  ")).status, 400);
    assert.equal(updated, null);
    assert.equal((await patch("  Account mismatch  ")).status, 200);
    assert.equal(updated.$set.adminNote, "Account mismatch");
    assert.match(notices[0][2], /Reason: Account mismatch/);
    assert.equal(refunds.length, type === "withdraw" ? 1 : 0);
    if (refunds.length) assert.deepEqual(refunds[0], [{ _id: "alice" }, { $inc: { balance: 100 } }]);
  });
}

function withdrawalUI(limits = { min: 10 }) {
  const states = [], effects = [], pending = [], intervals = new Map(), browser = new EventTarget();
  let index = 0, effectIndex = 0, seq = 0, reply = { status: "pending" }, fail = false, missingReceipt = false;
  browser.setInterval = fn => { intervals.set(++seq, fn); return seq; };
  browser.clearInterval = id => intervals.delete(id);
  const requests = [];
  const { WithdrawRequest } = load("src\\components\\WithdrawRequest.tsx", {
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    react: {
      useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useCallback: fn => fn,
      useEffect(fn, deps) { const i = effectIndex++, previous = effects[i]; if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    },
    "lucide-react": {}, "./PaymentLogo": {}, "./OpenSupport": {}, "@/lib/useDb": {},
    "./ProfileForms": { PinForm: "pin-form" }, "@/lib/paymentMethods": methods,
    "@/lib/auth": { getCurrentUser: async () => ({}) },
    "@/lib/clientActions": { withdrawAction: async () => ({ success: "Your request is in process", transactionId: missingReceipt ? undefined : "tx-1" }) },
  }, {
    window: browser,
    fetch: async (url, options) => { requests.push({ url, options }); if (fail) throw new Error("Status offline"); return { ok: true, json: async () => url === "/api/player/wallet" ? { withdrawalAccounts: {}, me: { balance: 1000 }, limits: { usedToday: 0, withdrawalsToday: 0 } } : reply }; },
  });
  const render = (hasPin = true) => {
    index = effectIndex = 0;
    const nodes = [];
    const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === "object") { nodes.push(node); visit(node.props?.children); } };
    visit(WithdrawRequest({ hasPin, balance: 1000, limits, initialAccounts: { bank: { provider: "bank", holderName: "Test holder", accountNumber: "PK12345678", institution: "Test bank" } } }));
    while (pending.length) pending.shift()();
    return nodes;
  };
  const text = value => render().some(node => node.props?.children === value);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  return {
    render, text, intervals, requests, status: value => { reply = value; }, fail: value => { fail = value; },
    missingReceipt: () => { missingReceipt = true; },
    async submit() {
      render().find(node => node.props?.id === "wd-amount").props.onChange({ target: { value: "100" } });
      render().find(node => node.props?.id === "wd-pin").props.onChange({ target: { value: "1234" } });
      await render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
      render(); await flush();
    },
    async tick() { for (const fn of [...intervals.values()]) fn(); await flush(); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test("withdrawal form shows the minimum but keeps the maximum enforced without advertising it", () => {
  const h = withdrawalUI({ min: 500, perMax: 700 });
  const input = h.render().find(node => node.props?.id === "wd-amount");
  assert.equal(input.props.min, 500);
  assert.equal(input.props.max, 700);
  assert.match(input.props.placeholder, /500/);
  assert.doesNotMatch(input.props.placeholder, /max/i);
  h.unmount();
});

test("bank-only withdrawal selection submits, polls confirmed status, retries failures and provides a home button", async () => {
  const h = withdrawalUI();
  assert.equal(h.render().find(node => node.props?.id === "wd-amount").props.disabled, false);
  await h.submit();
  assert.ok(h.text("Your request is in process"));
  assert.ok(h.render().some(node => node.props?.href === "/player" && node.props.children === "Back to Games"));
  assert.equal(h.requests[0].url, "/api/player/withdraw?id=tx-1");
  h.fail(true); await h.tick();
  assert.ok(h.text("Your request is in process"));
  h.fail(false); h.status({ status: "approved" }); await h.tick();
  assert.ok(h.text("Requested money is transferred to your account."));
  assert.equal(h.intervals.size, 0);
  h.unmount();
});

test("withdrawal rejection displays the admin reason and inline PIN setup reuses the shared form", async () => {
  const h = withdrawalUI();
  const pin = h.render(false).find(node => node.type === "pin-form");
  assert.equal(pin.props.hasPin, false);
  pin.props.onSuccess("1234");
  let field = h.render().find(node => node.props?.id === "wd-pin");
  assert.equal(field.props.value, "1234");
  assert.equal(field.props.type, "text");
  h.render().find(node => node.type === "button" && node.props.children === "Hide").props.onClick();
  field = h.render().find(node => node.props?.id === "wd-pin");
  assert.equal(field.props.value, "1234");
  assert.equal(field.props.type, "password");
  await h.submit();
  h.status({ status: "rejected", adminNote: "Receiving account is incorrect" }); await h.tick();
  assert.ok(h.text("Withdrawal was rejected. Reason: Receiving account is incorrect"));
  assert.equal(h.intervals.size, 0);
  h.unmount();
});

test("PIN form transfers the entered PIN only after successful saving", async () => {
  let save = async () => ({ error: "PIN invalid" });
  let callbackPin;
  const { PinForm } = load("src\\components\\ProfileForms.tsx", {
    "react/jsx-runtime": jsx,
    react: { useActionState: action => [undefined, action, false], useState: initial => [initial, () => {}] },
    "@/lib/actions": { setWithdrawPinAction: (...args) => save(...args) },
    "@/lib/i18n/client": { useI18n: () => ({ t: value => value }) },
  });
  const form = new FormData();
  form.set("pin", "1234");
  const action = PinForm({ hasPin: false, onSuccess: pin => { callbackPin = pin; } }).props.action;
  await action(undefined, form);
  assert.equal(callbackPin, undefined);
  save = async () => ({ success: "saved" });
  await action(undefined, form);
  assert.equal(callbackPin, "1234");
});

test("missing withdrawal receipt never shows confirmed submission", async () => {
  const h = withdrawalUI();
  h.missingReceipt(); await h.submit();
  assert.ok(!h.text("Your request is in process"));
  assert.ok(h.text("Request confirmation was not received. Check Withdrawal records before submitting again."));
  h.unmount();
});
