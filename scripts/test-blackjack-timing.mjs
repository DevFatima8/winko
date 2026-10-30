import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const card = (value, id) => ({ rank: String(value), suit: "S", value, id });
const jsx = (type, props) => ({ type, props });
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

function fixture({ player = [card(10, 1), card(8, 2)], dealer = [card(2, 3), card(3, 4)], draw = [4, 10], outcome = "win", status = "playing", random = 0 } = {}) {
  let index = 0, now = 0, timerId = 0;
  const hooks = [], cleanups = [], timers = new Map(), completed = [], increments = [];
  const saved = {
    shoe: [...Array.from({ length: 25 }, (_, i) => card(2, 20 + i)), ...draw.toReversed().map((v, i) => card(v, 100 + i))],
    activeBet: 50, playerCards: player, dealerCards: dealer, status, targetOutcome: outcome,
  };
  function useState(initial) {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
    return [hooks[slot], next => { hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next; }];
  }
  const source = ts.transpileModule(readFileSync("src\\components\\blackjack\\BlackjackGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: {
      useState,
      useRef: value => useState(() => ({ current: value }))[0],
      useEffect: effect => {
        const slot = index++;
        if (!(slot in hooks)) {
          hooks[slot] = true;
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        }
      },
    },
    "@/lib/gameSfx": { gameSfx: { flip() {}, click() {}, win() {}, lose() {}, deal() {} } },
    "@/lib/walletSync": {
      useGameBalance: () => useState(1000),
      usePoolRoundState: (_game, key, initial) => useState(saved[key] ?? initial),
      usePoolLifecycle: () => ({
        enabled: true, checkpoint() {}, queue() {},
        start: async () => true,
        increment: async value => { increments.push(value); return true; },
        complete: async value => { completed.push({ value, at: now }); return true; },
      }),
    },
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "@/components/BetAmountInput": { default: "bet-input" },
    "@/components/GameOverOverlay": { GameOverOverlay: "game-over" },
    "next/link": { default: "link" },
    "./blackjack.css": {},
  };
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", "window", "Math", source)(
    name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; },
    loaded, loaded.exports,
    (fn, duration) => { const id = ++timerId; timers.set(id, { fn, at: now + duration }); return id; },
    id => timers.delete(id),
    { addEventListener() {}, removeEventListener() {} },
    Object.assign(Object.create(Math), { random: () => random }),
  );
  const render = () => { index = 0; return loaded.exports.default({}); };
  const all = () => nodes(render());
  const button = label => all().find(n => n.type === "button" && text(n).startsWith(label));
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    completed, increments, button, all,
    overlay: () => all().find(n => n.type === "game-over").props.open,
    async click(label) { const promise = button(label).props.onClick(); await flush(); return { promise }; },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
    unmount: () => cleanups.forEach(cleanup => cleanup()),
    playerCards: () => all().filter(n => typeof n.type === "function" && n.type.name === "PlayingCard" && [1, 2, 100, 101].includes(n.props.card?.id)),
  };
}

test("Stand reveals dealer cards individually, then leaves the result visible for three seconds", async () => {
  const f = fixture();
  const { promise } = await f.click("STAND");
  assert.equal(f.button("HIT").props.disabled, true);
  // The wager settles immediately; only the on-screen reveal is paced.
  assert.deepEqual(f.completed, [{ value: 100, at: 0 }]);
  await f.advance(1099);
  assert.ok(f.all().some(n => n.props?.hidden === true));
  await f.advance(1);
  assert.ok(!f.all().some(n => n.props?.hidden === true));
  await f.advance(1100);
  assert.ok(f.all().some(n => n.props?.card?.value === 4));
  await f.advance(1100);
  assert.equal(f.all().filter(n => n.props?.card).length, 6);
  await f.advance(1100);
  assert.equal(f.overlay(), false);
  assert.equal(f.button("DEAL AGAIN").props.disabled, true);
  await f.advance(2999);
  assert.equal(f.overlay(), false);
  await f.advance(1);
  await promise;
  assert.equal(f.overlay(), true);
  assert.equal(f.button("DEAL AGAIN").props.disabled, false);
});

test("Hit below 21 waits for the next player action and ignores rapid repeat clicks", async () => {
  const f = fixture({ player: [card(3, 1), card(4, 2)], draw: [2] });
  const { promise } = await f.click("HIT");
  await f.click("HIT");
  await f.advance(1100);
  await promise;
  assert.equal(f.playerCards().length, 3);
  assert.equal(f.button("HIT").props.disabled, false);
  await f.advance(10000);
  assert.deepEqual(f.completed, []);
  assert.equal(f.overlay(), false);
});

test("a bust card is visible before settlement and Game Over", async () => {
  const f = fixture({ draw: [10], outcome: "loss" });
  const { promise } = await f.click("HIT");
  assert.equal(f.playerCards().length, 3);
  assert.deepEqual(f.completed, [{ value: 0, at: 0 }]);
  await f.advance(2200);
  assert.equal(f.overlay(), false);
  await f.advance(3000);
  await promise;
  assert.equal(f.overlay(), true);
});

test("Double Down keeps its existing stake and payout, with the same paced reveal", async () => {
  const f = fixture({ player: [card(3, 1), card(4, 2)] });
  const { promise } = await f.click("DOUBLE DOWN");
  await f.click("DOUBLE DOWN");
  assert.deepEqual(f.increments, [50]);
  assert.equal(f.overlay(), false);
  await f.advance(7400);
  await promise;
  assert.equal(f.completed.length, 1);
  assert.equal(f.completed[0].value, 200);
  assert.equal(f.overlay(), true);
});

test("leaving the table during the reveal keeps the settled wager and stops the animation", async () => {
  const f = fixture();
  const { promise } = await f.click("STAND");
  f.unmount();
  await promise;
  await f.advance(10000);
  assert.deepEqual(f.completed, [{ value: 100, at: 0 }]);
  assert.equal(f.overlay(), false);
});

test("an opening natural blackjack also shows its cards and result before Game Over", async () => {
  const f = fixture({ status: "idle" });
  const { promise } = await f.click("DEAL THE CARDS");
  assert.deepEqual(f.completed, [{ value: 125, at: 0 }]);
  await f.advance(4800);
  assert.equal(f.overlay(), false);
  await f.advance(3000);
  await promise;
  assert.equal(f.overlay(), true);
});

test("opening cards arrive in player/dealer order with 650ms spacing and inputs stay locked", async () => {
  const f = fixture({ status: "idle" });
  const { promise } = await f.click("DEAL THE CARDS");
  const cards = f.all().filter(n => typeof n.type === "function" && n.type.name === "PlayingCard" && n.props.card);
  assert.deepEqual(cards.map(n => n.props.delayMs), [650, 1950, 0, 1300]);
  assert.equal(f.button("HIT").props.disabled, true);
  await f.advance(2599);
  assert.equal(f.button("HIT").props.disabled, true);
  await f.advance(1);
  assert.ok(f.all().filter(n => typeof n.type === "function" && n.type.name === "PlayingCard").every(n => n.props.delayMs === 0));
  f.unmount();
  await promise;
});

test("Blackjack uses its animation-ready overlay instead of the immediate shared popup", () => {
  const source = readFileSync("src\\components\\GameView.tsx", "utf8");
  assert.match(source, /SharedGameResults value=\{slug !== "blackjack"\}/);
  assert.match(source, /slug !== "blackjack" && <GameResultPopup/);
  const f = fixture();
  assert.equal(f.overlay(), false);
});

test("a non-natural opening unlocks at 2.6 seconds without settling or changing its wager", async () => {
  const f = fixture({ status: "idle", random: 0.9999 });
  const { promise } = await f.click("DEAL THE CARDS");
  await f.advance(2599);
  assert.equal(f.button("HIT").props.disabled, true);
  await f.advance(1);
  await promise;
  assert.equal(f.button("HIT").props.disabled, false);
  assert.deepEqual(f.completed, []);
  assert.deepEqual(f.increments, []);
  assert.equal(f.overlay(), false);
  f.unmount();
});
