import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(path, imports, extra = "") {
  const code = ts.transpileModule(readFileSync(path, "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const cards = compile("src\\components\\texas-holdem\\cards.ts", {});
const holdem = compile("src\\components\\texas-holdem\\holdem.ts", { "./cards": cards });
function fixture({ wallet = 55056, serverWallet = wallet, selected = 10, startAllowed = true, state: supplied } = {}) {
  let stateIndex = 0, current;
  const updates = [], starts = [], checkpoints = [], effects = [];
  const jsx = (type, props) => ({ type, props });
  const api = compile("src\\components\\texas-holdem\\Game.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: {
      useState: initial => {
        const index = stateIndex++;
        const value = index === 1 ? selected : initial;
        return [typeof value === "function" ? value() : value, next => updates.push({ index, value: next })];
      },
      useEffect: effect => effects.push(effect),
      useMemo: calculate => calculate(),
      useRef: value => ({ current: value }),
    },
    "@/lib/gameSfx": { gameSfx: { deal() {}, win() {}, lose() {} } },
    "@/lib/walletSync": {
      useGameBalance: () => [wallet, () => { throw new Error("UI must not mutate the wallet directly"); }],
      usePoolLifecycle: () => ({
        enabled: true, busy: false,
        checkpoint: value => checkpoints.push(value),
        start: async amount => { starts.push(amount); return startAllowed; },
      }),
      usePoolRoundState: (_game, _key, initial) => {
        current = supplied ?? initial();
        return [current, next => { current = next; }];
      },
      fetchServerBalance: async () => serverWallet,
      getStoredWalletBalance: () => serverWallet - starts.reduce((total, amount) => total + amount, 0),
    },
    "./PlayingCard": { default: () => null },
    "./cards": cards,
    "./holdem": holdem,
    "../teen-patti/useIdleCardRound": { useIdleCardRound: () => ({ preview: null, watching: false, claim: () => true, release() {} }) },
    "@/lib/interactiveCardClient": {
      restoreCardRound: async () => null,
      cardMove: async (_pool, move, selection) => {
        assert.equal(move, "deal");
        const state = holdem.startNextHand({
          ...holdem.initialState(), playerChips: serverWallet, dealerChips: Math.max(100000, serverWallet),
        }, selection.openingBet);
        return { phase: state.phase, view: { state, frames: [state] } };
      },
    },
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "@/components/BetAmountInput": { default: "amount-input" },
  });
  const tree = api.default();
  return { api: { ...api, ...holdem }, tree, updates, starts, checkpoints, effects, state: () => current };
}
function nodes(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
const settleAsync = () => new Promise(resolve => setImmediate(resolve));

test("Texas Hold'em shows real wallet and opening chips before the first hand", () => {
  const f = fixture();
  assert.match(text(f.tree), /Wallet Rs\. 55,056/);
  assert.doesNotMatch(text(f.tree), /Stack Rs\. 1,000|play money|Rebuy Rs\./);
  const group = nodes(f.tree).find(n => n.props?.["aria-label"] === "Opening bet");
  assert.ok(group);
  assert.deepEqual(nodes(group).filter(n => n.type === "button").map(text), ["Rs. 10", "Rs. 20", "Rs. 50", "Rs. 100", "Rs. 200"]);
  assert.ok(nodes(group).some(n => n.type === "amount-input"));
  assert.match(f.tree.props.className, /overflow-y-auto/);
  assert.equal(f.state().playerChips, 0, "no fake initial stack");
  assert.deepEqual(f.starts, [], "mount/render must not charge a blind");
});

for (const selected of [10, 20, 50, 100, 200, 75, 4321, 10000000]) {
  test(`Texas Hold'em starts the selected Rs. ${selected} opening bet exactly once`, async () => {
    const wallet = Math.max(55056, selected * 3);
    const f = fixture({ selected, wallet });
    const deal = nodes(f.tree).find(n => n.type === "button" && text(n).includes("Deal — Bet"));
    deal.props.onClick();
    await settleAsync();
    assert.deepEqual(f.starts, [selected]);
    assert.equal(f.state().acceptedStake, selected);
    assert.equal(f.state().playerChips, wallet - selected);
    assert.equal(f.state().phase, "preflop");
    assert.equal(f.checkpoints[0].state.acceptedStake, selected);
  });
}

test("unavailable wallet and unaffordable bets do not start a wager and show explicit errors", async () => {
  for (const options of [{ serverWallet: null }, { serverWallet: 9 }, { selected: 100, serverWallet: 50 }]) {
    const f = fixture(options);
    nodes(f.tree).find(n => n.type === "button" && text(n).includes("Deal — Bet")).props.onClick();
    await settleAsync();
    assert.deepEqual(f.starts, []);
    assert.equal(f.state().phase, "handOver");
    assert.ok(f.updates.some(update => update.index === 2 && typeof update.value === "string"));
  }
});

test("failed stake confirmation never advances to an unaccepted hand", async () => {
  const f = fixture({ startAllowed: false });
  nodes(f.tree).find(n => n.type === "button" && text(n).includes("Deal — Bet")).props.onClick();
  await settleAsync();
  assert.equal(f.state().phase, "handOver");
});

test("active hands retain fold, call/check and raise amounts", () => {
  const f = fixture();
  const hand = f.api.startNextHand({ ...f.api.initialState(), playerChips: 500 }, 10);
  const active = fixture({ state: hand });
  const buttons = nodes(active.tree).filter(n => n.type === "button").map(text);
  assert.ok(buttons.some(label => label.includes("Fold")));
  assert.ok(buttons.some(label => label.includes("Call Rs. 10")));
  for (const amount of [10, 20, 50, 100, 200]) assert.ok(buttons.includes(`+Rs. ${amount}`));
  assert.equal(f.api.computeTurn(hand), "player");
});
