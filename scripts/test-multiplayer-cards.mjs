import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const files = {
  baccarat: "src\\components\\baccarat\\Baccarat.tsx",
  "speed-baccarat": "src\\components\\speed-baccarat\\SpeedBaccaratGame.tsx",
  "football-studio": "src\\components\\football-studio\\FootballStudioGame.tsx",
  "32-cards": "src\\components\\32-cards\\Game.tsx",
};
const card = { rank: "7", value: 7, suit: "♥" };
const speedCard = { ...card, suit: "hearts", key: "shared-card" };
const outcomes = {
  baccarat: { playerCards: [card, card], bankerCards: [{ ...card, rank: "2", value: 2 }, card], playerTotal: 4, bankerTotal: 9, winner: "banker" },
  "speed-baccarat": { player: [speedCard, speedCard], banker: [speedCard, { ...speedCard, rank: "2", value: 2 }], pTotal: 4, bTotal: 9, winner: "banker", playerPair: true, bankerPair: false },
  "football-studio": { home: { rank: 14, suit: "♥" }, away: { rank: 2, suit: "♣" }, outcome: "HOME" },
  "32-cards": { draws: [[card], [card], [card], [card]], totals: [15, 16, 17, 18], winner: 3 },
};
const options = { baccarat: "banker", "speed-baccarat": "banker", "football-studio": "HOME", "32-cards": "D" };

function snapshot(game, phase = "betting") {
  return {
    game, serverNow: 105000, balance: 731.25,
    round: { roundNo: 42, phase, bettingEndsAt: 110000, resultAt: 115000, endsAt: 120000, result: phase === "result" ? outcomes[game] : null },
    bets: [], queuedBets: [], myBets: [], myQueuedBets: [], history: [],
  };
}

function client(game, initial = snapshot(game), now = 105000) {
  const slots = [], effects = [], cleanups = [], timers = [], calls = [], sounds = [], writes = [];
  let cursor = 0, dirty = false, tree, current = initial, clock = now;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initialValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [slots[index], (value) => {
        const next = typeof value === "function" ? value(slots[index]) : value;
        if (!Object.is(slots[index], next)) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        slots[index] = { deps };
        effects.push(fn);
      }
    },
  };
  const live = {
    get state() { return current; },
    get now() { return clock; },
    error: "", busy: false,
    async place(option, amount) { calls.push({ action: "bet", option, amount }); return { ok: true, roundNo: current.round.roundNo }; },
    async cancel(roundNo, betId) { calls.push({ action: "cancel", roundNo, betId }); return { ok: true, roundNo }; },
    async refresh() { calls.push({ action: "refresh" }); },
  };
  const sound = new Proxy({}, { get: (_, name) => (...args) => sounds.push({ name, args }) });
  const modules = new Map();
  const stub = (name) => {
    const result = { default: name, __esModule: true };
    return new Proxy(result, { get: (target, property) => property in target ? target[property] : String(property) });
  };
  const forbidden = (kind) => { writes.push(kind); throw new Error(`Client attempted ${kind}`); };
  function load(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const source = readFileSync(filename, "utf8");
    const loaded = { exports: {} };
    modules.set(filename, loaded);
    const require = (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };
      if (name === "@/lib/useMultiplayerGame") return { useMultiplayerGame: (slug) => { assert.equal(slug, game); return live; } };
      if (name.includes("walletSync")) return forbidden("wallet mutation import");
      if (name.includes("multiplayer-rules")) return forbidden("server runtime import");
      if (name === "@/lib/gameSfx") return { gameSfx: sound };
      if (name === "./lib/sound") return { sound };
      if (name.endsWith(".css")) return {};
      if (name === "@/components/LiveMultiplayerBets") return load("src\\components\\LiveMultiplayerBets.tsx");
      if (name === "./BetSpot") return load(path.join(path.dirname(filename), "BetSpot.tsx"));
      if (name === "@/lib/betPresets") return load("src\\lib\\betPresets.ts");
      if (name === "@/lib/multiplayer-types") return load("src\\lib\\multiplayer-types.ts");
      if (name.startsWith("./lib/")) return load(path.join(path.dirname(filename), name.replaceAll("/", "\\") + ".ts"));
      return stub(name.split("/").at(-1));
    };
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const safeMath = Object.create(Math);
    safeMath.random = () => forbidden("local random outcome or fake players");
    const fakeWindow = {
      localStorage: { getItem: () => null, setItem: () => forbidden("personal storage write") },
      addEventListener() {}, removeEventListener() {},
      setTimeout(fn) { timers.push(fn); return timers.length; },
      clearTimeout() {}, location: { assign(url) { calls.push({ action: "navigate", url }); } },
    };
    new Function("require", "module", "exports", "window", "localStorage", "fetch", "Math", "setTimeout", "clearTimeout", output)(
      require, loaded, loaded.exports, fakeWindow, { setItem: () => forbidden("personal storage write"), getItem: () => null },
      () => forbidden("client financial HTTP write"), safeMath, fakeWindow.setTimeout, fakeWindow.clearTimeout,
    );
    return loaded.exports;
  }
  const Component = load(files[game]).default;
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  function render(next = current, time = clock) {
    current = next; clock = time;
    let attempts = 0;
    do {
      if (++attempts > 12) throw new Error("Component did not stabilize");
      cursor = 0; dirty = false;
      tree = Component({});
      for (const effect of effects.splice(0)) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup);
      }
    } while (dirty);
    tree = expand(tree);
    assert.deepEqual(writes, []);
    return tree;
  }
  render();
  return {
    render, calls, sounds, writes, live, timers,
    unmount() { for (const cleanup of cleanups.splice(0)) cleanup(); },
    get tree() { return tree; },
  };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree !== "object") return tree === undefined || tree === null || tree === false ? "" : String(tree);
  return text(tree.props?.children);
}
function button(c, label) {
  const found = nodes(c.tree, (node) => (node.type === "button" || node.type === "BetSpot") && text(node).trim().toUpperCase().includes(label.toUpperCase()));
  assert.ok(found.length, `Missing ${label} button`);
  return found.find((node) => text(node).trim().toUpperCase() === label.toUpperCase()) ?? found[0];
}
function bet(game, extra = {}) {
  return { id: "real-bet", name: "A***n", option: options[game], amount: 50, roundNo: 42, status: "win", payout: 97.13, mine: true, ...extra };
}

for (const game of Object.keys(files)) {
  test(`${game}: pending zero and successful claims keep the real cards without announcing paid winnings or losses`, () => {
    for (const claim of [0, 200]) {
      const state = snapshot(game, "result");
      state.myBets = [bet(game, { status: claim > 0 ? "win" : "lose", payout: 0, poolPending: true, poolClaim: claim })];
      state.bets = state.myBets;
      const c = client(game, state, 118000);
      assert.match(text(c.tree), /daily pool payout pending/i);
      assert.doesNotMatch(text(c.tree), /YOU WIN|You won|You lose|Lost Rs|BETTER LUCK NEXT TIME/i);
      assert.equal(c.sounds.some(sound => ["win", "lose"].includes(String(sound.name))), false);
      c.unmount();
    }
  });
  test(`${game}: server countdown, wallet, public result and history drive actual component`, () => {
    const state = snapshot(game);
    const c = client(game, state);
    assert.match(text(c.tree), /731\.25/);
    assert.match(text(c.tree), /No player bets this round yet/);
    if (game === "speed-baccarat") {
      assert.equal(nodes(c.tree, (node) => node.type === "TimerRing")[0].props.seconds, 5);
    } else if (game !== "32-cards") {
      assert.match(text(c.tree), /5s/);
    } else {
      assert.ok(nodes(c.tree, (node) => node.type === "span" && text(node) === "5").length);
    }
    c.render(state, 108200);
    if (game === "speed-baccarat") assert.equal(nodes(c.tree, (node) => node.type === "TimerRing")[0].props.seconds, 1.8);
    else if (game !== "32-cards") assert.match(text(c.tree), /2s/);
    else assert.ok(nodes(c.tree, (node) => node.type === "span" && text(node) === "2").length);

    const result = snapshot(game, "result");
    result.history = [{ roundNo: 42, result: outcomes[game] }];
    c.render(result, 118000);
    if (game === "baccarat") {
      assert.match(text(c.tree), /BANKER WINS/);
      assert.deepEqual(nodes(c.tree, (node) => node.type === "PlayingCard").map((node) => node.props.card), [...outcomes[game].playerCards, ...outcomes[game].bankerCards]);
    } else if (game === "speed-baccarat") {
      assert.match(text(c.tree), /BANKER WINS/);
      const hands = nodes(c.tree, (node) => node.type === "Hand");
      assert.deepEqual(hands.map((node) => node.props.cards), [outcomes[game].player, outcomes[game].banker]);
      assert.deepEqual(hands.map((node) => node.props.revealed), [2, 2]);
      assert.equal(nodes(c.tree, (node) => node.type === "Roadmap")[0].props.history[0].id, 42);
      assert.match(text(c.tree), /0 bets in hand/);
    } else if (game === "football-studio") {
      assert.match(text(c.tree), /HOME Wins/);
      const fronts = nodes(c.tree, (node) => node.props?.className?.includes("fs-card-face fs-flip-in"));
      assert.equal(fronts.length, 2);
      assert.match(text(fronts[0]), /^A♥/);
      assert.match(text(fronts[1]), /^2♣/);
    } else {
      assert.match(text(c.tree), /Player 11 WINS/);
      assert.match(text(c.tree), /18/);
      assert.equal(nodes(c.tree, (node) => node.props?.className?.startsWith("card-in") && text(node) === "7♥7").length, 4);
    }
    assert.equal(c.sounds.filter(({ name }) => name === "win" || name === "lose" || name === "push").length, 0);
    assert.deepEqual(c.calls, []);
    if (game === "baccarat") assert.equal(nodes(c.tree, (node) => node.type === "GameOverOverlay")[0].props.open, false);
    if (game === "speed-baccarat") assert.equal(nodes(c.tree, (node) => node.type === "StatsPanel")[0].props.stats.rounds, 0);
    if (game === "speed-baccarat") assert.equal(nodes(c.tree, (node) => node.type === "Confetti")[0].props.trigger, 0);
  });

  test(`${game}: personal notifications require actual server bet, honor payout, deduplicate polls`, () => {
    const state = snapshot(game, "result");
    state.bets = [bet(game), bet(game, { id: "other", mine: false, name: "S***a" })];
    state.myBets = [state.bets[0]];
    const c = client(game, state, 118000);
    assert.match(text(c.tree), /A\*\*\*n/);
    assert.match(text(c.tree), /S\*\*\*a/);
    assert.equal(c.sounds.filter(({ name }) => name === "win").length, 1);
    c.render(structuredClone(state), 118500);
    assert.equal(c.sounds.filter(({ name }) => name === "win").length, 1);
    assert.deepEqual(c.calls, []);
    assert.deepEqual(c.writes, []);
    if (game === "speed-baccarat") {
      const dealer = nodes(c.tree, (node) => node.type === "DealerFeed")[0].props.round;
      assert.ok(Math.abs(dealer.net - 47.13) < 1e-8);
      assert.equal(nodes(c.tree, (node) => node.type === "StatsPanel")[0].props.stats.rounds, 1);
      assert.equal(nodes(c.tree, (node) => node.type === "Confetti")[0].props.trigger, 42);
    }
    if (game === "baccarat") assert.equal(nodes(c.tree, (node) => node.type === "GameOverOverlay")[0].props.open, true);
  });

  test(`${game}: closed card betting is disabled and existing queued stakes remain cancellable`, async () => {
    const state = snapshot(game, "running");
    state.queuedBets = [bet(game, { roundNo: 43, status: "pending", payout: 0 })];
    state.myQueuedBets = state.queuedBets;
    const c = client(game, state, 112000);
    const target = game === "baccarat"
      ? nodes(c.tree, (node) => node.type === "button" && text(node).includes("BANKER") && text(node).includes("0.95"))[0]
      : game === "speed-baccarat"
        ? nodes(c.tree, (node) => node.type === "button" && node.props["aria-label"] === "Bet BANKER")[0]
        : game === "football-studio"
          ? nodes(c.tree, (node) => node.type === "button" && /HOME/i.test(text(node)) && text(node).includes("Pays 1 : 1"))[0]
          : nodes(c.tree, (node) => node.type === "button" && text(node).includes("Player 11"))[0];
    assert.ok(target, `${game} missing active betting spot`);
    if (game === "football-studio") {
      assert.notEqual(target.props.disabled, true);
      await target.props.onClick();
      assert.equal(c.calls[0].action, "bet");
      assert.equal(c.calls[0].option, options[game]);
    } else {
      assert.equal(target.props.disabled, true);
      assert.deepEqual(c.calls, []);
    }
    await button(c, "Cancel next-round bets").props.onClick();
    assert.deepEqual(c.calls.at(-1), { action: "cancel", roundNo: 43, betId: undefined });
  });

  test(`${game}: clear sends expected round and settled stakes are not silently repeated`, async () => {
    const state = snapshot(game);
    state.myBets = [bet(game, { status: "pending", payout: 0 })];
    state.bets = state.myBets;
    const c = client(game, state);
    await button(c, game === "32-cards" ? "UNDO ALL" : "CLEAR").props.onClick();
    assert.deepEqual(c.calls[0], { action: "cancel", roundNo: 42, betId: undefined });
    c.calls.length = 0;
    const result = snapshot(game, "result");
    result.myBets = [bet(game)];
    result.bets = result.myBets;
    c.render(result, 118000);
    const next = snapshot(game);
    next.round = { ...next.round, roundNo: 43, bettingEndsAt: 130000 };
    c.render(next, 123000);
    assert.deepEqual(c.calls, []);
    if (game !== "baccarat") {
      assert.notEqual(button(c, "REBET").props.disabled, true, "remembered confirmed bets keep rebet enabled in the next round");
      await button(c, "REBET").props.onClick();
      assert.deepEqual(c.calls, [{ action: "bet", option: options[game], amount: 50 }]);
    }
  });

  test(`${game}: repeated spectator rounds and accepted-hand unmount never write or activate wagers`, async () => {
    const c = client(game);
    for (let roundNo = 42; roundNo < 46; roundNo++) {
      const state = snapshot(game, "result");
      state.round.roundNo = roundNo;
      c.render(state, 118000);
      const next = snapshot(game);
      next.round.roundNo = roundNo + 1;
      c.render(next, 105000);
    }
    assert.deepEqual(c.calls, []);
    assert.equal(c.sounds.filter(({ name }) => ["win", "lose", "push"].includes(name)).length, 0);
    const accepted = snapshot(game, "running");
    accepted.myBets = [bet(game, { status: "pending", payout: 0 })];
    accepted.bets = accepted.myBets;
    accepted.myQueuedBets = [bet(game, { id: "next", roundNo: 43, status: "pending", payout: 0 })];
    accepted.queuedBets = accepted.myQueuedBets;
    c.render(accepted, 112000);
    c.unmount();
    for (const callback of c.timers.splice(0)) callback();
    await Promise.resolve();
    assert.deepEqual(c.calls, [], "unmount cannot settle accepted bets or activate next-round bets locally");
    assert.deepEqual(c.writes, []);
  });
}

test("32 cards deals visibly during closed betting and announces the winner only after every card is shown", () => {
  const cardOf = value => ({ suit: "♠", value, rank: String(value) });
  const outcome = { draws: [[cardOf(6), cardOf(7)], [cardOf(7), cardOf(6)], [cardOf(8), cardOf(6)], [cardOf(9), cardOf(9)]], totals: [21, 22, 24, 29], winner: 3 };
  const dealing = snapshot("32-cards", "running");
  dealing.round.result = outcome;
  dealing.myBets = [bet("32-cards", { status: "pending", payout: 0 })];
  const c = client("32-cards", dealing, 110000);
  const faces = () => nodes(c.tree, node => /(?:^|\s)card-in(?:\s|$)/.test(node.props?.className ?? "")).length;
  assert.equal(faces(), 0);
  let previous = 0;
  for (let at = 110300; at < 115000; at += 300) {
    c.render(dealing, at);
    assert.ok(faces() >= previous);
    previous = faces();
    assert.doesNotMatch(text(c.tree), /WINNER|YOU WIN|No win|WINS/);
  }
  assert.equal(previous, 8, "all cards are on the table before the result phase");
  const result = { ...structuredClone(dealing), round: { ...dealing.round, phase: "result", result: outcome } };
  result.myBets = [bet("32-cards", { status: "win", payout: 102.5 })];
  c.render(result, 115000);
  assert.equal(faces(), 8);
  assert.match(text(c.tree), /WINNER/);
  assert.match(text(c.tree), /YOU WIN/);
  c.unmount();
});

test("baccarat deals four to six cards before announcing or sounding the result", () => {
  for (const [playerCount, bankerCount] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
    const dealing = snapshot("baccarat", "running");
    dealing.round.result = {
      ...outcomes.baccarat,
      playerCards: Array.from({ length: playerCount }, () => card),
      bankerCards: Array.from({ length: bankerCount }, () => card),
    };
    dealing.myBets = [bet("baccarat", { status: "pending", payout: 0 })];
    const c = client("baccarat", dealing, 110000);
    const faces = () => nodes(c.tree, node => node.type === "PlayingCard" && !node.props.faceDown).length;
    assert.equal(faces(), 0);
    const order = [0, playerCount, 1, playerCount + 1];
    if (playerCount === 3) order.push(2);
    if (bankerCount === 3) order.push(playerCount + 2);
    for (let index = 0; index < order.length; index++) {
      const at = 110300 + index * 650;
      c.render(dealing, at - 1);
      assert.equal(faces(), index);
      c.render(dealing, at);
      const cards = nodes(c.tree, node => node.type === "PlayingCard");
      assert.equal(faces(), index + 1);
      assert.equal(cards[order[index]].props.faceDown, false);
      assert.doesNotMatch(text(c.tree), /WINS|You won|No win/);
      assert.equal(nodes(c.tree, node => node.type === "GameOverOverlay")[0].props.open, false);
      assert.equal(c.sounds.filter(sound => ["win", "lose"].includes(sound.name)).length, 0);
    }
    c.render(dealing, 114999);
    assert.equal(faces(), playerCount + bankerCount);
    const result = structuredClone(dealing);
    result.round.phase = "result";
    result.myBets = [bet("baccarat")];
    c.render(result, 115000);
    assert.equal(faces(), playerCount + bankerCount);
    assert.match(text(c.tree), /BANKER WINS/);
    assert.equal(nodes(c.tree, node => node.type === "GameOverOverlay")[0].props.open, true);
    assert.equal(c.sounds.filter(sound => sound.name === "win").length, 1);
    assert.deepEqual(c.calls, []);
    c.unmount();
  }
});

test("baccarat late spectators join the shared deal rather than restarting it", () => {
  const dealing = snapshot("baccarat", "running");
  dealing.round.result = outcomes.baccarat;
  const c = client("baccarat", dealing, 111600);
  assert.deepEqual(nodes(c.tree, node => node.type === "PlayingCard").map(node => node.props.faceDown), [false, false, false, true]);
  c.render(dealing, 112250);
  assert.equal(nodes(c.tree, node => node.type === "PlayingCard" && !node.props.faceDown).length, 4);
  assert.doesNotMatch(text(c.tree), /WINS/);
  c.unmount();
});

test("speed baccarat joins reveal at server progress, never restarts a private countdown", () => {
  const state = snapshot("speed-baccarat", "result");
  const c = client("speed-baccarat", state, 115000);
  assert.deepEqual(nodes(c.tree, (node) => node.type === "Hand").map((node) => node.props.revealed), [1, 0]);
  c.render(state, 115900);
  assert.deepEqual(nodes(c.tree, (node) => node.type === "Hand").map((node) => node.props.revealed), [2, 2]);
  assert.deepEqual(c.calls, []);
});

test("speed baccarat explicitly enabled auto-repeat submits once per shared betting round", async () => {
  const result = snapshot("speed-baccarat", "result");
  result.myBets = [bet("speed-baccarat")];
  result.bets = result.myBets;
  const c = client("speed-baccarat", result, 118000);
  button(c, "auto rebet").props.onClick();
  c.render(result, 118000);
  assert.deepEqual(c.calls, []);
  const next = snapshot("speed-baccarat");
  next.round = { ...next.round, roundNo: 43, bettingEndsAt: 130000 };
  c.render(next, 123000);
  await Promise.resolve();
  assert.deepEqual(c.calls, [{ action: "bet", option: "banker", amount: 50 }]);
  c.render(structuredClone(next), 124000);
  await Promise.resolve();
  assert.equal(c.calls.length, 1);
});
