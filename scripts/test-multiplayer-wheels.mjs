import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(".");
const noop = () => {};
const sounds = new Proxy({}, { get: () => noop });
const rouletteResult = { number: 17, lightning: { 17: 100, 24: 50 } };
const dreamResult = {
  steps: [{ index: 7, spot: "2x", multiplier: 2 }, { index: 1, spot: "10", multiplier: 1 }],
  finalSpot: "10", totalMultiplier: 2,
};
const games = [
  {
    slug: "auto-roulette", file: "auto-roulette\\AutoRoulette.tsx", option: "n:17", outcome: rouletteResult,
    expose: "phase, timeLeft, round, spin, result, history, balance, placements, editing, placeBet, undo, clearAll, rebet, doubleBets, Chip",
    place: (h) => h.api.placeBet("n:17"), clear: (h) => h.api.clearAll(),
    repeat: (h) => h.api.rebet(), double: (h) => h.api.doubleBets(), countdown: (h) => h.api.timeLeft,
  },
  {
    slug: "lightning-roulette", file: "lightning-roulette\\components\\LightningRoulette.tsx", option: "n-17", outcome: rouletteResult,
    expose: "phase, timer, spinReq, result, lightning, history, balance, bets, placeBet, undo, clearBets, rebet, doubleBets, onSettled, Chip",
    place: (h) => h.api.placeBet("n-17"), clear: (h) => h.api.clearBets(),
    repeat: (h) => h.api.rebet(), double: (h) => h.api.doubleBets(), countdown: (h) => h.api.timer,
  },
  {
    slug: "dream-catcher", file: "dream-catcher\\wheel\\GameStudio.tsx", option: "10", outcome: dreamResult,
    expose: "phase, countdown, stepIndex, stepDuration, highlightIndex, banner, tableMultiplier, bets, placements, balance, history, stats, placeChip, removeChip, undo, clearBets, repeatBets, setAutoSpin, resetSession",
    place: (h) => h.api.placeChip("10"), clear: (h) => h.api.clearBets(),
    repeat: (h) => h.api.repeatBets(), countdown: (h) => h.api.countdown,
  },
];

function server(config) {
  let nextId = 1;
  const state = {
    game: config.slug, serverNow: 100000, balance: 10000,
    round: { roundNo: 42, phase: "betting", bettingEndsAt: 120000, resultAt: 130000, endsAt: 136000, result: null },
    myBets: [], myQueuedBets: [], bets: [], queuedBets: [], history: [],
  };
  const requests = [];
  const live = {
    state, now: 100000, error: "", busy: false,
    async place(option, amount) {
      const roundNo = state.round.roundNo + Number(state.round.phase !== "betting" || live.now >= state.round.bettingEndsAt - (config.slug === "dream-catcher" ? 500 : 0));
      requests.push({ action: "bet", option, amount, roundNo });
      const bet = { id: String(nextId++), name: "P***42", option, amount, roundNo, status: "pending", payout: 0, mine: true };
      if (amount > state.balance) return { error: "Insufficient balance" };
      state.balance -= amount;
      (roundNo === state.round.roundNo ? state.myBets : state.myQueuedBets).push(bet);
      return { ok: true, roundNo };
    },
    async cancel(roundNo, betId) {
      requests.push({ action: "cancel", roundNo, betId });
      for (const bet of [...state.myBets, ...state.myQueuedBets]) {
        if (bet.roundNo === roundNo && (!betId || betId === bet.id) && bet.status === "pending") {
          bet.status = "cancelled"; state.balance += bet.amount;
        }
      }
      return { ok: true, roundNo };
    },
    refresh: async () => {}, cashout: async () => ({ error: "Not supported" }),
  };
  return { live, state, requests };
}

// Transpile and execute the actual TSX component, its real display utilities,
// handlers and effects. Only the shared transport hook, DOM and audio are doubles.
function harness(config, transport, { visual = false, initialPerformance = 700000, presets = [50, 100, 200, 500, 1000] } = {}) {
  const slots = [], effects = [], timers = new Map(), frames = new Map(), cache = new Map();
  let cursor = 0, api, tree, writes = 0, nextId = 1, performanceNow = initialPerformance;
  const events = [];
  const window = { dispatchEvent: (event) => { events.push(event); } };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i]?.cleanup?.(); slots[i] = { deps, fn };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
    forwardRef(fn) { return (props) => fn(props, { current: null }); },
    useImperativeHandle(ref, fn, deps) { ref.current = hooks.useMemo(fn, deps); },
  };
  const jsx = (type, props) => ({ type, props });
  const clock = {
    setTimeout(fn) { const id = nextId++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  function load(file, instrument = false) {
    if (cache.has(file)) return cache.get(file);
    let source = readFileSync(file, "utf8");
    if (instrument) {
      const marker = config.marker ?? "\n  return (";
      const start = visual ? 0 : source.indexOf("export default function");
      const index = source.indexOf(marker, start);
      assert.ok(index >= 0, `Capture point exists in ${file}`);
      source = source.slice(0, index) + `\n  globalThis.capture({ ${config.expose} });\n` + source.slice(index);
    }
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    }, reportDiagnostics: true });
    assert.equal(output.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, file);
    const mod = { exports: {} };
    const resolve = (name) => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/useMultiplayerGame") return { useMultiplayerGame: () => transport.live };
      if (name === "@/lib/multiplayer-types") return load(path.join(root, "src", "lib", "multiplayer-types.ts"));
      if (name === "@/lib/walletSync") return {
        useGameBalance: () => [10000, () => { writes++; }],
        broadcastBalanceUpdate: () => { writes++; },
      };
      if (name === "@/lib/betPresets") return { BET_PRESETS: presets };
      if (/sound|audio|gameSfx/i.test(name)) return { gameSfx: sounds, tableAudio: sounds, sfx: sounds };
      if (/roulette$|config$/.test(name)) {
        const target = name.startsWith("@/") ? path.join(root, "src", ...name.slice(2).split("/")) : path.resolve(path.dirname(file), name);
        return load(`${target}.ts`);
      }
      return new Proxy({}, { get: () => noop });
    };
    new Function("require", "module", "exports", "globalThis", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "window", "CustomEvent", output.outputText)(
      resolve, mod, mod.exports, { capture: (value) => { api = value; } },
      clock.setTimeout, clock.clearTimeout, () => { throw new Error("Local round scheduler is forbidden"); }, noop,
      clock.requestAnimationFrame, clock.cancelAnimationFrame, { now: () => performanceNow }, window,
      class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    );
    cache.set(file, mod.exports);
    return mod.exports;
  }
  const Component = load(path.join(root, "src", "components", config.file), true).default;
  const gradient = { addColorStop: noop };
  const context = new Proxy({}, { get: (_, key) => key === "createLinearGradient" || key === "createRadialGradient" ? () => gradient : noop, set: () => true });
  function attach(node) {
    if (!node || typeof node !== "object") return;
    if (node.props?.ref && typeof node.type === "string") node.props.ref.current = {
      setAttribute: noop, getContext: () => context, classList: { remove: noop, add: noop }, getBoundingClientRect: noop,
    };
    const children = node.props?.children;
    (Array.isArray(children) ? children.flat(Infinity) : [children]).forEach(attach);
  }
  const h = {
    get api() { return api; }, get writes() { return writes; }, events,
    get frameCount() { return frames.size; }, get timerCount() { return timers.size; },
    render(props = config.props ?? {}) {
      if (!visual) transport.live.state = structuredClone(transport.state);
      cursor = 0; tree = Component(props);
      if (visual) attach(tree);
      effects.splice(0).forEach((fn) => fn());
      return tree;
    },
    async flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); h.render(); h.render(); },
    frame(delta = 0) {
      performanceNow += delta;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach((fn) => fn(performanceNow));
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  h.render(); h.render();
  return h;
}

export function registerMultiplayerWheelTests(slugs = games.map((game) => game.slug)) {
if (slugs.includes("lightning-roulette")) test("lightning-roulette: default and customized chips render without missing colors", () => {
  const config = games[1];
  for (const presets of [[10, 20, 50, 100, 200], [10, 20.5, 75, 250, 50000], [50, 100, 200, 500, 1000]]) {
    const h = harness(config, server(config), { presets });
    for (const amount of [...presets, 500, 1000, 1234]) {
      const chip = h.api.Chip({ amount });
      assert.match(chip.props.style.color, /^#[0-9a-f]{6}$/);
      assert.doesNotMatch(chip.props.style.background, /undefined/);
      assert.equal(chip.props.children, amount >= 1000 ? `${+(amount / 1000).toFixed(1)}K` : String(amount));
    }
    h.unmount();
  }
});
if (slugs.includes("auto-roulette")) test("auto-roulette: default and customized chip values always render with a valid existing palette", () => {
  const config = games[0];
  for (const presets of [[10, 15, 20, 25, 50], [0.01, 5, 123.5, 10000, 50000], [50, 100, 200, 500, 1000]]) {
    const h = harness(config, server(config), { presets });
    for (const value of [...presets, 0.02, 75, 246.5]) {
      const chip = h.api.Chip({ value, label: String(value), onClick: noop });
      assert.equal(chip.type, "button");
      assert.equal(typeof chip.props.style.color, "string");
      assert.doesNotMatch(chip.props.style.background, /undefined/);
      assert.doesNotMatch(chip.props.style.border, /undefined/);
      assert.equal(chip.props.children.props.children, String(value));
    }
    h.unmount();
  }
});
if (slugs.includes("auto-roulette")) test("auto-roulette: mobile shows the betting table and controls before the wheel", () => {
  const component = readFileSync("src\\components\\auto-roulette\\AutoRoulette.tsx", "utf8");
  const styles = readFileSync("src\\components\\auto-roulette\\auto-roulette.css", "utf8");
  assert.match(component, /className="auto-roulette-main [^"]*"/);
  assert.match(component, /className="auto-roulette-bet-panel [^"]*"/);
  assert.match(styles, /@media \(max-width: 1279px\)\s*\{\s*\.auto-roulette-main > \.auto-roulette-bet-panel\s*\{\s*order:\s*-1;/);
});
for (const config of games.filter((game) => slugs.includes(game.slug))) {
  test(`${config.slug}: shared round, outcome, server clock and wallet; no autonomous settlement`, async () => {
    const shared = server(config);
    const a = harness(config, shared), b = harness(config, shared);
    shared.live.now = 113050; a.render(); b.render();
    assert.equal(config.countdown(a), 7); assert.equal(config.countdown(b), 7);
    a.api.spinNow?.();
    assert.equal(shared.state.round.phase, "betting", "Manual start cannot shorten a shared round");
    config.place(a); await a.flush(); b.render();
    assert.equal(a.api.balance, 9950); assert.equal(b.api.balance, 9950);
    shared.state.round.phase = "running";
    shared.state.round.result = config.outcome;
    shared.live.now = 125000; a.render(); b.render();
    assert.equal(a.api.phase, "spinning"); assert.equal(a.api.phase, b.api.phase);
    if (config.slug !== "dream-catcher") {
      const spin = a.api.spin ?? a.api.spinReq;
      assert.equal(spin.target ?? spin.number, 17);
      assert.equal(spin.startedAt, 120000); assert.equal(spin.resultAt, 130000);
      assert.equal(spin.now, 125000);
      a.api.onSettled?.(36); a.render();
      assert.equal(a.api.result, null, "Canvas cannot publish a result or settle a wager");
    } else {
      assert.equal(a.api.stepIndex, 1);
      assert.equal(a.api.tableMultiplier, 2);
    }
    shared.state.round.phase = "result";
    shared.live.now = 130000;
    shared.state.myBets[0].status = "win"; shared.state.myBets[0].payout = 1234;
    shared.state.balance = 11184;
    shared.state.history = [{ roundNo: 42, result: config.outcome }];
    a.render(); b.render(); await a.flush();
    assert.equal(a.api.balance, 11184); assert.equal(b.api.balance, 11184);
    assert.deepEqual(a.api.history, b.api.history);
    if (config.slug !== "dream-catcher") { assert.equal(a.api.result, 17); assert.equal(b.api.result, 17); }
    else assert.equal(a.api.banner.amount, 1234, "Payout display is server supplied, not locally calculated");
    assert.equal(a.events.length, 1); assert.equal(b.events.length, 1);
    assert.equal(a.events[0].detail.bet, 50);
    assert.equal(a.events[0].detail.win, 1234);
    a.render(); b.render(); await a.flush();
    assert.equal(a.events.length, 1, "Repeated polling cannot repeat a result notification");
    assert.equal(shared.requests.length, 1);
    assert.equal(a.writes + b.writes, 0);
    a.unmount(); b.unmount();
    assert.equal(a.timerCount + b.timerCount, 0);
  });

  test(`${config.slug}: spectator history/activity come only from server and never wager automatically`, async () => {
    const shared = server(config);
    shared.state.bets = [{
      id: "other-player-bet", name: "M***37", option: config.option, amount: 250, roundNo: 42,
      mine: false, status: "pending", payout: 0,
    }];
    const h = harness(config, shared);
    assert.equal(h.api.history.length, 0, "No fabricated historical results");
    const tree = h.render();
    const panels = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.props?.state?.game === config.slug) panels.push(node);
      const children = node.props?.children;
      (Array.isArray(children) ? children.flat(Infinity) : [children]).forEach(walk);
    };
    walk(tree);
    assert.equal(panels.length, 1, "Actual activity panel receives authoritative shared state");
    assert.equal(panels[0].props.state.bets[0].name, "M***37");
    for (let round = 42; round < 45; round++) {
      shared.state.round.roundNo = round;
      shared.state.round.phase = "running"; shared.state.round.result = config.outcome;
      h.render(); await h.flush();
      shared.state.round.phase = "result"; h.render(); await h.flush();
    }
    assert.equal(shared.requests.length, 0);
    assert.equal(h.api.balance, 10000); assert.equal(h.writes, 0);
    assert.deepEqual(h.events, [], "Other players' wagers never create spectator win/loss notifications");
    h.unmount();
  });

  test(`${config.slug}: undo, clear and explicit repeat/double respect betting windows`, async () => {
    const shared = server(config), h = harness(config, shared);
    config.place(h); config.place(h); await h.flush();
    assert.equal(shared.requests.length, 1, "Rapid clicks cannot submit concurrent duplicate batches");
    shared.state.round.phase = "running"; shared.state.round.result = config.outcome;
    h.render(); await h.flush();
    shared.state.round.phase = "betting"; shared.state.round.result = null; h.render();
    h.api.undo(); await h.flush();
    assert.deepEqual(shared.requests.at(-1), { action: "cancel", roundNo: 42, betId: "1" });
    config.place(h); await h.flush();
    if (config.double) { config.double(h); await h.flush(); assert.equal(shared.state.balance, 9900); }
    config.clear(h); await h.flush();
    assert.equal(shared.state.balance, 10000);
    const queues = config.slug === "dream-catcher";
    shared.live.now = queues ? 119500 : 119999; h.render();
    config.place(h); await h.flush();
    assert.equal(shared.requests.at(-1).roundNo, queues ? 43 : 42, "Roulette accepts chips only in the current betting window");
    h.api.undo(); await h.flush();
    assert.equal(shared.requests.at(-1).roundNo, queues ? 43 : 42);
    assert.equal(shared.state.balance, 10000);
    config.repeat(h); await h.flush();
    assert.equal(shared.requests.at(-1).action, "bet");
    assert.equal(shared.requests.at(-1).roundNo, queues ? 43 : 42);
    if (!queues) {
      const before = shared.requests.length;
      shared.live.now = 120000;
      h.render();
      config.place(h); config.repeat(h); config.double(h);
      await h.flush();
      assert.equal(shared.requests.length, before, "No new wager or reservation at the betting deadline");
      assert.deepEqual(shared.state.myQueuedBets, []);
    }
    const requestCount = shared.requests.length;
    shared.state.round = { ...shared.state.round, roundNo: 43, phase: "betting", bettingEndsAt: 150000 };
    shared.live.now = 140000; shared.state.myBets = []; shared.state.myQueuedBets = [];
    h.render(); await h.flush();
    assert.equal(shared.requests.length, requestCount, "Rounds never repeat wagers implicitly");
    assert.equal(h.writes, 0);
    h.unmount();
  });

  test(`${config.slug}: queued, cancelled, zero and rejected wagers never trigger personal result notifications`, async () => {
    const shared = server(config), h = harness(config, shared);
    config.place(h); await h.flush();
    config.clear(h); await h.flush();
    shared.state.balance = 0; h.render();
    config.place(h); await h.flush();
    shared.state.round.phase = "running"; shared.state.round.result = config.outcome;
    shared.live.now = 125000; shared.state.balance = 1000; h.render();
    config.place(h); await h.flush();
    if (config.slug === "dream-catcher") {
      assert.equal(shared.state.myQueuedBets[0].roundNo, 43);
    } else {
      assert.equal(shared.state.myQueuedBets.length, 0, "Closed roulette rounds cannot reserve another wager");
      shared.state.myQueuedBets.push({
        id: "previously-accepted", name: "P***42", option: config.option, amount: 50,
        roundNo: 43, mine: true, status: "pending", payout: 0,
      });
    }
    shared.state.myBets.push({
      id: "zero-stake", name: "P***42", option: config.option, amount: 0,
      roundNo: 42, mine: true, status: "win", payout: 0,
    });
    shared.state.round.phase = "result"; shared.live.now = 130000;
    h.render(); await h.flush();
    assert.deepEqual(h.events, [], "Only a positive actual wager in the settled round creates a notification");
    assert.equal(shared.state.myQueuedBets[0].status, "pending", "Current result cannot consume next-round wager");
    assert.equal(h.writes, 0);
    h.unmount();
  });
  test(`${config.slug}: a pending daily-pool wager preserves the round dialog without a paid-result event`, async () => {
    const shared = server(config), h = harness(config, shared);
    config.place(h); await h.flush();
    shared.state.round.phase = "result"; shared.state.round.result = config.outcome;
    shared.live.now = 130000;
    Object.assign(shared.state.myBets[0], { poolPending: true, poolClaim: 0, payout: 0, status: "lose" });
    h.render(); await h.flush();
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].detail.poolPending, true);
    assert.equal(h.events[0].detail.poolClaim, 0);
    assert.equal(h.events[0].detail.win, 0);
    assert.equal(h.events[0].detail.won, false);
    assert.equal(h.writes, 0);
    if (config.slug === "dream-catcher") {
      assert.match(h.api.banner.title, /daily pool payout pending/);
      assert.equal(h.api.banner.kind, "wait");
      assert.equal(h.api.stats.returned, 0);
    }
    h.unmount();
  });

  test(`${config.slug}: unmount stops pending multi-option submissions`, async () => {
    const shared = server(config), h = harness(config, shared);
    config.place(h); await h.flush();
    if (config.slug === "dream-catcher") h.api.placeChip("2");
    else h.api.placeBet(config.slug === "auto-roulette" ? "n:24" : "n-24");
    await h.flush();
    shared.state.round.phase = "running"; shared.state.round.result = config.outcome; h.render(); await h.flush();
    shared.state.round.phase = "betting"; shared.state.round.result = null; h.render();
    config.clear(h); await h.flush();
    let release;
    const original = shared.live.place;
    shared.live.place = (...args) => new Promise((resolve) => { release = async () => resolve(await original(...args)); });
    config.repeat(h); h.unmount();
    const count = shared.requests.length;
    await release(); await h.flush();
    assert.equal(shared.requests.length, count + 1, "Only already in-flight action may finish");
    assert.equal(h.writes, 0);
    assert.equal(h.timerCount, 0);
  });
}

if (slugs.includes("dream-catcher")) test("dream-catcher: auto control is opt-in, at most once per round, and reset never changes wallet", async () => {
  const config = games[2], shared = server(config), h = harness(config, shared);
  config.place(h); await h.flush();
  shared.state.round.phase = "result"; shared.state.round.result = dreamResult;
  shared.state.myBets[0].status = "lose"; h.render(); await h.flush();
  shared.state.round = { ...shared.state.round, roundNo: 43, phase: "betting", bettingEndsAt: 160000 };
  shared.state.myBets = []; shared.live.now = 140000; h.render(); await h.flush();
  assert.equal(shared.requests.length, 1);
  h.api.setAutoSpin(true); h.render(); await h.flush(); h.render(); await h.flush();
  assert.equal(shared.requests.length, 2);
  h.api.setAutoSpin(false); h.render();
  shared.state.round.roundNo = 44; shared.state.myBets = []; h.render(); await h.flush();
  assert.equal(shared.requests.length, 2);
  const balance = shared.state.balance; h.api.resetSession(); await h.flush();
  assert.equal(shared.state.balance, balance); assert.equal(h.writes, 0);
  h.unmount(); assert.equal(h.timerCount, 0);
});

const visuals = [
  {
    file: "auto-roulette\\RouletteWheel.tsx", expose: "st, clockRef",
    props: { spin: { id: 42, target: 17, startedAt: 120000, resultAt: 130000, now: 125000 }, highlight: null, onEnd: noop },
    snapshot: (h) => ({ angle: h.api.st.current.angle, target: h.api.st.current.target, pocket: h.api.st.current.pocket }),
    settled: (h) => assert.equal(h.api.st.current.spinning, false),
  },
  {
    file: "lightning-roulette\\components\\Wheel.tsx", expose: "animRef, clockRef", marker: "\n  return <canvas",
    props: { spin: { key: 42, number: 17, startedAt: 120000, resultAt: 130000, now: 125000 }, lightning: rouletteResult.lightning, restNumber: 0, onSettled: noop },
    snapshot: (h) => ({ wa: h.api.animRef.current.wa, ba: h.api.animRef.current.ba, br: h.api.animRef.current.br }),
    settled: (h) => { assert.equal(h.api.animRef.current.spin, null); assert.equal(h.api.animRef.current.pocket, 8); },
  },
  {
    file: "dream-catcher\\wheel\\MoneyWheel.tsx", expose: "rotationRef, sharedRef, clockRef", marker: "\n  const segments =",
    props: { highlightIndex: null, sharedSpin: { key: "42-1", index: 1, fromIndex: 7, startedAt: 120000, endsAt: 130000, now: 125000 } },
    snapshot: (h) => ({ rotation: h.api.rotationRef.current }),
    settled: (h) => assert.ok(Math.abs(((h.api.rotationRef.current % 360) + 360) % 360 - (360 - 360 / 54)) < 0.001),
  },
];
for (const config of visuals.filter((visual) => slugs.includes(visual.file.split("\\")[0]))) {
  test(`${config.file}: mid-spin join uses identical canonical animation and landing despite client clock origins`, () => {
    const a = harness(config, {}, { visual: true, initialPerformance: 300000 });
    const b = harness(config, {}, { visual: true, initialPerformance: 9000000 });
    a.frame(); b.frame();
    assert.deepEqual(config.snapshot(a), config.snapshot(b));
    a.frame(5000); b.frame(5000);
    config.settled(a); config.settled(b);
    assert.deepEqual(config.snapshot(a), config.snapshot(b));
    a.unmount(); b.unmount();
    assert.equal(a.frameCount + b.frameCount, 0, "Unmount cancels every animation frame");
  });
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  registerMultiplayerWheelTests();
}
