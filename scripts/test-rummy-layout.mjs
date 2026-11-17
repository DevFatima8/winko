import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const engine = load("src\\components\\rummy\\engine.ts", {});
const hand = [
  ...[2, 3, 4].map(rank => ({ id: `${rank}S`, rank, suit: "S" })),
  ...[5, 6, 7].map(rank => ({ id: `${rank}H`, rank, suit: "H" })),
  ...[8, 9, 10].map(rank => ({ id: `${rank}D`, rank, suit: "D" })),
  ...[11, 12, 13, 14].map(rank => ({ id: `${rank}C`, rank, suit: "C" })),
];
function harness(phase = "play", presets = [10, 20, 50, 100, 200], unlockedLevel = 5) {
  const states = [], refs = [], calls = [], timers = [];
  let stateIndex = 0, refIndex = 0;
  const useState = initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  };
  const pool = { busy: false, announce() {}, start: async amount => { calls.push(["start", amount]); return true; } };
  const imports = {
    react: { useState, useRef(initial) { return refs[refIndex++] ??= { current: initial }; }, useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn },
    "next/image": { default: "img" },
    "react/jsx-runtime": jsx,
    "@/lib/gameBetLimits": { MAX_GAME_BET: 100000 },
    "@/lib/betPresets": { BET_PRESETS: presets },
    "@/lib/useDb": { useSession: () => ({ user: { name: "Player", avatar: "Avatar-02-Female" } }), useDb: () => ({ data: { unlockedLevel }, error: null, reload() {} }) },
    "@/lib/avatars": { isAvatar: value => value === "Avatar-02-Female", avatarSrc: value => `/avatars/${value}.png` },
    "@/lib/walletSync": {
      useGameBalance: () => [10000],
      usePoolLifecycle: () => pool,
      usePoolRoundState: (_game, key, initial) => useState(key === "phase" ? phase : key === "hand" ? hand : initial),
    },
    "@/components/BetAmountInput": { default: "amount-input" },
    "framer-motion": { motion: new Proxy({}, { get: (_, key) => `motion-${String(key)}` }), AnimatePresence: "presence" },
    "./engine": engine,
    "../teen-patti/useIdleCardRound": { useIdleCardRound: () => ({ preview: null, watching: false, countdown: null, claim: () => true, release() {} }) },
    "@/lib/interactiveCardClient": {
      restoreCardRound: async () => null,
      cardMove: async (_pool, move, selection) => { calls.push(["move", move, selection]); return { phase: "play", view: { hand } }; },
    },
    "./PlayingCard": { PlayingCard: "playing-card" },
    "./hooks": { usePersistentState: (_key, initial) => useState(initial), useSound: () => new Proxy({}, { get: () => () => {} }) },
    "./rummy.css": {},
  };
  const source = ts.transpileModule(readFileSync("src\\components\\rummy\\RummyGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "setTimeout", source)(
    name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports,
    fn => { timers.push(fn); return timers.length; },
  );
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    const nodes = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      visit(node.props?.children);
    };
    visit(module.exports.default());
    const zone = nodes.find(node => node.props?.["aria-label"] === "Place selected meld here");
    if (zone) zone.props.ref.current = { getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 100 }) };
    return nodes;
  };
  const cards = () => render().filter(node => node.props?.className?.split(" ").includes("rummy-hand-card"));
  const button = label => render().find(node => node.props?.["aria-label"] === label);
  const nextPlayerTurn = () => { const turn = states.findIndex(value => value && typeof value === "object" && "seat" in value && "until" in value); states[turn] = { seat: 0, until: 0 }; };
  return { render, cards, button, calls, timers, nextPlayerTurn };
}

test("Rummy keeps the header, exposes five exact-stake table choices and does not add a Lobby button", async () => {
  const h = harness("bet");
  assert.equal(h.render().filter(node => node.type === "header").length, 1);
  assert.ok(h.button("Rules"));
  const table = value => h.render().find(node => node.type === "button" && node.props.className?.startsWith("rummy-level ") && node.props.children[3].props.children[1] === value.toLocaleString());
  for (const value of [10, 20, 50, 100, 200]) assert.ok(table(value));
  table(200).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, [["start", 200], ["move", "deal", { level: 5 }]]);
  assert.ok(!h.render().some(node => /lobby/i.test(node.props?.["aria-label"] ?? "")));
});

test("Rummy displays current shared player presets after loading and submits the selected amount exactly", async () => {
  const presets = [10, 20, 50, 100, 200];
  const h = harness("bet", presets);
  const tables = () => h.render().filter(node => node.type === "button" && node.props.className?.startsWith("rummy-level "));
  const labels = () => tables().map(node => node.props.children[3].props.children[1]);
  presets.splice(0, presets.length, 10, 250, 1000, 2500, 100000);
  assert.deepEqual(labels(), presets.map(value => value.toLocaleString()));
  h.render().find(node => node.props?.["aria-label"] === "Bet amount presets").props.children[3].props.onClick();
  await h.render().find(node => node.type === "button" && node.props.className === "rummy-btn-gold rummy-deal-button").props.onClick();
  assert.deepEqual(h.calls, [["start", 2500], ["move", "deal", { level: 1 }]]);

  const switched = harness("bet", presets);
  presets.splice(0, presets.length, 10, 20, 50, 100, 200);
  const switchedLabels = switched.render().filter(node => node.type === "button" && node.props.className?.startsWith("rummy-level "))
    .map(node => node.props.children[3].props.children[1]);
  assert.deepEqual(switchedLabels, presets.map(value => value.toLocaleString()));
});

test("Rummy touch/mouse selection and dragging place only valid melds and keep settlement server-side", () => {
  const h = harness();
  const firstThree = h.cards().slice(0, 3);
  firstThree[0].props.onClick();
  h.cards()[1].props.onClick();
  const card = h.cards()[2];
  card.props.onPointerDown({ clientX: 30, clientY: 200, pointerId: 1, currentTarget: { setPointerCapture() {} } });
  card.props.onPointerMove({ clientX: 40, clientY: 50 });
  card.props.onPointerUp({ clientX: 40, clientY: 50 });
  assert.equal(h.cards().length, 10);
  assert.deepEqual(h.calls, [], "partial arrangement must not settle or change the wallet");
  assert.ok(h.cards().every(card => card.props.disabled), "computer turns block player moves");
  h.nextPlayerTurn();
  const takeBack = h.render().find(node => node.props?.title === "Take meld back");
  assert.ok(takeBack);
  takeBack.props.onClick();
  assert.equal(h.cards().length, 13);
  assert.deepEqual(h.calls, []);
});

test("Rummy opens on level entry with locked later levels, own profile avatar and two anonymous computer seats", () => {
  const entry = harness("bet", undefined, 1);
  const tables = entry.render().filter(node => node.type === "button" && node.props.className?.startsWith("rummy-level "));
  assert.deepEqual(tables.map(node => node.props.disabled), [false, true, true, true, true]);
  tables[4].props.onClick();
  assert.deepEqual(entry.calls, [], "locked levels cannot accept a wager");
  assert.ok(entry.render().some(node => node.type === "img" && node.props.alt === "Your profile avatar"));
  const game = harness();
  assert.equal(game.render().filter(node => node.props?.["aria-label"]?.startsWith("Computer-controlled seat")).length, 2);
  assert.ok(game.render().some(node => node.props?.children === "PASS TURN"));
});

test("Rummy progress endpoint reads only the authenticated player's levels and is not publicly cached", async () => {
  let user = null;
  const reads = [];
  const api = load("src\\app\\api\\player\\rummy\\route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (lock, callback) => { assert.equal(lock, "rummy-lock"); return callback({}); } } },
    "@/lib/dailyPoolRules": { dailyPoolLock: game => { assert.equal(game, "rummy"); return "rummy-lock"; } },
    "@/lib/rummyProgress": { rummyUnlockedLevel: async (_tx, id) => { reads.push(id); return 3; } },
  });
  assert.equal((await api.GET()).status, 401);
  user = { id: "staff", role: "admin" };
  assert.equal((await api.GET()).status, 401);
  assert.deepEqual(reads, []);
  user = { id: "player-a", role: "client" };
  const result = await api.GET();
  assert.deepEqual(result.body, { unlockedLevel: 3 });
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.deepEqual(reads, ["player-a"]);
});

test("Rummy rejects invalid dragged groups, supports place-button selection and sorts without replacing cards", () => {
  const h = harness();
  h.cards()[0].props.onClick();
  h.cards()[3].props.onClick();
  h.cards()[6].props.onClick();
  const place = () => h.render().find(node => node.type === "button" && node.props.className?.includes("rummy-btn-gold") && Array.isArray(node.props.children) && node.props.children[0] === "PLACE MELD");
  place().props.onClick();
  assert.equal(h.cards().length, 13);
  const original = h.cards().map(card => card.props["aria-label"]).sort();
  h.render().find(node => node.type === "button" && node.props.children === "AUTO SORT").props.onClick();
  assert.deepEqual(h.cards().map(card => card.props["aria-label"]).sort(), original);
  assert.ok(h.cards().every(card => card.props["aria-pressed"] === false));
  h.cards()[0].props.onClick();
  h.cards()[1].props.onClick();
  h.cards()[2].props.onClick();
  place().props.onClick();
  assert.equal(h.cards().length, 10);
  assert.deepEqual(h.calls, []);
});
