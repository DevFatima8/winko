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

async function checkOpeningWagerBoundary(t, amount) {
  const scene = createLegacyScene(["alice"], { poolEnabled: true });
  scene.users.get("alice").balance = 100_000_000;
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
      return scene.flight.placeBet("alice", "aviator", amount, 0, state.round.roundNo);
    },
    "aviator-x": async () => {
      const state = await scene.flight.getState("alice", "aviator-x");
      return scene.flight.placeBet("alice", "aviator-x", amount, 0, state.round.roundNo);
    },
    "dragon-tiger": () => scene.cards.placeBet("alice", "dragon-tiger", "dragon", amount, 1, crypto.randomUUID()),
    "andar-bahar": () => scene.cards.placeBet("alice", "andar-bahar", "andar", amount, 1, crypto.randomUUID()),
    "chicken-road-2": () => scene.chicken.startPoolChicken("alice", "chicken-road-2", amount, "easy"),
    "chicken-dash": () => scene.chicken.startPoolChicken("alice", "chicken-dash", amount, "easy"),
    limbo: () => scene.limbo.play("alice", amount, 2, crypto.randomUUID()),
    plinko: () => scene.plinko.drop("alice", amount, "low", 12, crypto.randomUUID()),
    "lucky-777": () => scene.slot.spin("alice", amount, crypto.randomUUID()),
    mines: () => mines.start("alice", amount, 3),
  };
  assert.equal(new Set([...BROWSER_POOL_GAMES, ...multiplayer.MULTIPLAYER_GAMES, ...Object.keys(dedicated)]).size, 70);
  for (const game of catalog.GAME_ORDER) {
    await t.test(game, async () => {
      const before = scene.users.get("alice").balance;
      const count = scene.data.gameresults.length;
      const submit = async () => {
        if (BROWSER_POOL_GAMES.includes(game)) {
          return scene.store.transact(game, tx => scene.browser.browserPoolLifecycle(tx, "alice", {
            game, wagerId: crypto.randomUUID(), operationId: crypto.randomUUID(),
            action: "accept", amount, poolVersion: scene.poolRules.DAILY_POOL_VERSION,
          }));
        } else if (multiplayer.MULTIPLAYER_GAMES.includes(game)) {
          const state = await scene.multiplayer.read(game, "alice");
          return scene.multiplayer.act(game, "alice", {
            action: "bet", requestId: crypto.randomUUID(), roundNo: state.round.roundNo,
            option: options[game], amount, poolRulesVersion: scene.poolRules.DAILY_POOL_VERSION,
          });
        } else return dedicated[game]();
      };
      if (amount < 10 || amount > 100_000) {
        const reply = await submit().catch(error => ({ error: error.message }));
        assert.match(reply.error, amount < 10 ? /minimum|at least 10/i : /100,000/);
        assert.equal(scene.users.get("alice").balance, before, `${game}: rejected wager must not debit`);
        assert.equal(scene.data.gameresults.length, count, `${game}: rejected wager must not create a result`);
        const bets = scene.data.multiplayerrooms.filter(room => room.game === game && Array.isArray(room.bets))
          .flatMap(room => [...room.bets, ...room.queuedBets]).filter(bet => bet.userId === "alice");
        assert.equal(bets.length, 0, `${game}: rejected wager must not persist a bet`);
        return;
      }
      const reply = await submit();
      assert.equal(reply.error, undefined, `${game}: ${reply.error}`);
      assert.equal(reply.ok, true, game);
      const records = scene.data.gameresults.slice(count);
      if (multiplayer.MULTIPLAYER_GAMES.includes(game) && !BROWSER_POOL_GAMES.includes(game)) {
        const bets = scene.data.multiplayerrooms.filter(room => room.game === game && Array.isArray(room.bets))
          .flatMap(room => [...room.bets, ...room.queuedBets]).filter(bet => bet.userId === "alice");
        assert.equal(bets.length, 1, `${game}: persist exactly one accepted wager`);
        assert.equal(bets[0].amount, amount, `${game}: do not round or raise the wager`);
      } else {
        assert.equal(records.length, 1, `${game}: persist exactly one accepted wager`);
        assert.equal(records[0].betAmount, amount, `${game}: do not round or raise the wager`);
      }
      assert.equal(scene.users.get("alice").balance, Math.round((before - amount + (records[0]?.winAmount ?? 0)) * 100) / 100);
    });
  }
}
for (const amount of [10, 100_000, 9.99, 100_000.01]) {
  test(`all 70 local games ${amount >= 10 && amount <= 100_000 ? "accept" : "reject"} an exact Rs ${amount} opening wager in the real transactional engines`,
    t => checkOpeningWagerBoundary(t, amount));
}

test("wager cap applies to every live table's player total, not other players or replayed requests", async t => {
  const options = {
    baccarat: "player", "speed-baccarat": "player", "dream-catcher": "1", "football-studio": "HOME",
    "auto-roulette": "red", "lightning-roulette": "out-red", "sic-bo": "small", "blast-off": "main",
    "nine-wickets": "four", "7-up-down": "down", "tai-xiu": "tai", "32-cards": "A", "birds-beasts": "chicken",
  };
  const scene = createLegacyScene(["alice", "bob"], { poolEnabled: true });
  scene.data.games.push(...catalog.GAME_ORDER.map(slug => ({ _id: slug, slug, isActive: true })));
  for (const user of scene.users.values()) user.balance = 10_000_000;
  for (const game of multiplayer.MULTIPLAYER_GAMES) {
    await t.test(game, async () => {
      const state = await scene.multiplayer.read(game, "alice");
      const request = amount => ({
        action: "bet", requestId: crypto.randomUUID(), roundNo: state.round.roundNo,
        option: options[game], amount, poolRulesVersion: scene.poolRules.DAILY_POOL_VERSION,
      });
      const first = request(99_990);
      await scene.multiplayer.act(game, "alice", first);
      await scene.multiplayer.act(game, "alice", request(10));
      const before = scene.users.get("alice").balance;
      await assert.rejects(scene.multiplayer.act(game, "alice", request(10)), /100,000/);
      assert.equal(scene.users.get("alice").balance, before);
      await scene.multiplayer.act(game, "alice", first);
      assert.equal(scene.users.get("alice").balance, before, "a confirmed retry must not debit again");
      await scene.multiplayer.act(game, "bob", request(100_000));
      const alice = await scene.multiplayer.read(game, "alice");
      assert.equal(alice.myBets.reduce((sum, bet) => sum + bet.amount, 0), 100_000);
      const bob = await scene.multiplayer.read(game, "bob");
      assert.equal(bob.myBets.reduce((sum, bet) => sum + bet.amount, 0), 100_000);
    });
  }
});

test("wager cap covers combined Aviator panels and card chips; cancellation releases stake capacity", async t => {
  const scene = createLegacyScene(["alice"], { poolEnabled: true });
  scene.data.games.push(...catalog.GAME_ORDER.map(slug => ({ _id: slug, slug, isActive: true })));
  scene.users.get("alice").balance = 10_000_000;
  for (const game of ["aviator", "aviator-x"]) {
    await t.test(game, async () => {
      const state = await scene.flight.getState("alice", game);
      assert.equal((await scene.flight.placeBet("alice", game, 99_990, 0, state.round.roundNo)).ok, true);
      const before = scene.users.get("alice").balance;
      assert.match((await scene.flight.placeBet("alice", game, 20, 1, state.round.roundNo)).error, /100,000/);
      assert.equal(scene.users.get("alice").balance, before);
      assert.equal((await scene.flight.placeBet("alice", game, 10, 1, state.round.roundNo)).ok, true);
      assert.equal((await scene.flight.cancelBet("alice", game, 0, state.round.roundNo)).ok, true);
      assert.equal((await scene.flight.placeBet("alice", game, 99_990, 0, state.round.roundNo)).ok, true);
    });
  }
  for (const game of ["dragon-tiger", "andar-bahar"]) {
    await t.test(game, async () => {
      const state = await scene.cards.getState("alice", game);
      const option = game === "dragon-tiger" ? "dragon" : "andar";
      const place = amount => scene.cards.placeBet("alice", game, option, amount, state.round.roundNo, crypto.randomUUID());
      assert.equal((await place(99_990)).ok, true);
      const before = scene.users.get("alice").balance;
      assert.match((await place(20)).error, /100,000/);
      assert.equal(scene.users.get("alice").balance, before);
      assert.equal((await place(10)).ok, true);
      assert.equal((await scene.cards.cancelBets("alice", game, "current", state.round.roundNo)).ok, true);
      assert.equal((await place(100_000)).ok, true);
    });
  }
});

test("wager cap covers browser increments in both accounting modes without capping returns", async () => {
  for (const enabled of [false, true]) {
    const scene = createLegacyScene(["alice"], { poolEnabled: enabled });
    scene.users.get("alice").balance = 1_000_000;
    const game = "crash-bonus", wagerId = crypto.randomUUID();
    scene.data.games.push({ _id: game, slug: game, isActive: true });
    const action = (action, amount, operationId = crypto.randomUUID()) =>
      scene.store.transact(game, tx => scene.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, action, amount, operationId, poolVersion: scene.poolRules.DAILY_POOL_VERSION,
      }, enabled));
    const firstId = crypto.randomUUID();
    await action("accept", 99_990, firstId);
    await action("increment", 10);
    const before = scene.users.get("alice").balance;
    await assert.rejects(action("increment", 10), /100,000/);
    assert.equal(scene.users.get("alice").balance, before);
    await action("accept", 99_990, firstId);
    assert.equal(scene.users.get("alice").balance, before);
    await action("reduce", 10);
    await action("increment", 10);
    const completed = await action("complete", 250_000);
    assert.equal(completed.claim, 250_000, "the bet cap must not become a payout cap");
  }
});

test("wager cap rejects out-of-range legacy balance requests before database writes", async () => {
  const limits = load("src\\lib\\gameBetLimits.ts");
  const imports = {};
  const routeFile = "src\\app\\api\\player\\balance\\route.ts";
  const source = ts.createSourceFile(routeFile, readFileSync(routeFile, "utf8"), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) imports[statement.moduleSpecifier.text] = {};
  }
  let writes = 0;
  Object.assign(imports, {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/models": { User: { updateOne: async () => { writes++; throw new Error("Unexpected debit"); } } },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "alice", role: "client" }) },
    "@/lib/dailyPoolConfig": { dailyPoolEnabled: () => false },
    "@/lib/cardGameRules": { isCardGame: () => false },
    "@/lib/rouletteGameRules": { isRouletteGame: () => false, isWheelGame: () => false },
    "@/lib/slotGameRules": { isSlotGame: () => false },
    "@/lib/dailyPoolRules": { isDailyPoolGame: slug => catalog.GAME_ORDER.includes(slug) },
    "@/lib/gameAvailability": { LOCAL_GAMES_CONNECTED: true },
    "@/lib/winOpportunityRules": { isThirtyWinGame: () => false },
    "@/lib/gameBetLimits": limits,
  });
  const { POST } = load(routeFile, imports);
  for (const body of [
    { delta: -9.99 },
    { delta: -100_000.01 },
    { delta: -200_000, bet: 10 },
    { delta: 149_999, bet: 100_001, win: 250_000 },
  ]) {
    const response = await POST(new Request("https://fixture.invalid/api/player/balance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: "crash-bonus", ...body }),
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Minimum|100,000/);
  }
  assert.equal(writes, 0);
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
