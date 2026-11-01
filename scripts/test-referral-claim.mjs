import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

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
    "@/models": {
      User: {
        findById: id => ({ lean: async () => id === "depositor" ? { referredBy: "ref", name: "Depositor" } : ref }),
        updateOneAtomic: async (filter, update) => {
          assert.equal(filter._id, ref._id);
          assert.equal(update.$inc.balance, undefined);
          for (const [key, amount] of Object.entries(update.$inc)) ref[key] = (ref[key] ?? 0) + amount;
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
  assert.equal(commissions[0].amount, 15);
  assert.equal(notifications[0][4].href, "/player/profile");
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

test("profile Claim works for referral-only earnings and stays disabled when only today's winnings exist", () => {
  const jsx = (type, props) => ({ type, props });
  let summary;
  const card = load("src\\components\\WinHoldCard.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect: () => {}, useActionState: () => [undefined, () => {}, false] },
    "@/lib/actions": { claimWinHoldsAction: () => {} },
    "@/lib/useDb": { useDb: () => ({ data: summary, error: "", reload: () => {} }) },
  });
  for (const [referral, expectedDisabled] of [[15, false], [0, true]]) {
    summary = { locked: 150, claimable: 0, referralClaimable: referral };
    const tree = card.WinHoldCard({ locked: 150, claimable: 0, referralClaimable: referral });
    const claim = find(tree, node => node.type === "button")[0];
    assert.equal(claim.props.disabled, expectedDisabled);
    assert.match(JSON.stringify(tree), /Referral Commission - Claimable/);
  }
});
