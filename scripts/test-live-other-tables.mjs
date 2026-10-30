import assert from "node:assert/strict";
import { legacyBrowserPool } from "./browser-pool-legacy-stub.mjs";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as nodeCrypto from "node:crypto";
import { webcrypto } from "node:crypto";

// Interactive card tables call the real server engines through pool.cardAction.
const CARD_ENGINES = {
  rummy: ["interactiveRummy.ts", "rummyEngine"],
  "teen-patti": ["interactiveTeenPatti.ts", "teenPattiEngine"],
  "teen-patti-999": ["interactiveTeenPatti999.ts", "teenPatti999Engine"],
  "texas-holdem": ["interactiveTexasHoldem.ts", "texasHoldemEngine"],
};

const root = process.cwd();
// Shared Sic Bo, Tai Xiu and 7 Up Down component/hook regressions live in
// test-multiplayer-dice-crash.mjs; the local-round assertions below remain for
// games that have not migrated to server-backed multiplayer.
const games = [
  ["teen-patti-ak47\\TeenPattiAK47.tsx"],
  ["teen-patti-best-of-four\\game\\TeenPattiGame.tsx"],
  ["teen-patti-faceoff\\GameTable.tsx", "GameTable"],
  ["teen-patti-hukam\\Game.tsx"],
  ["teen-patti-joker\\game\\TeenPattiGame.tsx"],
  ["amar-akbar-anthony\\AmarAkbarAnthonyGame.tsx"],
  ["evo-casino\\EvoCasinoGame.tsx"],
  ["head-tail\\HeadTailGame.tsx"],
  ["poker-betting\\components\\PokerGame.tsx"],
  ["muflis\\MuflisGame.tsx"],
  ["thai-hi-lo\\hi-lo-game.tsx"],
];
const cardTables = [
  // Shared Baccarat, Speed Baccarat, Football Studio and 32 Cards now run their
  // spectator/queue/cancel/no-repeat cases in test-multiplayer-cards.mjs against
  // server snapshots; the local timer/wallet harness below no longer applies.
  ["red-vs-black\\RedVsBlackGame.tsx", "placeBet", "red"],
  ["bollywood-casino\\CasinoGame.tsx", "place", "andar"],
];
const browserCards = [
  { file: "teen-patti-ak47\\TeenPattiAK47.tsx", names: ["addChip", "startDeal", "clearBets", "ante", "pairPlus"], place: v => v.addChip(50), start: v => v.startDeal(), clear: v => v.clearBets(), stake: v => v.ante + v.pairPlus },
  { file: "teen-patti-best-of-four\\game\\TeenPattiGame.tsx", names: ["addChip", "deal", "clearBet", "bet"], place: v => v.addChip(50), start: v => v.deal(v.bet), clear: v => v.clearBet(), stake: v => v.bet },
  { file: "teen-patti-faceoff\\GameTable.tsx", exported: "GameTable", names: ["placeBet", "startRound", "clearBets", "bets"], place: v => v.placeBet("A"), start: v => v.startRound(), clear: v => v.clearBets(), stake: v => Object.values(v.bets).reduce((a, b) => a + b, 0), prepaid: true },
  { file: "teen-patti-hukam\\Game.tsx", names: ["placeBet", "deal", "clearBets", "bets"], place: v => v.placeBet("A"), start: v => v.deal(), clear: v => v.clearBets(), stake: v => v.bets.A + v.bets.B, prepaid: true },
  { file: "teen-patti-joker\\game\\TeenPattiGame.tsx", names: ["placeBet", "deal", "clearBets", "bets"], place: v => v.placeBet("player"), start: v => v.deal(), clear: v => v.clearBets(), stake: v => Object.values(v.bets).reduce((a, b) => a + b, 0), prepaid: true },
  { file: "amar-akbar-anthony\\AmarAkbarAnthonyGame.tsx", names: ["placeBet", "deal", "clearBets", "bets"], place: v => v.placeBet("amar"), start: v => v.deal(), clear: v => v.clearBets(), stake: v => Object.values(v.bets).reduce((a, b) => a + b, 0), prepaid: true },
  { file: "poker-betting\\components\\PokerGame.tsx", names: ["addChip", "deal", "clearBet", "bet"], place: v => v.addChip(50), start: v => v.deal(), clear: v => v.clearBet(), stake: v => v.bet },
  { file: "muflis\\MuflisGame.tsx", names: ["addChip", "deal", "clearBet", "bet"], place: v => v.addChip(50), start: v => v.deal(), clear: v => v.clearBet(), stake: v => v.bet },
];

function harness(file, exported = "default", initialBalance = 10000, captureNames = [], props = {}, cardWin = true, pokerRouletteWin = false) {
  const serverOutcomes = [];
  let now = 0, sequence = 0, index = 0, dirty = true, tree, component, balance = initialBalance;
  let captured;
  const slots = [], effects = [], timers = new Map(), changes = [], cache = new Map(), phases = [];
  const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: "fragment",
    useState(initial, label) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === "function" ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) {
          if (typeof next === "string" && ["idle", "betting", "dealing", "spinning", "result", "settled", "revealed", "reveal"].includes(next)) phases.push(next);
          if (label === "live-running") phases.push(next ? "rolling" : "betting");
          slots[i] = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const i = index++;
      return slots[i] ??= { current: initial };
    },
    useMemo(fn, deps) {
      const i = index++;
      if (!slots[i] || depsChanged(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useReducer(reducer, initial) {
      const [value, setValue] = react.useState(initial);
      return [value, (action) => setValue((previous) => reducer(previous, action))];
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || depsChanged(slots[i].deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const noop = () => {};
  const sound = new Proxy(noop, { get: () => sound });
  const setTimer = (fn, delay = 0, repeat = false) => {
    const id = ++sequence;
    timers.set(id, { fn, at: now + delay, delay, repeat });
    return id;
  };
  const storage = new Map();
  const window = {
    setTimeout: (fn, ms) => setTimer(fn, ms), clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => setTimer(fn, ms, true), clearInterval: (id) => timers.delete(id),
    addEventListener: noop, removeEventListener: noop,
    dispatchEvent: noop,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  };
  const context = vm.createContext({
    console, React: react, window, localStorage: window.localStorage, crypto: webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    setInterval: window.setInterval, clearInterval: window.clearInterval,
    requestAnimationFrame: (fn) => setTimer(fn, 16),
    queueMicrotask: (fn) => setTimer(fn, 0),
    AbortController, AbortSignal, HTMLElement: class {}, HTMLInputElement: class {},
    fetch: async (_url, options) => {
      const input = JSON.parse(options?.body ?? "{}");
      return { ok: true, json: async () => file.includes("tai-xiu")
        ? { id: String(now), createdAt: new Date().toISOString(), prediction: input.side, side: input.side === "tai" ? "xiu" : "tai", stake: input.stake, dice: [1, 2, 3], total: 6, won: false, payout: 0 }
        : { result: "head", win: false } };
    },
    document: { addEventListener: noop, removeEventListener: noop },
    performance: { now: () => now },
    Date: class extends Date {
      constructor(value) { super(value === undefined ? now : value); }
      static now() { return now; }
    },
    __capture: (value) => { captured = value; },
  });
  const setBalance = (fn) => {
    const next = typeof fn === "function" ? fn(balance) : fn;
    changes.push({ at: now, before: balance, after: next });
    balance = next;
    dirty = true;
  };
  const pool = legacyBrowserPool({
    useState: react.useState,
    balance: () => balance, update: setBalance,
    cardEngine: game => {
      const [module, name] = CARD_ENGINES[game];
      return { engine: load(path.join(root, "src", "lib", module))[name], win: cardWin };
    },
    resolve: async (game, stake, selection) => {
      const engine = relative => load(path.join(root, "src", "components", relative));
      if (game === "thai-hi-lo") {
        const rules = engine("thai-hi-lo\\lib\\hi-lo.ts");
        const dice = rules.ALL_COMBOS.find(dice => !rules.isWin(selection.bet, dice));
        return { outcome: { dice, won: false, payout: 0 }, claim: 0 };
      }
      if (game === "amar-akbar-anthony") {
        const win = ["amar", "akbar", "anthony"].find(key => selection.bets[key] === 0);
        assert.ok(win, "fixture needs an uncovered winning box");
        return { outcome: { win, playerWins: false, rank: "7", payout: 0 }, claim: 0 };
      }
      if (game === "bollywood-casino") {
        const winner = ["andar", "bahar", "joker"].find(key => selection.bets[key] === 0);
        const hand = engine("bollywood-casino\\lib\\engine.ts").buildHand(winner === "joker" ? "bahar" : winner, winner === "joker");
        return { outcome: { ...hand, payout: 0 }, claim: 0 };
      }
      if (game === "teen-patti-hukam") {
        const winner = selection.bets.A > 0 ? "B" : "A";
        return { outcome: { ...engine("teen-patti-hukam\\lib\\hukam.ts").makeRound(winner), payout: 0 }, claim: 0 };
      }
      if (game === "teen-patti-joker") {
        const rules = engine("teen-patti-joker\\lib\\teen-patti.ts");
        const winner = ["player", "dealer", "tie"].find(key => rules.returnsForOutcome(selection.bets, key) === 0);
        assert.ok(winner, "fixture needs an unpaid outcome");
        return { outcome: { ...rules.buildRound(winner), payout: 0 }, claim: 0 };
      }
      if (game === "teen-patti-faceoff") {
        const rules = engine("teen-patti-faceoff\\lib\\teenpatti.ts");
        const hand = rules.dealForTarget(selection.bets, "lose");
        const result = rules.settle(hand.handA, hand.handB, selection.bets);
        assert.equal(result.totalReturned, 0, "fixture uses card-consistent unpaid main bet");
        return { outcome: { ...result, payout: result.totalReturned }, claim: result.totalReturned };
      }
      if (game === "muflis") return { outcome: { ...engine("muflis\\lib\\muflis.ts").dealRigged(false), payout: 0 }, claim: 0 };
      if (game === "teen-patti-best-of-four") return { outcome: { ...engine("teen-patti-best-of-four\\lib\\teenpatti.ts").dealRigged(0), payout: 0 }, claim: 0 };
      if (game === "teen-patti-ak47") return { outcome: { ...engine("teen-patti-ak47\\lib\\teenpatti.ts").dealRound(false), payout: 0 }, claim: 0 };
      if (game === "poker-betting") return { outcome: { ...engine("poker-betting\\lib\\poker.ts").dealRound(false), payout: 0 }, claim: 0 };
      if (game === "poker-roulette") {
        const rules = engine("poker-roulette\\lib\\poker.ts");
        const cats = Object.keys(selection.bets).map(Number);
        const target = pokerRouletteWin ? 9 : Math.min(...cats) - 1;
        const cards = rules.constructHand(target);
        const category = rules.evaluateHand(cards);
        const raw = Object.entries(selection.bets).reduce((sum, [cat, amount]) =>
          sum + (category >= Number(cat) ? amount * (rules.CATEGORY_ODDS[cat] + 1) : 0), 0);
        const payout = Math.min(Math.round(raw * 100), Math.round(stake * 200)) / 100;
        serverOutcomes.push({ cards, category, winners: cats.filter(cat => category >= cat), payout });
        return { outcome: serverOutcomes.at(-1), claim: payout };
      }
      if (game === "red-vs-black") {
        return { outcome: { winningColor: selection.color === "red" ? "black" : "red", isWin: false,
          suit: selection.color === "red" ? "♠" : "♥", value: "7", payout: 0 }, claim: 0 };
      }
      const response = await context.fetch("/fixture", { body: JSON.stringify({ ...selection, stake }) });
      return { outcome: await response.json(), claim: 0 };
    },
  });
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const require = (name) => {
      if (name === "react") return react;
      if (name === "node:crypto") return nodeCrypto;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "@/lib/walletSync") return {
        ...pool, useGameBalance: () => [balance, setBalance],
        fetchServerBalance: async () => balance, getStoredWalletBalance: () => balance,
      };
      if (/sounds?$|\/sfx$/.test(name)) return new Proxy({}, { get: () => sound });
      if (name === "@/lib/gameSfx") return { gameSfx: sound };
      if (name === "canvas-confetti") return { __esModule: true, default: noop };
      if (name === "framer-motion") return { motion: new Proxy({}, { get: (_, k) => k }), AnimatePresence: "presence" };
      if (name === "lucide-react") return new Proxy({}, { get: (_, k) => String(k) });
      if (name.endsWith("/GameOverOverlay")) return { GameOverOverlay: () => null, GameResultMessage: () => null, SharedGameResults: {} };
      if (name.startsWith("next/")) return { __esModule: true, default: "link" };
      if (name.endsWith(".css")) return {};
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = ["", ".ts", ".tsx", "\\index.ts", "\\index.tsx"].map((suffix) => base + suffix).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved) throw new Error(`Cannot load ${name} from ${filename}`);
      return load(resolved);
    };
    let source = fs.readFileSync(filename, "utf8");
    if (filename.endsWith("tai-xiu-game\\casino.tsx")) {
      source = source.replace("const [running, setRunning] = useState(false);", 'const [running, setRunning] = useState(false, "live-running");');
      assert.ok(source.includes('"live-running"'), "Observe the actual Tai Xiu live-round state");
    }
    const capture = (ctx) => (root) => {
      const visit = (node) => {
        if (filename === path.join(rootPath, file) && captureNames.length && ts.isFunctionDeclaration(node) &&
            (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ||
              exported !== "default" && node.name?.text === exported)) {
          const statements = [...node.body.statements];
          statements.splice(statements.length - 1, 0, ts.factory.createExpressionStatement(ts.factory.createCallExpression(
            ts.factory.createIdentifier("__capture"), undefined,
            [ts.factory.createObjectLiteralExpression(captureNames.map((name) => ts.factory.createShorthandPropertyAssignment(name)))],
          )));
          return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name,
            node.typeParameters, node.parameters, node.type, ts.factory.updateBlock(node.body, statements));
        }
        return ts.visitEachChild(node, visit, ctx);
      };
      return ts.visitNode(root, visit);
    };
    const rootPath = path.join(root, "src", "components");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
      transformers: { before: [capture] },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename })(require, loaded, loaded.exports);
    return loaded.exports;
  }
  component = load(path.join(root, "src", "components", file))[exported];
  function flush() {
    for (let n = 0; dirty && n < 100; n++) {
      dirty = false;
      index = 0;
      tree = component(props);
      for (const effect of effects.splice(0)) effect();
    }
    assert.equal(dirty, false, "render converges");
  }
  async function advance(ms) {
    const drain = async () => {
      for (let i = 0; i < 12; i++) { await Promise.resolve(); flush(); }
    };
    await drain();
    const end = now + ms;
    for (let n = 0; n < 10000; n++) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      timer.fn();
      await drain();
    }
    now = end;
    await drain();
  }
  function nodes(node) {
    if (arguments.length === 0) node = tree;
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function click(label) {
    const button = nodes().find((node) => node.type === "button" && nodesText(node).trim() === label);
    assert.ok(button, `button ${label} exists`);
    button.props.onClick();
    flush();
  }
  function nodesText(node) {
    if (Array.isArray(node)) return node.map(nodesText).join("");
    if (node == null || typeof node === "boolean") return "";
    if (typeof node !== "object") return String(node);
    return nodesText(node.props?.children);
  }
  flush();
  return {
    advance, changes, click, nodes, phases, text: () => nodesText(tree), load,
    balance: () => balance, serverOutcomes,
    get captured() { return captured; },
    invoke: (fn) => { fn(captured); flush(); },
    setFunds: (value) => { balance = value; dirty = true; flush(); },
    input: (label, value) => {
      const input = nodes().find((node) => node.props?.["aria-label"] === label);
      assert.ok(input, `input ${label} exists`);
      input.props.onChange({ target: { value } });
      flush();
    },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test("Thai Hi-Lo keeps an exact custom amount, debits once and accepts another bet after the next betting window", async () => {
  const game = harness("thai-hi-lo\\hi-lo-game.tsx", "default", 100000000,
    ["handleSelectBet", "handleRoll", "betAmount", "phase"]);
  const amount = () => game.nodes().find(node => node.props?.className === "hilo-amount-input");
  assert.ok(amount(), "dedicated visible custom amount field");
  assert.equal(amount().props.max, undefined, "do not clamp against a stale wallet snapshot");
  game.invoke(() => amount().props.onChange(4321));
  assert.equal(amount().props.value, 4321);
  assert.equal(game.captured.betAmount, 4321);
  game.invoke(v => v.handleSelectBet("high"));
  game.invoke(v => { v.handleRoll(); v.handleRoll(); });
  await game.advance(100);
  assert.equal(game.balance(), 99995679, "chosen amount debited once");
  assert.equal(game.changes.filter(change => change.after < change.before).length, 1);
  await game.advance(3100);
  assert.equal(game.captured.phase, "idle");
  game.invoke(v => v.handleSelectBet("triple"));
  game.invoke(v => v.handleRoll());
  await game.advance(1500);
  assert.equal(game.balance(), 99991358, "next wager still uses exact custom stake");
  assert.equal(game.changes.filter(change => change.after < change.before).length, 2);
  game.unmount();
});

for (const [file, exported] of games.filter(([file]) => !browserCards.some(card => card.file === file))) {
  const closedAt = file.includes("faceoff") ? 16000 : file.includes("hukam") ? 13000 : 5200;
  test(`${file}: spectator rounds never touch wallet or personal game-over`, async () => {
    const game = harness(file, exported);
    await game.advance(60000);
    assert.deepEqual(game.changes, [], "spectator must not invoke wallet setter, even with zero");
    assert.ok(game.phases.filter((p) => p === "betting" || p === "idle").length >= 2, "spectator completes and restarts multiple rounds");
    assert.ok(game.text().includes("Live ·"), "live controls stay mounted");
    assert.ok(!game.nodes().some((node) => node.props?.open === true && node.props?.onPlayAgain), "no personal game-over");
    game.unmount();
    await game.advance(20000);
    assert.deepEqual(game.changes, [], "unmounted timers cannot settle bets");
  });

  test(`${file}: closed-round queue activates once in a later round, and cancels`, async () => {
    const game = harness(file, exported);
    await game.advance(closedAt);
    game.click("Queue next round");
    assert.match(game.text(), /Next Rs\. 50/);
    assert.deepEqual(game.changes, [], "queue cannot enter or settle the closed round");
    for (let i = 0; i < 400 && game.changes.every(c => c.after >= c.before); i++) await game.advance(100);
    const debits = game.changes.filter((c) => c.after < c.before);
    assert.equal(debits.length, 1, "exactly one queued activation debit");
    assert.equal(debits[0].before - debits[0].after, 50);
    assert.ok(debits[0].at > closedAt, "debit belongs to a later round");
    game.click("Queue next round");
    game.click("Cancel queued");
    assert.match(game.text(), /Next Rs\. 0/);
    await game.advance(25000);
    assert.equal(game.changes.filter((c) => c.after < c.before).length, 1, "no implicit rebet or cancelled queue activation");
    game.unmount();
  });

  test(`${file}: invalid and unaffordable queues never activate`, async () => {
    const game = harness(file, exported);
    await game.advance(closedAt);
    for (const value of ["0", "-10", "NaN", "Infinity", "10001"]) {
      game.input("Next round amount", value);
      game.click("Queue next round");
      assert.match(game.text(), /Next Rs\. 0/);
    }
    game.input("Next round amount", "50");
    game.click("Queue next round");
    game.setFunds(10);
    await game.advance(25000);
    assert.deepEqual(game.changes, [], "funds must be revalidated before activation");
    assert.match(game.text(), /Queued bet cancelled: insufficient balance/);
    game.unmount();
  });

  test(`${file}: unmount cancels an accepted round's late callbacks`, async () => {
    const game = harness(file, exported);
    await game.advance(closedAt);
    game.click("Queue next round");
    for (let i = 0; i < 350 && game.changes.length === 0; i++) await game.advance(100);
    assert.equal(game.changes.filter((c) => c.after < c.before).length, 1);
    const before = game.changes.length;
    game.unmount();
    await game.advance(45000);
    assert.equal(game.changes.length, before, "unmounted accepted wager cannot pay out or rebet");
  });
}

for (const spec of browserCards) {
  const create = () => harness(spec.file, spec.exported, 10000, ["phase", "live", ...spec.names]);
  const debitCount = game => game.changes.filter(change => change.after < change.before).length;
  const until = async (game, predicate) => {
    for (let i = 0; i < 600 && !predicate(); i++) await game.advance(100);
    assert.ok(predicate(), "card round reaches the expected boundary");
  };
  test(`${spec.file}: spectator deals repeat with no wallet changes or next-round queue controls`, async () => {
    const game = create();
    for (let period = 0; period < 2; period++) {
      const before = game.phases.length;
      await game.advance(60000);
      assert.ok(game.phases.slice(before).filter(phase => phase === "betting").length >= 2, "successive spectator hands reopen betting");
    }
    assert.deepEqual(game.changes, []);
    assert.equal(game.captured.live.controls, null);
    assert.ok(!game.text().includes("Queue next round"));
    assert.ok(!game.nodes().some(node => node.props?.open === true && node.props?.onPlayAgain));
    game.unmount();
    await game.advance(30000);
    assert.deepEqual(game.changes, []);
  });

  test(`${spec.file}: active hands reject new bets and clear requests, then reopen without implicit replay`, async () => {
    const game = create();
    game.invoke(spec.place);
    await game.advance(0);
    const stake = spec.stake(game.captured);
    assert.ok(stake > 0);
    game.invoke(spec.start);
    await game.advance(0);
    assert.notEqual(game.captured.phase, "betting");
    const before = game.changes.length;
    game.invoke(spec.place);
    game.invoke(spec.clear);
    game.invoke(spec.start);
    await game.advance(0);
    assert.equal(spec.stake(game.captured), stake, "active hand and next hand cannot receive new chips");
    assert.equal(game.changes.length, before, "closed actions cannot debit or refund");
    assert.equal(debitCount(game), 1, "one accepted wager for the hand");
    await until(game, () => game.captured.phase === "betting");
    assert.equal(spec.stake(game.captured), 0);
    await game.advance(60000);
    assert.equal(debitCount(game), 1, "following hands run without replaying the paid wager");
    await until(game, () => game.captured.phase === "betting");
    game.invoke(spec.place);
    await game.advance(0);
    assert.ok(spec.stake(game.captured) > 0, "core betting control works again after completion");
    game.unmount();
  });

  test(`${spec.file}: open-window chips can be cancelled without charging a later round`, async () => {
    const game = create();
    game.invoke(spec.place);
    await game.advance(0);
    const oneChip = spec.stake(game.captured);
    game.invoke(spec.place);
    await game.advance(0);
    assert.equal(spec.stake(game.captured), oneChip * 2, "multiple chips remain valid within the same open round");
    game.invoke(spec.clear);
    await game.advance(0);
    assert.equal(spec.stake(game.captured), 0);
    assert.equal(game.balance(), 10000, spec.prepaid ? "prepaid chips refunded exactly" : "draft chips never charged");
    assert.equal(game.changes.length, spec.prepaid ? 3 : 0);
    const before = game.changes.length;
    await game.advance(60000);
    assert.equal(game.changes.length, before, "cancelled chips never activate in a later hand");
    game.unmount();
  });

  test(`${spec.file}: unaffordable chips cannot become a wager`, async () => {
    const game = create();
    game.setFunds(0);
    game.invoke(spec.place);
    await game.advance(60000);
    assert.deepEqual(game.changes, []);
    assert.equal(spec.stake(game.captured), 0);
    game.unmount();
  });

  test(`${spec.file}: unmount cancels accepted-hand presentation callbacks without another debit or payout`, async () => {
    const game = create();
    game.invoke(spec.place);
    await game.advance(0);
    game.invoke(spec.start);
    await game.advance(0);
    assert.equal(debitCount(game), 1);
    const before = game.changes.length;
    game.unmount();
    await game.advance(60000);
    assert.equal(game.changes.length, before);
  });
}

for (const spec of [
  { file: "teen-patti-ak47\\TeenPattiAK47.tsx", names: ["setAnte", "startDeal"], prepare: v => v.setAnte(50), start: v => v.startDeal(), counter: "revealedCards", first: 1250, step: 750, cards: 6, settled: 6750 },
  { file: "teen-patti-joker\\game\\TeenPattiGame.tsx", names: ["placeBet", "deal"], prepare: v => v.placeBet("player"), start: v => v.deal(), counter: "revealedCards", first: 1500, step: 750, cards: 6, settled: 7000 },
  { file: "teen-patti-faceoff\\GameTable.tsx", names: ["placeBet", "startRound"], prepare: v => v.placeBet("A"), start: v => v.startRound(), counter: "revealedCount", first: 2600, step: 750, cards: 6, settled: 8850 },
  { file: "teen-patti-hukam\\Game.tsx", names: ["placeBet", "deal"], prepare: v => v.placeBet("A"), start: v => v.deal(), counter: "revealed", first: 850, step: 850, cards: 7, settled: 7550 },
]) {
  test(`${spec.file}: one card at a time, a full-hand pause, and no duplicate result box`, async () => {
    const game = harness(spec.file, spec.file.includes("faceoff") ? "GameTable" : "default", 10000, [...spec.names, spec.counter, "phase", "history"]);
    game.invoke(spec.prepare);
    await game.advance(0);
    game.invoke(spec.start);
    await game.advance(0);
    assert.equal(game.captured.phase, "dealing");
    assert.equal(game.changes.length, 1, "stake accepted exactly once");
    let at = 0;
    for (let count = 1; count <= spec.cards; count++) {
      const next = spec.first + (count - 1) * spec.step;
      await game.advance(next - at - 1);
      assert.equal(game.captured[spec.counter], count - 1);
      await game.advance(1);
      at = next;
      assert.equal(game.captured[spec.counter], count);
      assert.equal(game.captured.history.length, 0);
      assert.equal(game.changes.length, 1, "no payout during reveal");
    }
    await game.advance(spec.settled - at - 1);
    assert.equal(game.captured.history.length, 0, "no result until the review pause ends");
    await game.advance(1);
    assert.equal(game.captured.history.length, 1);
    assert.ok(!game.nodes().some(n => /result-banner|tp-scale-in|bg-black\/50 z-20/.test(n.props?.className ?? "")));
    assert.ok(!game.nodes().some(n => n.type?.name === "ResultBanner"));
    game.unmount();
  });
}

test("Best of Four reveals all eight cards before settlement and preserves next-hand controls", async () => {
  const game = harness("teen-patti-best-of-four\\game\\TeenPattiGame.tsx", "default", 10000,
    ["setBet", "deal", "phase", "revealedCards", "rounds"]);
  game.invoke(v => v.setBet(50));
  game.invoke(v => v.deal(50));
  await game.advance(0);
  let at = 0;
  for (let count = 1; count <= 8; count++) {
    const next = count <= 4 ? 1800 + (count - 1) * 750 : 5850 + (count - 5) * 750;
    await game.advance(next - at);
    at = next;
    assert.equal(game.captured.revealedCards, count);
    assert.equal(game.captured.rounds, 0);
    assert.equal(game.changes.length, 1);
  }
  await game.advance(10349 - at);
  assert.equal(game.captured.phase, "dealing");
  await game.advance(1);
  assert.equal(game.captured.phase, "settled");
  assert.equal(game.captured.rounds, 1);
  assert.ok(!game.nodes().some(n => /absolute inset-0 z-30 grid place-items-center/.test(n.props?.className ?? "")));
  game.unmount();
});

test("Teen Patti deals player cards and reveals dealer cards before announcing the server-settled result", async () => {
  // Losing-slot fixture: the server settles at the play move, so a winning slot would credit instantly.
  const game = harness("teen-patti\\TeenPattiGame.tsx", "default", 10000,
    ["deal", "play", "phase", "playerRevealed", "dealerRevealed", "dealerCards", "history"], {}, false);
  game.invoke(v => v.deal());
  await game.advance(0);
  assert.equal(game.captured.phase, "dealing");
  assert.ok(game.captured.dealerCards.every(card => card.id.startsWith("hidden-")), "dealer cards stay server-side until play");
  await game.advance(2100);
  assert.equal(game.captured.playerRevealed, 3);
  assert.equal(game.captured.phase, "dealing");
  await game.advance(1100);
  assert.equal(game.captured.phase, "dealt");
  game.invoke(v => v.play("seen"));
  await game.advance(0);
  assert.ok(game.captured.dealerCards.every(card => !card.id.startsWith("hidden-")), "server reveals the real dealer hand");
  await game.advance(2050);
  assert.equal(game.captured.dealerRevealed, 3);
  assert.equal(game.captured.history.length, 0);
  assert.equal(game.changes.length, 1);
  await game.advance(1750);
  assert.equal(game.captured.phase, "result");
  assert.equal(game.captured.history.length, 1);
  assert.equal(game.balance(), game.changes[0].after, "losing slot pays nothing");
  game.unmount();
});

test("Teen Patti 999 reveals six cards before result and retains next-round controls without its extra modal", async () => {
  const game = harness("teen-patti-999\\GameTable.tsx", "default", 10000,
    ["beginRound", "choose", "show", "phase", "revealedCards", "round"], {
      table: { boot: 10 }, balance: 10000, onGameEnd() {}, onRequestChips() {}, onExit() {},
    }, false);
  game.invoke(v => v.beginRound());
  await game.advance(1500);
  assert.equal(game.captured.phase, "choose");
  game.invoke(v => v.choose(false));
  await game.advance(0);
  assert.equal(game.captured.phase, "turn");
  game.invoke(v => v.show());
  await game.advance(0);
  assert.equal(game.captured.phase, "reveal");
  assert.equal(game.changes.length, 3, "boot, blind chaal and show are each debited once");
  await game.advance(4150);
  assert.equal(game.captured.revealedCards, 6);
  assert.equal(game.captured.phase, "reveal");
  assert.equal(game.changes.length, 3);
  await game.advance(1750);
  assert.equal(game.captured.phase, "result");
  assert.equal(game.captured.round.won, false);
  assert.ok(game.text().includes("NEXT ROUND"));
  assert.ok(!game.nodes().some(n => /fixed inset-0 z-40/.test(n.props?.className ?? "")));
  game.unmount();
});

test("Texas Hold'em shows an all-in runout and both house cards before paying or announcing the result", async () => {
  // Losing slot: the house never folds, so an all-in shove runs out to a server-dealt showdown.
  const game = harness("texas-holdem\\Game.tsx", "default", 10000,
    ["beginHand", "act", "state", "stateRef", "presentation", "dealerRevealed"], {}, false);
  game.invoke(v => v.beginHand());
  await game.advance(0);
  const hand = game.captured.stateRef.current;
  assert.equal(hand.phase, "preflop");
  assert.equal(game.changes.length, 1);
  game.invoke(v => v.act("raise", hand.playerBet + hand.playerChips));
  await game.advance(0);
  assert.equal(game.changes.length, 2, "the all-in raise is debited instantly by the server");
  await game.advance(1500);
  for (let count = 1; count <= 7; count++) {
    await game.advance(850);
    assert.equal(game.captured.state.community.length, Math.min(count, 5));
    assert.equal(game.captured.dealerRevealed, Math.max(0, count - 5));
    assert.equal(game.captured.state.result, null);
    assert.equal(game.captured.stateRef.current, hand, "presentation never changes the committed table state");
    assert.equal(game.changes.length, 2, "no payment during the runout");
    assert.ok(!game.text().includes("Showdown —"), "the log must not leak the result");
  }
  await game.advance(1599);
  assert.equal(game.captured.state.result, null);
  await game.advance(1);
  assert.equal(game.captured.state.phase, "handOver");
  assert.equal(game.captured.state.result.winner, "dealer");
  assert.equal(game.captured.presentation, null);
  assert.ok(game.text().includes("Choose your opening bet"));
  assert.ok(!game.text().includes("Deal Next Hand"));
  game.unmount();
});

test("Rummy removes its marked result modal but keeps the cards and replay controls", async () => {
  const game = harness("rummy\\RummyGame.tsx", "default", 10000,
    ["startDeal", "finish", "phase", "result", "hand"]);
  game.invoke(v => v.startDeal());
  await game.advance(1500);
  // Winning slot: declare the server-dealt hand's real melds (the server re-validates them).
  const melds = game.load(path.join(root, "src", "components", "rummy", "engine.ts")).solve(game.captured.hand);
  assert.ok(melds);
  game.invoke(v => v.finish(true, "Fixture rummy", melds));
  await game.advance(1000);
  assert.equal(game.captured.phase, "result");
  assert.ok(game.captured.result.win);
  assert.ok(game.text().includes("DEAL AGAIN"));
  assert.ok(game.text().includes("CHANGE BET"));
  assert.ok(!game.text().includes("RUMMY!"));
  assert.ok(!game.nodes().some(n => /absolute inset-0 z-40/.test(n.props?.className ?? "")));
  game.click("CHANGE BET");
  assert.equal(game.captured.phase, "bet");
  game.unmount();
});

test("Muflis reveals each card slowly and settles only after both complete hands have been visible", async () => {
  const game = harness("muflis\\MuflisGame.tsx", "default", 10000,
    ["setBet", "deal", "phase", "result", "wins", "losses"]);
  game.invoke(view => view.setBet(50));
  game.invoke(view => view.deal());
  await game.advance(0);
  assert.equal(game.captured.phase, "dealing");
  assert.equal(game.changes.length, 1);
  assert.equal(game.balance(), 9950);
  const hands = () => game.nodes().filter(node => node.type?.name === "HandRow");
  const faces = () => hands().map(hand => game.nodes(hand.type(hand.props))
    .filter(node => node.props?.card && node.props?.faceUp).length);
  assert.deepEqual(faces(), [0, 0]);
  let elapsed = 0;
  for (let count = 1; count <= 6; count++) {
    const at = 300 + (count - 1) * 650;
    await game.advance(at - 1 - elapsed);
    assert.deepEqual(faces(), [Math.floor((count - 1) / 2), Math.ceil((count - 1) / 2)]);
    await game.advance(1);
    elapsed = at;
    assert.deepEqual(faces(), [Math.floor(count / 2), Math.ceil(count / 2)]);
    assert.equal(game.captured.phase, "dealing");
    assert.equal(game.captured.wins + game.captured.losses, 0);
    assert.ok(hands().every(hand => !hand.props.isWinner));
    assert.ok(!game.nodes().some(node => node.props?.open === true && node.props?.onPlayAgain));
    assert.equal(game.changes.length, 1, "no payout while cards are being revealed");
  }
  await game.advance(4999 - elapsed);
  assert.equal(game.captured.phase, "dealing");
  assert.deepEqual(faces(), [3, 3]);
  assert.equal(game.balance(), 9950);
  await game.advance(1);
  assert.equal(game.captured.phase, "revealed");
  assert.equal(game.captured.wins + game.captured.losses, 1);
  assert.deepEqual(faces(), [3, 3]);
  assert.ok(game.nodes().some(node => node.props?.open === true && node.props?.onPlayAgain));
  assert.equal(game.balance(), game.captured.result.playerWins ? 10050 : 9950);
  game.unmount();
});

test("Bollywood Casino settles without the duplicate result overlay and still starts the next hand", async () => {
  const game = harness("bollywood-casino\\CasinoGame.tsx", "default", 10000, ["phase", "place", "startDeal"]);
  game.invoke((view) => view.place("andar"));
  await game.advance(0);
  game.invoke((view) => view.startDeal());
  for (let i = 0; i < 120 && game.captured.phase !== "settled"; i++) await game.advance(1000);
  assert.equal(game.captured.phase, "settled");
  assert.ok(!game.nodes().some((node) => node.props?.className === "result-card"));
  assert.doesNotMatch(game.text(), /NAYA HAND|Point card|Indicative game net|Auto start/);
  const settledChanges = game.changes.length;
  await game.advance(6500);
  assert.equal(game.captured.phase, "betting");
  assert.equal(game.changes.length, settledChanges, "next hand does not repeat the bet");
  game.unmount();
});

for (const [file, action, target] of cardTables) {
  const cancellable = file.includes("bollywood");
  const create = () => harness(file, "default", 10000, ["phase", action, ...(cancellable ? ["clearBets"] : ["currentBet"])]);
  async function until(game, predicate) {
    for (let i = 0; i < 120 && !predicate(); i++) await game.advance(1000);
    assert.ok(predicate(), "live round reaches the required boundary");
  }
  test(`${file}: spectator hands repeat without a single wallet setter`, async () => {
    const game = create();
    await game.advance(120000);
    assert.deepEqual(game.changes, []);
    assert.ok(game.phases.filter((phase) => phase === "betting").length >= 2);
    assert.ok(!game.nodes().some((node) => node.props?.open === true && node.props?.onPlayAgain));
    game.unmount();
    await game.advance(120000);
    assert.deepEqual(game.changes, []);
  });
  test(`${file}: closed bets cannot queue; fresh open bets use only the current round`, async () => {
    const game = create();
    await until(game, () => game.captured.phase !== "betting");
    game.invoke((view) => view[action](target));
    assert.deepEqual(game.changes, []);
    assert.ok(!game.text().includes("Queue next round"));
    await until(game, () => game.captured.phase === "betting");
    game.invoke((view) => view[action](target));
    await game.advance(0);
    assert.equal(game.changes.filter(change => change.after < change.before).length, 1);
    if (cancellable) {
      game.invoke(view => view.clearBets());
      await game.advance(0);
      assert.equal(game.balance(), 10000, "open bet refunds exactly");
    } else {
      const stake = JSON.stringify(game.captured.currentBet);
      game.invoke(view => view.placeBet("black"));
      await game.advance(0);
      assert.equal(JSON.stringify(game.captured.currentBet), stake, "one-colour rule remains enforced");
    }
    await game.advance(120000);
    assert.equal(game.changes.filter((change) => change.after < change.before).length, 1, "no cancelled activation or implicit replay");
    game.unmount();
  });
  test(`${file}: unmount during an accepted hand prevents late payouts or rebet`, async () => {
    const game = create();
    game.invoke((view) => view[action](target));
    await until(game, () => game.changes.some((change) => change.after < change.before));
    await until(game, () => game.captured.phase !== "betting");
    const before = game.changes.length;
    game.unmount();
    await game.advance(120000);
    assert.equal(game.changes.length, before);
  });
}

for (const win of [false, true]) {
  test(`poker-roulette: dealt cards reveal the exact ${win ? "capped winning" : "losing"} server outcome`, async () => {
    const game = harness("poker-roulette\\app\\page.tsx", "default", 10000, ["hand", "result", "phase", "revealed", "placeBet"], {}, true, win);
    for (let i = 0; i < 5; i++) game.invoke(v => v.placeBet(1));
    for (let i = 0; i < 400 && !game.serverOutcomes.length; i++) await game.advance(100);
    const server = game.serverOutcomes[0];
    assert.ok(server);
    assert.equal(JSON.stringify(game.captured.hand), JSON.stringify(server.cards));
    await game.advance(3000);
    assert.equal(game.captured.phase, "result");
    assert.equal(game.captured.revealed, true);
    assert.equal(JSON.stringify(game.captured.result), JSON.stringify({ category: server.category, payout: server.payout, winners: server.winners }));
    assert.equal(game.balance(), 10000 - 50 + server.payout);
    assert.ok(server.payout === 0 || server.payout === 100);
    assert.match(game.text(), /capped at 2x total stake gross/);
    assert.match(fs.readFileSync(path.join(root, "src", "components", "poker-roulette", "components", "BettingSpot.tsx"), "utf8"), /TOTAL \u22642x/);
    game.unmount();
  });
}

// Poker Roulette keeps dealing hands without a wager; bets open only between
// hands and always belong to the hand that starts next. (Moved out of the generic
// next-round queue loop above.)
{
  const file = "poker-roulette\\app\\page.tsx";
  const names = ["hand", "result", "phase", "placeBet", "bets", "stats"];
  const debits = game => game.changes.filter(c => c.after < c.before);
  const until = async (game, predicate) => {
    for (let i = 0; i < 400 && !predicate(); i++) await game.advance(100);
    assert.ok(predicate(), "virtual clock reached the expected round state");
  };

  test("poker-roulette: successive idle hands deal with no wallet, server or win-slot effect", async () => {
    const game = harness(file, "default", 10000, names);
    const hands = [];
    for (let i = 0; i < 3; i++) {
      await until(game, () => game.captured.phase === "result" && !hands.includes(game.captured.hand));
      hands.push(game.captured.hand);
      await until(game, () => game.captured.phase === "betting");
    }
    assert.equal(new Set(hands).size, 3, "three separate idle hands were dealt");
    assert.deepEqual(game.changes, [], "idle hands never debit or credit");
    assert.deepEqual(game.serverOutcomes, [], "idle hands never request a server outcome or win slot");
    assert.equal(JSON.stringify(game.captured.stats), JSON.stringify({ played: 0, won: 0 }));
    assert.equal(JSON.stringify(game.captured.bets), JSON.stringify({}), "no stake replayed implicitly");
    assert.ok(!game.nodes().some(node => node.type === "button" && /Queue next round/.test(JSON.stringify(node.props?.children ?? ""))), "no next-round queue control");
    game.unmount();
    await game.advance(30000);
    assert.deepEqual(game.changes, []);
  });

  test("poker-roulette: wager placed after an empty hand settles the exact server outcome once", async () => {
    const game = harness(file, "default", 10000, names, {}, true, true);
    await until(game, () => game.captured.phase === "result");
    await until(game, () => game.captured.phase === "betting");
    assert.deepEqual(game.changes, []);
    for (let i = 0; i < 5; i++) game.invoke(v => v.placeBet(1));
    assert.equal(JSON.stringify(game.captured.bets), JSON.stringify({ 1: 50 }));
    await until(game, () => game.captured.phase === "result");
    const [server] = game.serverOutcomes;
    assert.ok(server);
    assert.equal(JSON.stringify(game.captured.hand), JSON.stringify(server.cards));
    assert.equal(JSON.stringify(game.captured.result), JSON.stringify({ category: server.category, payout: server.payout, winners: server.winners }));
    assert.equal(server.payout, 100, "capped at 2x stake gross");
    assert.equal(debits(game).length, 1);
    assert.equal(game.balance(), 10000 - 50 + 100);
    await game.advance(30000);
    assert.equal(game.serverOutcomes.length, 1, "later hands are idle; no implicit rebet");
    assert.equal(debits(game).length, 1);
    game.unmount();
  });

  test("poker-roulette: next bet is blocked while the current hand runs", async () => {
    const game = harness(file, "default", 10000, names);
    for (let i = 0; i < 5; i++) game.invoke(v => v.placeBet(1));
    await until(game, () => game.captured.phase === "dealing");
    assert.equal(debits(game).length, 1);
    const balance = game.balance();
    game.invoke(v => v.placeBet(2));
    game.invoke(v => v.placeBet(3));
    assert.equal(JSON.stringify(game.captured.bets), JSON.stringify({ 1: 50 }), "no chip added to the running hand or the next one");
    await until(game, () => game.captured.phase === "result");
    game.invoke(v => v.placeBet(2));
    assert.equal(game.serverOutcomes.length, 1, "exactly one wager in the hand");
    assert.equal(game.balance(), balance + game.serverOutcomes[0].payout);
    await until(game, () => game.captured.phase === "betting");
    assert.equal(JSON.stringify(game.captured.bets), JSON.stringify({}), "nothing queued into the next hand");
    await game.advance(12000);
    assert.equal(game.serverOutcomes.length, 1, "next hand ran idle");
    assert.equal(debits(game).length, 1);
    await until(game, () => game.captured.phase === "betting");
    game.invoke(v => v.placeBet(2));
    assert.equal(JSON.stringify(game.captured.bets), JSON.stringify({ 2: 10 }), "betting reopens once the previous hand finished");
    game.unmount();
  });
}
