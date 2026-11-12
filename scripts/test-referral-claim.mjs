import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

function load(file, imports = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", js)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  return loaded.exports;
}

test("first-deposit referral commission accumulates as pending, not spendable balance, and directs players to Claim", async () => {
  const ref = { _id: "ref", isActive: true, balance: 600, commissionEarned: 90 };
  const commissions = [], notifications = [];
  let approved = 1;
  const platform = load("src\\lib\\platform.ts", {
    "./mongo": { dbConnect: async () => {} },
    "./notifications": { notifyUser: async (...args) => notifications.push(args) },
    "./seed": {},
    "./paymentAssignments": {},
    "./providerWinnings": load("src\\lib\\providerWinnings.ts"),
    "@/models": {
      User: {
        findById: id => ({ lean: async () => id === "depositor" ? { referredBy: "ref", name: "Depositor" } : ref }),
        updateOneAtomic: async (filter, update) => {
          assert.equal(filter._id, ref._id);
          assert.equal(update.$inc.balance, undefined);
          for (const [key, amount] of Object.entries(update.$inc)) {
            const parts = key.split(".");
            if (parts.length === 2) {
              ref[parts[0]] ??= {};
              ref[parts[0]][parts[1]] = (ref[parts[0]][parts[1]] ?? 0) + amount;
            } else ref[key] = (ref[key] ?? 0) + amount;
          }
        },
      },
      Transaction: { countDocuments: async () => approved },
      Commission: { create: async row => commissions.push(row) },
    },
  });
  await platform.payDepositCommission("depositor", 1000);
  assert.equal(ref.balance, 600);
  assert.equal(ref.pendingReferralCommission, 15);
  assert.equal(ref.commissionEarned, 105);
  const unlocked = load("src\\lib\\providerWinnings.ts").summarizeReferralCommission(ref, Date.now());
  assert.equal(unlocked.locked, 15);
  assert.equal(unlocked.claimable, 0);
  assert.equal(commissions[0].amount, 15);
  assert.equal(notifications[0][4].href, "/player/withdraw#referral-commission");
  assert.match(notifications[0][2], /after you tap Claim/);
  approved = 2;
  await platform.payDepositCommission("depositor", 1000);
  assert.equal(ref.pendingReferralCommission, 15, "existing first-deposit eligibility is unchanged");
});

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => find(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
}

test("winning Claim ignores referral-only earnings and never renders referral controls", () => {
  const jsx = (type, props) => ({ type, props });
  let summary;
  const card = load("src\\components\\WinHoldCard.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect: () => {}, useActionState: () => [undefined, () => {}, false] },
    "@/lib/actions": { claimWinHoldsAction: () => {} },
    "@/lib/useDb": { useDb: () => ({ data: summary, error: "", reload: () => {} }) },
  });
  for (const [claimable, referral, expectedDisabled] of [[0, 15, true], [0, 0, true], [20, 15, false]]) {
    summary = { locked: 150, claimable, referralClaimable: referral };
    const tree = card.WinHoldCard({ locked: 150, claimable });
    const claim = find(tree, node => node.type === "button")[0];
    assert.equal(claim.props.disabled, expectedDisabled);
    assert.doesNotMatch(JSON.stringify(tree), /Referral Commission/);
  }
});

test("withdrawal referral card claims only commission and displays claimed status after refresh", () => {
  const jsx = (type, props) => ({ type, props });
  const action = () => {};
  let amount = { claimable: 7.5, locked: 0 };
  const card = load("src\\components\\ReferralCommissionCard.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect: () => {}, useActionState: passed => {
      assert.equal(passed, action);
      return [undefined, action, false];
    } },
    "@/lib/actions": { claimReferralCommissionAction: action },
    "@/lib/useDb": { useDb: () => ({ data: amount, error: "", reload: () => {} }) },
  });
  let tree = card.ReferralCommissionCard({ initial: 7.5, locked: 0, earned: 7.5 });
  assert.equal(tree.props.id, "referral-commission");
  assert.equal(find(tree, node => node.type === "form")[0].props.action, action);
  assert.equal(find(tree, node => node.type === "button")[0].props.disabled, false);
  amount = { claimable: 0, locked: 15 };
  tree = card.ReferralCommissionCard({ initial: 0, locked: 15, earned: 15 });
  assert.equal(find(tree, node => node.type === "button")[0].props.disabled, true);
  assert.match(JSON.stringify(tree), /Locked/);
  assert.doesNotMatch(JSON.stringify(tree), /Commission claimed/);
  amount = { claimable: 0, locked: 0 };
  tree = card.ReferralCommissionCard({ initial: 0, locked: 0, earned: 7.5 });
  assert.equal(find(tree, node => node.type === "button")[0].props.disabled, true);
  assert.match(JSON.stringify(find(tree, node => node.props?.role === "status")), /Commission claimed/);
  tree = card.ReferralCommissionCard({ initial: 0, locked: 0, earned: 0 });
  assert.doesNotMatch(JSON.stringify(tree), /Commission claimed/);
});

test("profile uses pending referral commission and links Invite Claim to the withdrawal card", () => {
  const profile = readFileSync("src\\app\\player\\profile\\Client.tsx", "utf8");
  const api = readFileSync("src\\app\\api\\player\\profile\\route.ts", "utf8");
  const wallet = readFileSync("src\\app\\player\\wallet\\Client.tsx", "utf8");
  assert.match(api, /holds\.referralClaimable \+ holds\.referralLocked/);
  assert.match(profile, /href="\/player\/withdraw#referral-commission"/);
  assert.match(wallet, /<WithdrawRequest[\s\S]*<ReferralCommissionCard/);
  assert.doesNotMatch(profile, /<WinHoldCard[^>]*referralClaimable/);
});

test("Profile no longer offers a winning claim shortcut and old links redirect safely", () => {
 const profile=readFileSync("src\\app\\player\\profile\\Client.tsx","utf8");
 assert.doesNotMatch(profile,/WinningsShortcut|WinHoldCard|Winning Amounts/);
 const route=load("src\\app\\player\\profile\\winnings\\page.tsx",{"next/navigation":{redirect:target=>{throw new Error(target)}}});
 assert.throws(()=>route.default(),/\/player\/profile/);
});

test("authenticated wallet loads release old winnings before returning the balance and surface release failures", async () => {
  const previous = process.env.NEXTAUTH_SECRET;
  const secret = "local-session-test-secret";
  process.env.NEXTAUTH_SECRET = secret;
  const payload = Buffer.from(JSON.stringify({ sub: "player", exp: Date.now() + 60000 })).toString("base64url");
  const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  let balance = 100;
  let released = false;
  let fail = false;
  let reads = 0;
  const auth = load("src\\lib\\serverAuth.ts", {
    "node:crypto": { createHmac, randomUUID, timingSafeEqual },
    "next/headers": { cookies: async () => ({ get: () => ({ value: token }) }) },
    "./mongo": { dbConnect: async () => {} },
    "./auth": { toCurrentUser: user => ({ ...user, id: user._id }) },
    "./playerDisplayId": { getPlayerDisplayId: async () => "1234567" },
    "./mysql": {},
    "./multiplayer-store": {},
    "./deviceSessions": {},
    "./winHold": { claimWinHolds: async id => {
      assert.equal(id, "player");
      if (fail) throw new Error("Release transaction failed");
      balance += 15;
      released = true;
    } },
    "@/models": {
      User: { findById: () => ({ lean: async () => {
        reads++;
        return { _id: "player", role: "client", isActive: true, balance };
      } }) },
      WinHold: { findOne: filter => ({ lean: async () => {
        assert.deepEqual(filter, { userId: "player", claimed: false });
        return released ? null : { _id: "old-hold" };
      } }) },
    },
  });
  try {
    assert.equal((await auth.getServerSessionUser()).balance, 115);
    assert.equal(reads, 2, "launch and panel see the post-release wallet, not the stale balance");
    assert.equal((await auth.getServerSessionUser()).balance, 115);
    released = false;
    fail = true;
    await assert.rejects(auth.getServerSessionUser(), /Release transaction failed/);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});
