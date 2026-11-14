import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", ...Object.keys(globals), code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const catalog = load("src\\lib\\gameCatalog.ts");
const multiplayer = load("src\\lib\\multiplayer-types.ts");
const { BROWSER_POOL_GAMES } = load("src\\lib\\dailyPoolBrowserGames.ts", {
  "./gameCatalog": catalog, "./multiplayer-types": multiplayer,
});

function minesModule(scene) {
  const modules = new Map();
  function read(file) {
    const absolute = resolve(file);
    if (modules.has(absolute)) return modules.get(absolute);
    const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    modules.set(absolute, exports);
    new Function("require", "exports", code)(name => {
      if (name === "@/models") return { oid: id => id, MinesGame: { exists: async () => false } };
      if (name === "node:crypto") return crypto;
      if (name === "./mongo") return { dbConnect: async () => {} };
      if (name === "./mysql") return { isMysqlEnabled: () => true };
      if (name === "./gameAccess") return { checkGameAccess: async () => null };
      if (name === "./dailyPoolConfig") return { dailyPoolEnabled: () => true };
      if (name === "./multiplayer-store") return { mysqlMultiplayerStore: scene.store };
      if (name === "./winHold") return { heldPortion: () => 0 };
      if (name.startsWith(".")) return read(resolve(dirname(absolute), `${name}.ts`));
      throw new Error(`Unexpected Mines dependency ${name}`);
    }, exports);
    return exports;
  }
  scene.data.minesgames = [];
  return read("src\\lib\\mines.ts");
}

test("all 70 local games accept an exact Rs 10 opening wager in the real transactional engines", async t => {
  const scene = createLegacyScene(["alice"], { poolEnabled: true });
  scene.data.plinkobets = [];
  scene.data.games.push(...catalog.GAME_ORDER.map(slug => ({ _id: slug, slug, isActive: true })));
  const options = {
    baccarat: "player", "speed-baccarat": "player", "dream-catcher": "1", "football-studio": "HOME",
    "auto-roulette": "red", "lightning-roulette": "out-red", "sic-bo": "small", "blast-off": "main",
    "nine-wickets": "four", "7-up-down": "down", "tai-xiu": "tai", "32-cards": "A",
  };
  const mines = minesModule(scene);
  const dedicated = {
    aviator: async () => {
      const state = await scene.flight.getState("alice", "aviator");
      return scene.flight.placeBet("alice", "aviator", 10, 0, state.round.roundNo);
    },
    "aviator-x": async () => {
      const state = await scene.flight.getState("alice", "aviator-x");
      return scene.flight.placeBet("alice", "aviator-x", 10, 0, state.round.roundNo);
    },
    "dragon-tiger": () => scene.cards.placeBet("alice", "dragon-tiger", "dragon", 10, 1, crypto.randomUUID()),
    "andar-bahar": () => scene.cards.placeBet("alice", "andar-bahar", "andar", 10, 1, crypto.randomUUID()),
    "chicken-road-2": () => scene.chicken.startPoolChicken("alice", "chicken-road-2", 10, "easy"),
    "chicken-dash": () => scene.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy"),
    limbo: () => scene.limbo.play("alice", 10, 2, crypto.randomUUID()),
    plinko: () => scene.plinko.drop("alice", 10, "low", 12, crypto.randomUUID()),
    "lucky-777": () => scene.slot.spin("alice", 10, crypto.randomUUID()),
    mines: () => mines.start("alice", 10, 3),
  };
  assert.equal(new Set([...BROWSER_POOL_GAMES, ...multiplayer.MULTIPLAYER_GAMES, ...Object.keys(dedicated)]).size, 70);
  for (const game of catalog.GAME_ORDER) {
    await t.test(game, async () => {
      const before = scene.users.get("alice").balance;
      const count = scene.data.gameresults.length;
      let reply;
      if (BROWSER_POOL_GAMES.includes(game)) {
        reply = await scene.store.transact(game, tx => scene.browser.browserPoolLifecycle(tx, "alice", {
          game, wagerId: crypto.randomUUID(), operationId: crypto.randomUUID(),
          action: "accept", amount: 10, poolVersion: scene.poolRules.DAILY_POOL_VERSION,
        }));
      } else if (multiplayer.MULTIPLAYER_GAMES.includes(game)) {
        const state = await scene.multiplayer.read(game, "alice");
        reply = await scene.multiplayer.act(game, "alice", {
          action: "bet", requestId: crypto.randomUUID(), roundNo: state.round.roundNo,
          option: options[game], amount: 10, poolRulesVersion: scene.poolRules.DAILY_POOL_VERSION,
        });
      } else reply = await dedicated[game]();
      assert.equal(reply.error, undefined, `${game}: ${reply.error}`);
      assert.equal(reply.ok, true, game);
      const records = scene.data.gameresults.slice(count);
      if (multiplayer.MULTIPLAYER_GAMES.includes(game)) {
        const bets = scene.data.multiplayerrooms.filter(room => room.game === game)
          .flatMap(room => [...room.bets, ...room.queuedBets]).filter(bet => bet.userId === "alice");
        assert.equal(bets.length, 1, `${game}: persist exactly one accepted wager`);
        assert.equal(bets[0].amount, 10, `${game}: do not round or raise the wager`);
      } else {
        assert.equal(records.length, 1, `${game}: persist exactly one accepted wager`);
        assert.equal(records[0].betAmount, 10, `${game}: do not round or raise the wager`);
      }
      assert.equal(scene.users.get("alice").balance, Math.round((before - 10 + (records[0]?.winAmount ?? 0)) * 100) / 100);
    });
  }
});

test("Birds & Beasts places Rs 10, accepts a saved custom chip, and rejects amounts below Rs 10 before debit", async () => {
  const states = [], refs = [], stakes = [];
  let cursor = 0, refCursor = 0;
  const jsx = (type, props) => ({ type, props });
  const config = load("src\\components\\birds-beasts\\lib\\game-config.ts");
  const sounds = new Proxy({}, { get: () => () => {} });
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
        return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
      },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useEffect() {}, useCallback: fn => fn, useMemo: fn => fn(),
    },
    "next/link": { default: "a" }, "@/lib/gameResultNotice": {},
    "@/lib/walletSync": {
      useGameBalance: () => [1000],
      usePoolLifecycle: () => ({ stake: async amount => { stakes.push(amount); return true; }, checkpoint() {} }),
      usePoolRoundState: (_game, _key, initial) => imports.react.useState(initial),
    },
    "../blast-off/useRoundQueue": { useRoundQueue: () => ({}), QueuedWager: "queue" },
    "./lib/game-config": config, "./hooks/useSounds": { useSounds: () => sounds }, "./birds-beasts.css": {},
    ...Object.fromEntries(["Wheel", "BetBoard", "ChipRail", "HistoryStrip", "RulesModal"].map(name => [`./${name}`, { default: name }])),
  };
  const { default: Game } = load("src\\components\\birds-beasts\\BirdsBeasts.tsx", imports, {
    window: { setTimeout: () => 1, clearTimeout() {} },
  });
  const render = () => {
    cursor = 0; refCursor = 0;
    const nodes = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      nodes.push(node); visit(node.props?.children);
    };
    visit(Game({}));
    return nodes;
  };
  render(); states[0] = true;
  const board = () => render().find(node => node.type === "BetBoard");
  const chips = () => render().find(node => node.type === "ChipRail");
  assert.equal(chips().props.selected, 10);
  await board().props.onBet("eagle");
  assert.deepEqual(stakes, [10]);
  chips().props.onSelect(25);
  await board().props.onBet("owl");
  assert.deepEqual(stakes, [10, 25]);
  chips().props.onSelect(5);
  await board().props.onBet("lion");
  assert.deepEqual(stakes, [10, 25]);
  const toast = render().find(node => node.props?.className?.startsWith("bb-toast "));
  assert.match(toast.props.children, /Minimum bet is Rs\. 10/);
});

test("all 70 pre-sized covers exist and reduce transfer bytes by at least 85%", () => {
  let original = 0, smaller = 0;
  for (const slug of catalog.GAME_ORDER) {
    original += statSync(resolve("public", ...catalog.GAME_IMAGES[slug].split("/").filter(Boolean))).size;
    smaller += statSync(resolve("public", ...catalog.GAME_THUMBNAILS[catalog.GAME_IMAGES[slug]].split("/").filter(Boolean))).size;
  }
  assert.ok(smaller / original < 0.15, `${smaller} / ${original}`);
});
