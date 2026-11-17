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
function harness(phase = "play", presets = [10, 20, 50, 100, 200], unlockedLevel = 5, dealtHand = hand, restore = null, opening = false, moveResult) {
  const states = [], refs = [], calls = [], timers = [], effects = [], pendingEffects = [];
  const intervals = new Map(), timeouts = new Map();
  let stateIndex = 0, refIndex = 0, effectIndex = 0, now = 1000, timerId = 0;
  const useState = initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = index === 3 ? opening || phase === "bet" : index === 4 ? false : typeof initial === "function" ? initial() : initial;
    return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  };
  const pool = { busy: false, announce() {}, start: async amount => { calls.push(["start", amount]); return true; } };
  const imports = {
    react: {
      useState, useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useEffect(fn, deps) {
        const index = effectIndex++, previous = effects[index];
        if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
          pendingEffects.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; });
        }
      },
      useMemo: fn => fn(), useCallback: fn => fn,
    },
    "next/image": { default: "img" },
    "react/jsx-runtime": jsx,
    "@/lib/gameBetLimits": { MAX_GAME_BET: 100000 },
    "@/lib/betPresets": { BET_PRESETS: presets },
    "@/lib/useDb": { useSession: () => ({ user: { name: "Player", avatar: "Avatar-02-Female" } }), useDb: () => ({ data: { unlockedLevel }, error: null, reload() {} }) },
    "@/lib/avatars": { isAvatar: value => value === "Avatar-02-Female", avatarSrc: value => `/avatars/${value}.png` },
    "@/lib/walletSync": {
      useGameBalance: () => [10000],
      usePoolLifecycle: () => pool,
      usePoolRoundState: (_game, key, initial) => useState(key === "phase" ? phase : key === "hand" ? dealtHand : initial),
    },
    "@/components/BetAmountInput": { default: "amount-input" },
    "framer-motion": { motion: new Proxy({}, { get: (_, key) => `motion-${String(key)}` }), AnimatePresence: "presence" },
    "./engine": engine,
    "../teen-patti/useIdleCardRound": { useIdleCardRound: () => ({ preview: null, watching: false, countdown: null }) },
    "@/lib/interactiveCardClient": {
      restoreCardRound: async () => restore ?? (phase === "play" && !opening ? { phase: "play", view: { hand: dealtHand }, stake: 500, payout: 0 } : null),
      cardMove: async (_pool, move, selection) => {
        calls.push(["move", move, selection]);
        if (moveResult && move !== "deal") return moveResult(move);
        return { phase: move === "deal" ? "play" : "result", view: { hand: dealtHand, win: move === "declare" }, stake: restore?.stake ?? 500, payout: 0 };
      },
    },
    "./PlayingCard": { PlayingCard: "playing-card" },
    "./hooks": { usePersistentState: (_key, initial) => useState(initial), useSound: () => new Proxy({}, { get: () => () => {} }) },
    "./rummy.css": {},
  };
  const source = ts.transpileModule(readFileSync("src\\components\\rummy\\RummyGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", source)(
    name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports,
    (fn, delay) => { timers.push(fn); timeouts.set(++timerId, { fn, at: now + delay }); return timerId; },
    id => timeouts.delete(id),
    fn => { intervals.set(++timerId, fn); return timerId; },
    id => intervals.delete(id),
    class extends Date { static now() { return now; } },
  );
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
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
    while (pendingEffects.length) pendingEffects.shift()();
    return nodes;
  };
  const cards = () => render().filter(node => node.props?.className?.split(" ").includes("rummy-hand-card"));
  const button = label => render().find(node => node.props?.["aria-label"] === label);
  const nextPlayerTurn = () => { const turn = states.findIndex(value => value && typeof value === "object" && "seat" in value && "until" in value); states[turn] = { seat: 0, until: 0 }; };
  const advance = async milliseconds => {
    render();
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
      now += Math.min(100, milliseconds - elapsed);
      for (const [id, timer] of [...timeouts]) if (timer.at <= now) { timeouts.delete(id); timer.fn(); }
      for (const fn of [...intervals.values()]) fn();
      await Promise.resolve();
      render();
    }
  };
  return { render, cards, button, calls, timers, nextPlayerTurn, advance };
}

test("Rummy keeps the header, exposes five exact-stake table choices and does not add a Lobby button", async () => {
  const h = harness("bet");
  assert.equal(h.render().filter(node => node.type === "header").length, 1);
  assert.ok(h.button("Rules"));
  await new Promise(resolve => setImmediate(resolve));
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
  await new Promise(resolve => setImmediate(resolve));
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

const activeComputer = h => h.render().find(node => node.props?.["aria-label"]?.startsWith("Computer-controlled seat") && node.props.className.includes("rummy-seat-active"));
const playedComputers = h => h.render().filter(node => /^Computer seat \d arranged cards$/.test(node.props?.["aria-label"] ?? ""));
async function join(h) {
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  h.button("Level 1, stake Rs. 10, join").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  await h.advance(1400);
}

test("all Rummy seats receive 15 seconds, early placement passes immediately and computer activity never reveals their cards", async () => {
  const h = harness("bet");
  await join(h);
  const containsCards = node => Array.isArray(node)
    ? node.some(containsCards)
    : !!node && typeof node === "object" && (node.type === "playing-card" || node.type === "i" || containsCards(node.props?.children));
  const seats = () => h.render().filter(node => node.props?.["aria-label"]?.startsWith("Computer-controlled seat"));
  assert.ok(seats().every(node => !containsCards(node)), "computer hands and card backs must stay hidden");
  for (let i = 0; i < 3; i++) h.cards()[i].props.onClick();
  h.render().find(node => node.type === "button" && node.props.children?.[0] === "PLACE MELD").props.onClick();
  assert.equal(activeComputer(h).props["aria-label"], "Computer-controlled seat 1");
  assert.ok(h.render().some(node => node.type === "small" && node.props.children?.[0] === 15 && node.props.className === "rummy-computer-timer"));
  await h.advance(6000);
  assert.equal(playedComputers(h).length, 0, "computer cannot immediately place its cards");
  await h.advance(6100);
  assert.equal(playedComputers(h).length, 1);
  assert.equal(activeComputer(h).props["aria-label"], "Computer-controlled seat 2");
  await h.advance(12100);
  assert.equal(playedComputers(h).length, 2);
  assert.ok(seats().every(node => !containsCards(node)), "computer melds stay hidden after their moves too");
  assert.equal(activeComputer(h), undefined);
  assert.ok(h.cards().every(card => !card.props.disabled), "real player gets the next turn");
  assert.equal(h.cards().length, 10, "computer moves never alter the player's hand");
  assert.deepEqual(h.calls, [["start", 10], ["move", "deal", { level: 1 }]]);
});

test("player timeout automatically places an available partial meld at 15 seconds, even from an unsolvable hand", async () => {
  const partial = [
    ...hand.slice(0, 3),
    ...[5, 7, 9, 11, 13].map(rank => ({ id: `${rank}H`, rank, suit: "H" })),
    ...[6, 8, 10, 12, 14].map(rank => ({ id: `${rank}D`, rank, suit: "D" })),
  ];
  assert.equal(engine.solve(partial), null);
  const h = harness("bet", undefined, 5, partial);
  await join(h);
  await h.advance(14800);
  assert.equal(h.cards().length, 13);
  await h.advance(200);
  assert.equal(h.cards().length, 10);
  assert.ok(activeComputer(h));
  assert.equal(h.calls.length, 2, "timeout neither accepts another stake nor settles a partial hand");
});

test("timeout with no valid meld sorts the existing cards then passes without loss or a new wager", async () => {
  const noMeld = Array.from({ length: 13 }, (_, index) => {
    const rank = index + 2, suit = index % 2 ? "H" : "S";
    return { id: `${rank}${suit}`, rank, suit };
  }).reverse();
  assert.equal(engine.availableMeld(noMeld), null);
  const h = harness("bet", undefined, 5, noMeld);
  await join(h);
  const before = h.cards().map(node => node.props["aria-label"]);
  await h.advance(15000);
  const after = h.cards().map(node => node.props["aria-label"]);
  assert.deepEqual([...after].sort(), [...before].sort());
  assert.notDeepEqual(after, before);
  assert.ok(activeComputer(h));
  assert.deepEqual(h.calls, [["start", 10], ["move", "deal", { level: 1 }]]);
});

test("reopening an active Rummy hand always shows entry first and resumes only on explicit click without a new wager", async () => {
  const saved = { phase: "play", view: { hand, level: 2 }, stake: 250, payout: 0 };
  const h = harness("play", undefined, 5, hand, saved, true);
  assert.ok(h.render().some(node => node.props?.className === "rummy-entry"));
  assert.equal(h.cards().length, 0);
  await new Promise(resolve => setImmediate(resolve));
  await h.advance(30000);
  assert.equal(h.cards().length, 0, "saved turn cannot play behind the bet-selection screen");
  assert.deepEqual(h.calls, []);
  const resume = h.render().find(node => node.props?.children === "RESUME SAVED HAND");
  await resume.props.onClick();
  assert.equal(h.cards().length, 13);
  assert.deepEqual(h.calls, [], "resume must not accept another stake");
});

test("accepted but undealt saved wagers wait on entry until Resume rather than automatically dealing", async () => {
  const h = harness("play", undefined, 5, hand, { phase: "accepted", view: {}, stake: 100, payout: 0 }, true);
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.cards().length, 0);
  assert.deepEqual(h.calls, []);
  await h.render().find(node => node.props?.children === "RESUME SAVED HAND").props.onClick();
  assert.equal(h.cards().length, 13);
  assert.deepEqual(h.calls, [["move", "deal", undefined]]);
});

test("Rummy can play LV1 again after winning, without locking an already unlocked level", async () => {
  const h = harness("bet", undefined, 2);
  await join(h);
  for (const meld of engine.solve(hand)) {
    h.nextPlayerTurn();
    for (const card of meld.cards) {
      h.cards().find(node => node.props["aria-label"] === `${engine.RANK_LABEL[card.rank]} of ${engine.SUIT_SYMBOL[card.suit]}`).props.onClick();
    }
    h.render().find(node => node.type === "button" && node.props.children?.[0] === "PLACE MELD").props.onClick();
  }
  await h.advance(1900);
  h.render().find(node => node.props?.children === "CHOOSE BET & PLAY AGAIN").props.onClick();
  await join(h);
  assert.deepEqual(h.calls.map(call => call.slice(0, 2)), [["start", 10], ["move", "deal"], ["move", "declare"], ["start", 10], ["move", "deal"]]);
  assert.deepEqual(h.calls.at(-1)[2], { level: 1 });
  assert.equal(h.cards().length, 13);
});

test("Rummy starts fresh only after a saved hand is confirmed forfeited and a new stake is selected", async () => {
  let confirmDrop;
  const saved = { phase: "play", view: { hand, level: 2 }, stake: 250, payout: 0 };
  const h = harness("play", undefined, 2, hand, saved, true, () => new Promise(resolve => { confirmDrop = resolve; }));
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  const fresh = () => h.render().find(node => node.props?.children === "FORFEIT & START FRESH");
  const table = () => h.button("Level 1, stake Rs. 10, join");
  assert.equal(table().props.disabled, true);
  fresh().props.onClick();
  fresh().props.onClick();
  assert.equal(table().props.disabled, true);
  assert.deepEqual(h.calls, [["move", "forfeit", undefined]]);
  confirmDrop({ phase: "result", view: { win: false }, stake: 250, payout: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fresh(), undefined);
  assert.equal(table().props.disabled, false);
  assert.deepEqual(h.calls, [["move", "forfeit", undefined]], "starting fresh is not consent to a new bet");
  await join(h);
  assert.deepEqual(h.calls.slice(1), [["start", 10], ["move", "deal", { level: 1 }]]);
});
