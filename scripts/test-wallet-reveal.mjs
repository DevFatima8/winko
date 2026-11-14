import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("src\\lib\\walletReveal.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function wallet() {
  const exports = {};
  new Function("exports", code)(exports);
  exports.setWalletRevealOwner("alice");
  exports.recordWalletBalance(1000);
  return exports;
}

test("committed winnings stay hidden from all reads until the visual result", () => {
  const w = wallet();
  w.recordWalletBalance(900);
  const oldRead = w.walletRevealRevision();
  w.beginWalletReveal("spin", 900);
  assert.equal(w.recordWalletBalance(1700), 900, "even an in-flight response must not expose the credit");
  w.confirmWalletReveal("spin", 800);
  assert.equal(w.recordWalletBalance(1700), 900);
  assert.equal(w.presentedWalletBalance(1700, "alice"), 900, "session/header reads share the barrier");
  assert.equal(w.finishWalletReveal("spin"), 1700);
  assert.equal(w.presentedWalletBalance(900, "alice", oldRead), 1700, "a stale session read cannot undo a reveal");
  assert.equal(w.finishWalletReveal("spin"), null, "revealing twice cannot add money");
});

test("concurrent wagers release only the ball that has landed", () => {
  const w = wallet();
  w.beginWalletReveal("ball-a", 1000);
  w.beginWalletReveal("ball-b", 1000);
  w.confirmWalletReveal("ball-b", 200);
  assert.equal(w.recordWalletBalance(1100), 1000, "unknown earlier receipt remains concealed");
  w.confirmWalletReveal("ball-a", 300);
  assert.equal(w.recordWalletBalance(1300), 800, "both accepted stakes are deducted, both wins concealed");
  assert.equal(w.finishWalletReveal("ball-b"), 1000);
  assert.equal(w.presentedWalletBalance(1300), 1000);
  assert.equal(w.finishWalletReveal("ball-a"), 1300);
});

test("a known result can reveal while another request is still in flight", () => {
  const w = wallet();
  w.beginWalletReveal("a", 1000);
  w.confirmWalletReveal("a", 300);
  assert.equal(w.recordWalletBalance(1200), 900);
  w.beginWalletReveal("b", 900);
  assert.equal(w.recordWalletBalance(1600), 900);
  assert.equal(w.finishWalletReveal("a"), 1200);
  w.confirmWalletReveal("b", 500);
  assert.equal(w.recordWalletBalance(1600), 1100);
  assert.equal(w.finishWalletReveal("b"), 1600);
});

test("bundled bonus winnings become visible one revealed spin at a time", () => {
  const w = wallet();
  w.beginWalletReveal("bonus", 1000);
  w.confirmWalletReveal("bonus", 500);
  assert.equal(w.recordWalletBalance(1400), 900);
  assert.equal(w.finishWalletReveal("bonus", 100), 1000);
  assert.equal(w.recordWalletBalance(1400), 1000);
  assert.equal(w.finishWalletReveal("bonus", 50), 1050);
  assert.equal(w.finishWalletReveal("bonus", 999), 1400, "release is capped at the confirmed return");
  assert.equal(w.finishWalletReveal("bonus", 500), null);
});

test("losses and provisional claims never create a wallet credit", () => {
  const w = wallet();
  w.beginWalletReveal("loss", 1000);
  w.confirmWalletReveal("loss", 0);
  assert.equal(w.recordWalletBalance(900), 900);
  assert.equal(w.finishWalletReveal("loss"), null);
});

test("first authenticated read preserves a direct game's hold; account changes clear it", () => {
  const exports = {};
  new Function("exports", code)(exports);
  exports.recordWalletBalance(1000);
  exports.beginWalletReveal("old-game", 1000);
  exports.setWalletRevealOwner("alice");
  exports.confirmWalletReveal("old-game", 800);
  assert.equal(exports.recordWalletBalance(1700), 900);
  assert.equal(exports.presentedWalletBalance(500, "bob"), 500);
  exports.setWalletRevealOwner("bob");
  assert.equal(exports.recordWalletBalance(500), 500);
  exports.beginWalletReveal("new-game", 500);
  exports.confirmWalletReveal("new-game", 100);
  assert.equal(exports.recordWalletBalance(550), 450);
  assert.equal(exports.finishWalletReveal("old-game"), null);
  assert.equal(exports.presentedWalletBalance(550), 450);
});
