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

function fixture(path, { props = {}, saved = {}, cardMove, resolveServer, localApi } = {}) {
  let hook = 0, now = 0, serial = 0, dirty = true, mounted = true, output;
  const slots = [], effects = [], timers = new Map(), modules = new Map(), calls = [], reveals = [];
  const storage = new Map();
  const handlers = new Map();
  let walletBalance = 10000;
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
    addEventListener(name, handler) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(handler);
    },
    removeEventListener(name, handler) { handlers.get(name)?.delete(handler); },
    dispatchEvent(event) { handlers.get(event.type)?.forEach(handler => handler(event)); },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const pool = {
    busy: false, enabled: false, checkpoint() {},
    announce() { reveals.push({ at: now }); },
    releaseBalance() { reveals.push({ at: now }); },
    revealReturn(amount) { reveals.push({ at: now, amount }); },
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
  const publishWallet = balance => {
    walletBalance = balance;
    window.dispatchEvent({ type: "wx:balance-update", detail: { balance } });
  };
  const wallet = () => load("src\\lib\\walletReveal.ts");
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
        getStoredWalletBalance: () => walletBalance,
        broadcastBalanceUpdate: raw => publishWallet(wallet().recordWalletBalance(raw)),
        holdWalletReveal: key => wallet().beginWalletReveal(key, walletBalance),
        confirmWalletReturn: (key, raw, credit) => {
          wallet().confirmWalletReveal(key, credit);
          if (raw !== null) publishWallet(wallet().recordWalletBalance(raw));
        },
        revealWalletReturn: (key, amount) => {
          const balance = wallet().finishWalletReveal(key, amount);
          if (balance !== null) publishWallet(balance);
        },
        fetchServerBalance: async () => {
          if (!localApi) return walletBalance;
          const response = await localApi("/api/player/balance", {});
          publishWallet(wallet().recordWalletBalance((await response.json()).balance));
          return walletBalance;
        },
      };
      if (name === "@/lib/client" && localApi) return { localApi };
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
    new Function("require", "module", "exports", "window", "localStorage", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "requestAnimationFrame", "cancelAnimationFrame", "performance", source)(
      require, module, module.exports, window, window.localStorage,
      window.setTimeout, window.clearTimeout, window.setInterval, window.clearInterval,
      fn => window.setTimeout(() => fn(now), 16), window.clearTimeout, { now: () => now },
    );
    return module.exports;
  }
  const module = load(path);
  const component = module.default ?? module.ThreeCardPoker ?? module.GameTable ?? module.LimboGame ?? module.PlinkoGame ?? module.Slot777Game;
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
    calls, reveals, pool, render, flush,
    get walletBalance() { return walletBalance; },
    pollWallet(raw) { publishWallet(wallet().recordWalletBalance(raw)); },
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

test("Limbo conceals the committed return until the multiplier animation finishes", async () => {
  const f = fixture("src\\components\\LimboGame.tsx", {
    localApi: async (_url, options) => ({
      ok: true, status: 200, json: async () => options.method === "POST"
        ? { balance: 1050, result: 2, won: true, payout: 100 }
        : { balance: 1000, limits: { min: 10, max: 10000, minTarget: 1.01, maxTarget: 100, rtp: 0.99 }, recent: [] },
    }),
  });
  try {
    await f.flush();
    const play = f.find("Bet").props.onClick();
    await f.flush();
    assert.equal(f.walletBalance, 950);
    f.pollWallet(1050);
    await f.advance(899);
    assert.equal(f.walletBalance, 950);
    assert.ok(text(f.render()).includes("950.00"));
    await f.advance(13);
    await play;
    assert.equal(f.walletBalance, 1050);
    assert.ok(text(f.render()).includes("1,050.00"));
  } finally { f.unmount(); }
});

test("Lucky 777 does not expose a paid result until all three reels stop", async () => {
  const f = fixture("src\\components\\Slot777Game.tsx", {
    localApi: async (_url, options) => ({
      ok: true, status: 200, json: async () => options.method === "POST"
        ? { balance: 1200, reels: ["seven", "seven", "seven"], win: { label: "Sevens", mult: 3 }, payout: 300 }
        : { balance: 1000, limits: { min: 10, max: 10000 }, paytable: [], recent: [] },
    }),
  });
  try {
    await f.flush();
    await f.click("SPIN");
    const reels = f.nodes().filter(node => typeof node.props?.onStop === "function");
    assert.equal(reels.length, 3);
    f.pollWallet(1200);
    assert.equal(f.walletBalance, 900);
    reels[0].props.onStop(); reels[1].props.onStop();
    await f.flush();
    assert.equal(f.walletBalance, 900);
    assert.ok(text(f.render()).includes("900.00"));
    reels[2].props.onStop();
    await f.flush();
    assert.equal(f.walletBalance, 1200);
    assert.ok(text(f.render()).includes("1,200.00"));
  } finally { f.unmount(); }
});

const plinkoTable = [1.8, 1.5, 1.3, 1.1, 1, 0.7, 0, 0.7, 1, 1.1, 1.3, 1.5, 1.8];

test("Plinko releases each return at landing, not on the drop receipt or a wallet poll", async () => {
  let authoritative = 1000;
  const f = fixture("src\\components\\PlinkoGame.tsx", {
    localApi: async (url, options) => {
      if (options.method === "POST") {
        assert.equal(JSON.parse(options.body).rows, 12);
        authoritative = 1076.4;
      }
      return { ok: true, status: 200, json: async () => options.method === "POST"
        ? { balance: 1076.4, path: Array(12).fill(1), bucket: 12, multiplier: 1.8, payout: 176.4 }
        : url === "/api/player/balance" ? { balance: authoritative }
        : { balance: authoritative, limits: { min: 10, max: 10000 }, rows: [12],
          tables: { medium: { 12: plinkoTable } }, recent: [] },
      };
    },
  });
  try {
    await f.flush();
    assert.ok(text(f.render()).includes("13 buckets with one center 0x"));
    assert.ok(!text(f.render()).includes("25x"));
    await f.click("Bet");
    f.pollWallet(1076.4);
    assert.equal(f.walletBalance, 900);
    await f.advance(2469);
    assert.equal(f.walletBalance, 900);
    await f.advance(1);
    assert.equal(f.walletBalance, 1076.4);
    assert.ok(text(f.render()).includes("1,076.4"));
  } finally { f.unmount(); }
});

test("overlapping Plinko balls ignore out-of-order balance receipts and reveal separately", async () => {
  const receipts = [];
  const f = fixture("src\\components\\PlinkoGame.tsx", {
    localApi: async (url, options) => {
      if (options.method === "POST") return new Promise(resolve => receipts.push(resolve));
      return { ok: true, json: async () => url === "/api/player/balance" ? { balance: 1152.8 }
        : { balance: receipts.length ? 1152.8 : 1000, limits: { min: 10, max: 10000 }, rows: [12],
          tables: { medium: { 12: plinkoTable } }, recent: [] } };
    },
  });
  const receipt = balance => ({ ok: true, status: 200, json: async () => ({
    balance, path: Array(12).fill(1), bucket: 12, multiplier: 1.8, payout: 176.4,
  }) });
  try {
    await f.flush();
    const first = f.find("Bet").props.onClick();
    const second = f.find("Bet").props.onClick();
    receipts[1](receipt(1152.8));
    await f.flush();
    await f.advance(100);
    receipts[0](receipt(1076.4));
    await Promise.all([first, second]);
    await f.flush();
    assert.equal(f.walletBalance, 800);
    await f.advance(2369);
    assert.equal(f.walletBalance, 800);
    await f.advance(1);
    assert.equal(f.walletBalance, 976.4);
    await f.advance(100);
    assert.equal(f.walletBalance, 1152.8);
  } finally { f.unmount(); }
});

test("Casino War reserves the table during a pending first chip and enables Deal on confirmation", async () => {
  const f = fixture("src\\components\\casino-war\\CasinoWar.tsx");
  let accept;
  let submissions = 0;
  f.pool.stake = () => { submissions++; return new Promise(resolve => { accept = resolve; }); };
  const ante = () => f.nodes().find(node => node.props?.label === "ANTE" && node.props.onClick);
  const deal = () => f.nodes().find(node => node.props?.onClick && text(node) === "DEAL");
  try {
    await f.advance(9900);
    const pending = ante().props.onClick();
    await f.flush();
    await ante().props.onClick();
    await f.advance(5000);
    assert.equal(submissions, 1, "a second chip must not compete with the unconfirmed wager");
    assert.equal(ante().props.amount, 0, "an unconfirmed chip is not shown as accepted");
    assert.equal(deal().props.disabled, true);
    assert.ok(f.nodes().some(node => text(node) === "CONFIRMING BET..."));
    accept(true);
    await pending;
    await f.flush();
    assert.equal(ante().props.amount, 100);
    assert.equal(deal().props.disabled, false);
    await f.advance(20000);
    assert.equal(ante().props.active, true, "spectator animations cannot seize an accepted table");
  } finally { f.unmount(); }
});

test("Casino War releases its idle-table claim after a rejected first chip so retry can succeed", async () => {
  const f = fixture("src\\components\\casino-war\\CasinoWar.tsx");
  const ante = () => f.nodes().find(node => node.props?.label === "ANTE" && node.props.onClick);
  try {
    f.pool.stake = async () => false;
    await ante().props.onClick();
    await f.flush();
    assert.equal(ante().props.amount, 0);
    f.pool.stake = async () => true;
    await ante().props.onClick();
    await f.flush();
    assert.equal(ante().props.amount, 100);
  } finally { f.unmount(); }
});

test("Casino War does not reuse the previous hand's chips while a rebet is still being confirmed", async () => {
  const f = fixture("src\\components\\casino-war\\CasinoWar.tsx", {
    cardMove: async () => ({
      phase: "result", view: { phase: "result", result: "win",
        player: { rank: 14, suit: "S" }, dealer: { rank: 2, suit: "H" }, tiePayout: 0 },
    }),
  });
  const ante = () => f.nodes().find(node => node.props?.label === "ANTE" && node.props.onClick);
  const button = label => f.nodes().find(node => node.props?.onClick && text(node) === label);
  let accept;
  f.pool.start = () => new Promise(resolve => { accept = resolve; });
  try {
    await ante().props.onClick();
    await f.flush();
    const dealing = button("DEAL").props.onClick();
    await f.advance(3000);
    await dealing;
    await f.flush();
    const pending = button("REBET").props.onClick();
    await f.flush();
    assert.equal(ante().props.amount, 0);
    assert.equal(button("DEAL").props.disabled, true);
    await f.advance(15000);
    accept(true);
    await pending;
    await f.flush();
    assert.equal(ante().props.amount, 100);
    assert.equal(button("DEAL").props.disabled, false);
  } finally { f.unmount(); }
});

test("Casino War enables Deal immediately after a surrendered tie and a newly accepted custom ante", async () => {
  let hands = 0;
  const f = fixture("src\\components\\casino-war\\CasinoWar.tsx", {
    cardMove: async move => {
      if (move === "surrender") return { phase: "result", view: { phase: "result", decision: "surrender" } };
      hands++;
      const tie = hands === 1;
      return { phase: tie ? "tie" : "result", view: { phase: tie ? "tie" : "result", result: tie ? "tie" : "win",
        player: { rank: 14, suit: "S" }, dealer: { rank: tie ? 14 : 2, suit: "H" }, tiePayout: 0 } };
    },
  });
  const ante = () => f.nodes().find(node => node.props?.label === "ANTE" && node.props.onClick);
  const button = label => f.nodes().find(node => node.props?.onClick && text(node) === label);
  const amountInput = () => f.nodes().find(node => node.props?.onChange && node.props.value === 100 && node.type.name === "BetAmountInput");
  try {
    await ante().props.onClick();
    await f.flush();
    const first = button("DEAL").props.onClick();
    await f.advance(2300);
    await first;
    await button("SURRENDER").props.onClick();
    await f.flush();
    amountInput().props.onChange(2345);
    await f.flush();
    await ante().props.onClick();
    await f.flush();
    assert.equal(ante().props.amount, 2345, "A finished surrender must not retain its in-flight lock");
    assert.equal(button("DEAL").props.disabled, false, "The next accepted ante needs no review/countdown wait");
    const second = button("DEAL").props.onClick();
    await f.advance(2300);
    await second;
    assert.equal(hands, 2);
    assert.deepEqual(f.calls.filter(call => call[0] === "stake"), [["stake", 100], ["stake", 2345]]);
  } finally { f.unmount(); }
});

test("Casino War supports repeated custom-stake rounds and only enables Deal after each new ante is confirmed", async () => {
  let hands = 0;
  const f = fixture("src\\components\\casino-war\\CasinoWar.tsx", {
    cardMove: async () => {
      hands++;
      const win = hands % 2 === 1;
      return { phase: "result", view: { phase: "result", result: win ? "win" : "lose",
        player: { rank: win ? 14 : 2, suit: "S" }, dealer: { rank: win ? 2 : 14, suit: "H" }, tiePayout: 0 } };
    },
  });
  const ante = () => f.nodes().find(node => node.props?.label === "ANTE" && node.props.onClick);
  const deal = () => f.nodes().find(node => node.props?.onClick && text(node) === "DEAL");
  const input = () => f.nodes().find(node => node.props?.onChange && node.type.name === "BetAmountInput");
  try {
    for (const amount of [10, 1234, 9999, 50, 100, 5000]) {
      input().props.onChange(amount);
      await f.flush();
      let confirm;
      f.pool.stake = stake => {
        assert.equal(stake, amount);
        f.calls.push(["stake", stake]);
        return new Promise(resolve => { confirm = resolve; });
      };
      const placing = ante().props.onClick();
      await f.flush();
      assert.equal(deal().props.disabled, true);
      confirm(true);
      await placing;
      await f.flush();
      assert.equal(ante().props.amount, amount, "Old hand's stakes must not be added to a fresh round");
      assert.equal(deal().props.disabled, false);
      const playing = deal().props.onClick();
      await f.advance(2300);
      await playing;
      await f.flush();
    }
    assert.equal(hands, 6);
  } finally { f.unmount(); }
});

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

for (const [game, path, props] of games.slice(0, 9)) {
  test(`${game}: watching shows 10 through 1 before the next automatic preview`, async () => {
    const f = fixture(`src\\components\\${path}`, { props });
    try {
      for (let second = 10; second > 0; second--) {
        assert.ok(f.nodes().some(node => node.props?.role === "status" && text(node) === `Next round in ${second}s`), `${game}: missing ${second}`);
        await f.advance(1000);
      }
      assert.ok(!f.nodes().some(node => text(node).startsWith("Next round in ")));
      assert.deepEqual(f.calls, []);
    } finally { f.unmount(); }
  });
}

test("blackjack: a preview rejects wagering; a valid interactive hand freezes autoplay and accepts only once", async () => {
  const card = (rank, id) => ({ rank: String(rank), value: rank, suit: "♠", id });
  const player = [card(4, 1), card(5, 2)], dealer = [card(8, 3)];
  const f = fixture("src\\components\\blackjack\\BlackjackGame.tsx", {
    cardMove: async () => ({ phase: "playing", view: { bet: 50, player, dealer, hidden: true } }),
  });
  await f.advance(10650);
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
  await f.advance(100);
  assert.equal(f.reveals.length, 0, "a confirmed win must remain hidden while dealer cards are revealing");
  await f.advance(8900);
  await Promise.all([stand, duplicate]);
  assert.equal(f.reveals.length, 1, "the terminal card presentation releases the balance once");
  assert.deepEqual(f.calls.map(call => call.slice(0, 2)), [["start", 50], ["move", "deal"], ["move", "stand"]]);
  const next = JSON.stringify(f.render());
  await f.advance(12000);
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
  await f.advance(10500);
  const zone = f.nodes().find(node => node.props?.["aria-label"] === "Bet on andar");
  assert.ok(zone);
  await zone.props.onClick();
  await f.advance(80000);
  assert.deepEqual(f.calls, []);
  f.unmount();
});
