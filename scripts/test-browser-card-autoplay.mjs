import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const jsx = (type, props) => ({ type, props });
const noop = new Proxy(() => {}, { get: (_target, key) => key === "__esModule" ? true : noop });
const tree = node => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(tree) : [node, ...tree(node.props?.children)];
const text = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node)
  ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);

function fixture(path, { props = {}, saved = {}, cardMove, resolveServer } = {}) {
  let hook = 0, now = 0, serial = 0, dirty = true, mounted = true, output;
  const slots = [], effects = [], timers = new Map(), modules = new Map(), calls = [];
  const storage = new Map();
  const useState = initial => {
    const id = hook++;
    if (!(id in slots)) {
      const state = { value: typeof initial === "function" ? initial() : initial };
      state.set = value => {
        if (!mounted) return;
        const next = typeof value === "function" ? value(state.value) : value;
        if (!Object.is(next, state.value)) { state.value = next; dirty = true; }
      };
      slots[id] = state;
    }
    return [slots[id].value, slots[id].set];
  };
  const depsChanged = (old, next) => !next || !old || next.length !== old.length || next.some((v, i) => !Object.is(v, old[i]));
  const react = {
    useState,
    useRef: value => useState(() => ({ current: value }))[0],
    useMemo: (fn, deps) => {
      const id = hook++;
      if (!slots[id] || depsChanged(slots[id].deps, deps)) slots[id] = { deps, value: fn() };
      return slots[id].value;
    },
    useCallback: (fn, deps) => react.useMemo(() => fn, deps),
    useEffect: (fn, deps) => {
      const id = hook++;
      if (!slots[id] || depsChanged(slots[id].deps, deps)) {
        effects.push(() => {
          slots[id]?.cleanup?.();
          slots[id] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const schedule = (fn, ms, repeat = false) => {
    const id = ++serial;
    timers.set(id, { fn, at: now + ms, repeat: repeat ? ms : 0 });
    return id;
  };
  const window = {
    setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const pool = {
    busy: false, enabled: false, checkpoint() {}, announce() {},
    resume: async () => true,
    start: async amount => { calls.push(["start", amount]); return true; },
    stake: async amount => { calls.push(["stake", amount]); return true; },
    refund: async () => { calls.push(["refund"]); return true; },
    reduce: async amount => { calls.push(["reduce", amount]); return true; },
    resolveServer: async selection => {
      calls.push(["resolve", selection]);
      return resolveServer?.(selection);
    },
    cardAction: async (move, selection) => {
      calls.push(["move", move, selection]);
      return cardMove?.(move, selection);
    },
  };
  function load(file) {
    file = resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const require = name => {
      if (name.endsWith(".css")) return {};
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name.startsWith("next/")) return { default: name };
      if (name === "lucide-react") return new Proxy({}, { get: (_target, key) => String(key) });
      if (name === "framer-motion") return { motion: new Proxy({}, { get: (_target, key) => `motion-${String(key)}` }), AnimatePresence: "presence" };
      if (name === "canvas-confetti") return { default: noop };
      if (/sound|sfx|gameAudio/i.test(name)) return new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : noop });
      if (name === "@/lib/walletSync") return {
        useGameBalance: () => {
          const [value, set] = useState(10000);
          const update = react.useCallback(next => { calls.push(["balance-write"]); set(next); }, [set]);
          return [value, update];
        },
        usePoolLifecycle: () => pool,
        usePoolRoundState: (_game, key, initial) => useState(Object.hasOwn(saved, key) ? saved[key] : initial),
        getStoredWalletBalance: () => 10000,
        fetchServerBalance: async () => 10000,
      };
      if (name === "@/lib/interactiveCardClient") return {
        restoreCardRound: async () => null,
        cardMove: async (_pool, move, selection) => {
          calls.push(["move", move, selection]);
          return cardMove?.(move, selection);
        },
      };
      if (name === "./hooks" && file.includes("\\rummy\\")) return {
        usePersistentState: (_key, initial) => useState(initial), useSound: () => noop,
      };
      if (name === "@/components/GameOverOverlay") return { GameOverOverlay: "game-over" };
      let base;
      if (name.startsWith("@/")) base = resolve("src", name.slice(2).replaceAll("/", "\\"));
      else if (name.startsWith(".")) base = resolve(dirname(file), name.replaceAll("/", "\\"));
      else throw new Error(`Unexpected module ${name} in ${file}`);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate) && /\.[cm]?[jt]sx?$/.test(candidate));
      assert.ok(target, `Missing module ${name} from ${file}`);
      return load(target);
    };
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function("require", "module", "exports", "window", "localStorage", "setTimeout", "clearTimeout", "setInterval", "clearInterval", source)(
      require, module, module.exports, window, window.localStorage,
      window.setTimeout, window.clearTimeout, window.setInterval, window.clearInterval,
    );
    return module.exports;
  }
  const module = load(path);
  const component = module.default ?? module.ThreeCardPoker ?? module.GameTable;
  const render = () => {
    let safety = 0;
    while (dirty) {
      assert.ok(safety++ < 100, "render loop");
      dirty = false;
      hook = 0;
      output = component(props);
      effects.splice(0).forEach(effect => effect());
    }
    return output;
  };
  const flush = async () => {
    for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); }
  };
  render();
  return {
    calls, pool, render, flush,
    nodes: () => tree(render()),
    find: label => tree(render()).find(node => node.type === "button" && text(node).includes(label)),
    async click(label) {
      const button = this.find(label);
      assert.ok(button, `Missing button ${label}`);
      const promise = button.props.onClick();
      await flush();
      return promise;
    },
    async advance(ms) {
      await flush();
      const end = now + ms;
      let safety = 0;
      while (true) {
        assert.ok(safety++ < 5000, "timer loop");
        const timer = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!timer) break;
        const [id, value] = timer;
        now = value.at;
        if (value.repeat) value.at += value.repeat; else timers.delete(id);
        value.fn();
        await flush();
      }
      now = end;
      await flush();
    },
    unmount() {
      mounted = false;
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

test("Three Card Poker accepts custom stakes above 1000 on both spots and Play uses the server action", async () => {
  const cards = [
    { suit: "spades", rank: "A", id: "spades-A" },
    { suit: "hearts", rank: "A", id: "hearts-A" },
    { suit: "clubs", rank: "K", id: "clubs-K" },
  ];
  const dealer = [
    { suit: "diamonds", rank: "Q", id: "diamonds-Q" },
    { suit: "clubs", rank: "J", id: "clubs-J" },
    { suit: "hearts", rank: "9", id: "hearts-9" },
  ];
  const f = fixture("src\\components\\three-card-poker\\ThreeCardPoker.tsx", {
    cardMove: async move => ({
      phase: move === "deal" ? "decision" : "result",
      view: { ante: 2500, pairPlus: 2500, play: move === "play" ? 2500 : 0,
        player: cards, ...(move === "play" ? { dealer } : {}) },
    }),
  });
  try {
    const input = f.nodes().find(node => node.props?.onChange && node.props.value === 10);
    assert.ok(input, "custom amount input exists");
    assert.equal(input.props.max, undefined, "no artificial 1000/bankroll text clamp");
    input.props.onChange(2500);
    await f.flush();
    const spot = label => f.nodes().find(node => node.props?.label === label && node.props.onClick);
    await spot("Ante").props.onClick();
    await f.flush();
    await spot("Pair Plus").props.onClick();
    await f.flush();
    assert.equal(spot("Ante").props.amount, 2500);
    assert.equal(spot("Pair Plus").props.amount, 2500);
    assert.deepEqual(f.calls.filter(call => call[0] === "stake"), [["stake", 2500], ["stake", 2500]]);
    assert.equal(spot("Play").props.disabled, true, "Play waits for a dealt Ante hand");
    await f.click("Deal");
    await f.advance(4000);
    assert.equal(spot("Play").props.disabled, false);
    await spot("Play").props.onClick();
    await f.flush();
    assert.equal(spot("Play").props.amount, 2500);
    assert.equal(f.calls.filter(call => call[0] === "move" && call[1] === "play").length, 1);
    assert.equal(f.calls.some(call => call[0] === "balance-write"), false);
  } finally { f.unmount(); }
});

test("Texas Hold'em submits the exact custom opening bet, without clamping to a stale displayed wallet", async () => {
  // The actual component's state is driven by the server table response.
  const initial = {
    acceptedStake: 4321, grossReturn: 0, refundedStake: 0, handNumber: 1,
    deck: [], playerCards: [], dealerCards: [], community: [], pot: 8642,
    playerBet: 4321, dealerBet: 4321, currentBet: 4321, phase: "preflop",
    playerChips: 5679, dealerChips: 5679, playerActed: false, dealerActed: true,
    playerAllIn: false, dealerAllIn: false, folded: null, revealDealer: false,
    raises: 0, log: [], result: null,
  };
  const f = fixture("src\\components\\texas-holdem\\Game.tsx", {
    cardMove: async () => ({ phase: "preflop", view: { state: initial, frames: [initial] } }),
  });
  try {
    const input = f.nodes().find(node => node.props?.onChange && node.props.value === 10);
    assert.ok(input);
    assert.equal(input.props.max, undefined);
    input.props.onChange(4321);
    await f.flush();
    await f.click("Deal");
    await f.flush();
    assert.deepEqual(f.calls.filter(call => call[0] === "start"), [["start", 4321]]);
    assert.deepEqual(f.calls.filter(call => call[0] === "move"), [["move", "deal", { openingBet: 4321 }]]);
    assert.equal(f.calls.some(call => call[0] === "balance-write"), false);
  } finally { f.unmount(); }
});

test("Three Card Poker clearing the last wager reopens betting without a stuck spectator claim", async () => {
  const f = fixture("src\\components\\three-card-poker\\ThreeCardPoker.tsx");
  try {
    const spot = () => f.nodes().find(node => node.props?.label === "Ante" && node.props.onClick);
    await spot().props.onClick();
    await f.flush();
    await f.click("Clear");
    await spot().props.onClick();
    await f.flush();
    assert.equal(spot().props.amount, 10);
    assert.equal(f.calls.filter(call => call[0] === "stake").length, 2);
  } finally { f.unmount(); }
});

const games = [
  ["blackjack", "blackjack\\BlackjackGame.tsx"],
  ["teen-patti", "teen-patti\\TeenPattiGame.tsx"],
  ["rummy", "rummy\\RummyGame.tsx"],
  ["monster-hilo", "monster-hilo\\MonsterHiloGame.tsx"],
  ["three-card-poker", "three-card-poker\\ThreeCardPoker.tsx"],
  ["three-cards", "three-cards\\Game.tsx"],
  ["casino-war", "casino-war\\CasinoWar.tsx"],
  ["texas-holdem", "texas-holdem\\Game.tsx"],
  ["teen-patti-999", "teen-patti-999\\GameTable.tsx", { table: { boot: 10, name: "Test" }, onGameEnd: noop }],
  ["poker", "poker\\PokerGame.tsx"],
  ["poker-betting", "poker-betting\\components\\PokerGame.tsx"],
  ["muflis", "muflis\\MuflisGame.tsx"],
  ["amar-akbar-anthony", "amar-akbar-anthony\\AmarAkbarAnthonyGame.tsx"],
  ["teen-patti-ak47", "teen-patti-ak47\\TeenPattiAK47.tsx"],
  ["teen-patti-best-of-four", "teen-patti-best-of-four\\game\\TeenPattiGame.tsx"],
  ["teen-patti-hukam", "teen-patti-hukam\\Game.tsx"],
  ["teen-patti-joker", "teen-patti-joker\\game\\TeenPattiGame.tsx"],
  ["teen-patti-faceoff", "teen-patti-faceoff\\GameTable.tsx"],
  ["red-vs-black", "red-vs-black\\RedVsBlackGame.tsx"],
  ["bollywood-casino", "bollywood-casino\\CasinoGame.tsx"],
];

for (const [game, path, props] of games) {
  test(`${game}: actual component continuously deals while watching, without wallet or outcome-slot calls`, async () => {
    const f = fixture(`src\\components\\${path}`, { props });
    const snapshots = [new Set(), new Set()];
    for (let index = 0; index < 120; index++) {
      await f.advance(1000);
      snapshots[index < 60 ? 0 : 1].add(JSON.stringify(f.render(), (_key, value) => typeof value === "function" ? value.name : value));
    }
    assert.ok(snapshots.every(period => period.size >= 5), `${game} must animate successive rounds in both observation periods`);
    assert.deepEqual(f.calls, [], "spectators must not accept, resolve, settle, debit, credit or consume a player slot");
    assert.ok(!f.nodes().some(node => text(node) === "Queue next round"));
    f.unmount();
    const final = JSON.stringify(f.render());
    await f.advance(30000);
    assert.equal(JSON.stringify(f.render()), final, "unmounted spectator callbacks are cancelled");
  });
}

test("blackjack: a preview rejects wagering; a valid interactive hand freezes autoplay and accepts only once", async () => {
  const card = (rank, id) => ({ rank: String(rank), value: rank, suit: "♠", id });
  const player = [card(4, 1), card(5, 2)], dealer = [card(8, 3)];
  const f = fixture("src\\components\\blackjack\\BlackjackGame.tsx", {
    cardMove: async () => ({ phase: "playing", view: { bet: 50, player, dealer, hidden: true } }),
  });
  await f.advance(5650);
  await f.click("DEAL THE CARDS");
  assert.deepEqual(f.calls, []);
  await f.advance(6050);
  const button = f.find("DEAL THE CARDS");
  const first = button.props.onClick(), second = button.props.onClick();
  await f.advance(2600);
  await Promise.all([first, second]);
  assert.equal(f.calls.filter(call => call[0] === "start").length, 1);
  assert.equal(f.calls.filter(call => call[0] === "move").length, 1);
  const shown = f.nodes().filter(node => node.props?.card).map(node => node.props.card);
  await f.advance(30000);
  assert.deepEqual(f.nodes().filter(node => node.props?.card).map(node => node.props.card), shown, "spectators cannot overwrite an accepted hand");
  assert.equal(f.calls.length, 2);
  f.unmount();
});

test("blackjack: completing an interactive hand resumes spectator cycles, without implicit rebet or duplicate settlement", async () => {
  const card = (rank, id) => ({ rank: String(rank), value: rank, suit: "♠", id });
  const player = [card(10, 1), card(8, 2)], dealer = [card(10, 3), card(7, 4)];
  const f = fixture("src\\components\\blackjack\\BlackjackGame.tsx", {
    cardMove: async move => ({
      phase: move === "deal" ? "playing" : "settled",
      view: { bet: 50, player, dealer, hidden: move === "deal", outcome: "win", payout: 100 },
    }),
  });
  const dealt = f.find("DEAL THE CARDS").props.onClick();
  await f.advance(2600);
  await dealt;
  const stand = f.find("STAND").props.onClick();
  const duplicate = f.find("STAND").props.onClick();
  await f.advance(9000);
  await Promise.all([stand, duplicate]);
  assert.deepEqual(f.calls.map(call => call.slice(0, 2)), [["start", 50], ["move", "deal"], ["move", "stand"]]);
  const next = JSON.stringify(f.render());
  await f.advance(7000);
  assert.notEqual(JSON.stringify(f.render()), next, "next no-stake preview runs automatically");
  await f.advance(30000);
  assert.equal(f.calls.length, 3, "watching never replays the previous paid wager");
  f.unmount();
});

test("red vs black: clicks during dealing cannot queue or charge the following round", async () => {
  const f = fixture("src\\components\\red-vs-black\\RedVsBlackGame.tsx");
  await f.advance(10500);
  assert.equal(f.find("RED").props.disabled, true);
  await f.click("RED");
  await f.click("BLACK");
  await f.advance(50000);
  assert.deepEqual(f.calls, []);
  f.unmount();
});

test("Bollywood: clicks during a spectator deal cannot queue or charge the following hand", async () => {
  const f = fixture("src\\components\\bollywood-casino\\CasinoGame.tsx");
  await f.advance(20500);
  const zone = f.nodes().find(node => node.props?.["aria-label"] === "Bet on andar");
  assert.ok(zone);
  await zone.props.onClick();
  await f.advance(80000);
  assert.deepEqual(f.calls, []);
  f.unmount();
});
