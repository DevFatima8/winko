import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const cardRules = load("src\\lib\\cardGameRules.ts");
const rouletteRules = load("src\\lib\\rouletteGameRules.ts");
const slotRules = load("src\\lib\\slotGameRules.ts");
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const auth = { getServerSessionUser: async () => ({ id: "alice", role: "client" }) };
const rules = { isDailyPoolGame: () => true, dailyPoolLock: game => `test:${game}` };
const config = { dailyPoolEnabled: () => true };

test("the 26 local card titles use one explicit wallet policy; other games stay separate", () => {
  assert.equal(cardRules.CARD_GAMES.length, 26);
  assert.equal(new Set(cardRules.CARD_GAMES).size, 26);
  for (const game of cardRules.CARD_GAMES) assert.equal(cardRules.isCardGame(game), true);
  for (const game of ["plinko", "super-fruits", "aviator", "ludo", "unknown"]) {
    assert.equal(cardRules.isCardGame(game), false);
  }
});

test("balance API selects instant mode for every new card wager even with the global daily pool enabled", async () => {
  const calls = [];
  const lifecycle = async (_tx, _user, input, enabled) => {
    calls.push({ game: input.game, enabled });
    return { ok: true, balance: 990, wagerId: input.wagerId };
  };
  const route = load("src\\app\\api\\player\\balance\\route.ts", {
    "next/server": next, "@/models": {}, "@/lib/serverAuth": auth,
    "@/lib/gameAvailability": { LOCAL_GAMES_CONNECTED: true },
    "@/lib/mongo": {}, "@/lib/dailyPoolConfig": config,
    "@/lib/cardGameRules": cardRules, "@/lib/rouletteGameRules": rouletteRules, "@/lib/slotGameRules": slotRules, "@/lib/dailyPoolRules": rules,
    "@/lib/browserCardActions": { actBrowserCard: lifecycle },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_lock, fn) => fn({}) } },
    "@/lib/dailyPoolBrowser": { isBrowserPoolGame: () => true, browserPoolLifecycle: lifecycle },
  });
  for (const game of [...cardRules.CARD_GAMES, ...rouletteRules.ROULETTE_GAMES, ...rouletteRules.WHEEL_GAMES, ...slotRules.SLOT_GAMES, "thai-hi-lo", "ludo"]) {
    const response = await route.POST(new Request("https://fixture.invalid/api/player/balance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ game, action: "accept", ownerId: "alice", amount: 10, wagerId: "test-wager" }),
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).enabled, !cardRules.isCardGame(game) && !rouletteRules.isRouletteGame(game) && !rouletteRules.isWheelGame(game) && !slotRules.isSlotGame(game) && game !== "thai-hi-lo", game);
  }
  for (const game of [...cardRules.CARD_GAMES, ...rouletteRules.ROULETTE_GAMES, ...rouletteRules.WHEEL_GAMES, ...slotRules.SLOT_GAMES, "thai-hi-lo"]) {
    const response = await route.POST(new Request("https://fixture.invalid/api/player/balance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ game, delta: 10000 }),
    }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /balance deltas cannot/);
  }
  const actionResponse = await route.POST(new Request("https://fixture.invalid/api/player/balance", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      game: "blackjack", action: "card-action", ownerId: "alice",
      wagerId: "test-wager", operationId: "test-move", selection: { move: "stand" },
    }),
  }));
  assert.equal(actionResponse.status, 200);
  assert.deepEqual(calls.at(-1), { game: "blackjack", enabled: false });
  const nonCardResponse = await route.POST(new Request("https://fixture.invalid/api/player/balance", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ game: "super-fruits", action: "card-action", ownerId: "alice" }),
  }));
  assert.equal(nonCardResponse.status, 409);
});

test("pool status preserves old card pool entries while reporting instant mode for new card bets", async () => {
  const entries = [{ id: "old-pool-wager", status: "active", stake: 10, claim: 0, payout: 0 }];
  const route = load("src\\app\\api\\player\\daily-pool\\route.ts", {
    "next/server": next, "@/lib/serverAuth": auth, "@/lib/dailyPoolRules": rules,
    "@/lib/dailyPoolConfig": config, "@/lib/cardGameRules": cardRules, "@/lib/rouletteGameRules": rouletteRules, "@/lib/slotGameRules": slotRules,
    "@/lib/dailyPoolService": { playerPoolStatus: async () => ({ balance: 990, entries }) },
  });
  for (const game of [...cardRules.CARD_GAMES, ...rouletteRules.ROULETTE_GAMES, ...rouletteRules.WHEEL_GAMES, ...slotRules.SLOT_GAMES, "thai-hi-lo", "plinko"]) {
    const response = await route.GET(new Request(`https://fixture.invalid/api/player/daily-pool?game=${game}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.enabled, !cardRules.isCardGame(game) && !rouletteRules.isRouletteGame(game) && !rouletteRules.isWheelGame(game) && !slotRules.isSlotGame(game) && game !== "thai-hi-lo", game);
    assert.deepEqual(body.entries, entries);
    assert.equal(body.balance, 990);
  }
});
