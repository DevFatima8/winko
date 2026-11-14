import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture({ user = { id: "alice", role: "client" }, missing = false, fail = false, results = [{
  _id: "saved-result", userId: "alice", gameId: "catalog-id",
  roundNo: 7, betAmount: 100, winAmount: 0,
  outcome: "win", poolPending: true, poolClaim: 800, createdAt: "2026-11-14T12:00:00Z",
}], transactions = [] } = {}) {
  const queries = [];
  const route = { exports: {} };
  const imports = {
    "next/server": { NextResponse: Response },
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
    "@/models": {
      Game: { find: () => ({ lean: async () => [{ _id: "catalog-id", slug: "aviator-x", name: "Aviator X", icon: "A" }] }), findOne: filter => ({ lean: async () => {
        queries.push({ game: filter });
        if (fail) throw new Error("fixture database unavailable");
        return missing ? null : { _id: "catalog-id" };
      } }) },
      GameResult: { find: filter => {
        const query = { filter };
        queries.push(query);
        const chain = {
          sort(value) { query.sort = value; return this; },
          limit(value) { query.limit = value; return this; },
          lean: async () => results.filter(row =>
            row.userId === filter.userId &&
            (!filter.gameId || filter.gameId.$in.includes(row.gameId)) &&
            (!filter.outcome || row.outcome !== filter.outcome.$ne)
          ).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, query.limit),
        };
        return chain;
      }, aggregate: async ([{ $match: match }]) => {
        const rows = results.filter(row => row.userId === match.userId && row.outcome !== match.outcome.$ne && row.poolPending !== match.poolPending.$ne);
        return [{ rounds: rows.length, bets: rows.reduce((sum, row) => sum + row.betAmount, 0), wins: rows.reduce((sum, row) => sum + row.winAmount, 0) }];
      } },
      Transaction: { find: () => ({ sort() { return this; }, limit() { return this; }, lean: async () => transactions }) },
    },
    "@/lib/platform": { getSettings: async () => ({ vipLevels: [] }) },
    "@/lib/winHold": { getWinHoldSummary: async () => ({ locked: 0, claimable: 0 }) },
    "@/lib/gameResultGames": { gameResultGameMap: games => new Map(games.flatMap(game => [[game._id, game], [game.slug, game]])) },
  };
  const code = ts.transpileModule(readFileSync("src\\app\\api\\player\\history\\route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected history dependency: ${name}`);
    return imports[name];
  }, route, route.exports);
  return { queries, read: game => route.exports.GET(new Request(`http://localhost/api/player/history?userId=bob&limit=100000${game === undefined ? "" : `&game=${game}`}`)) };
}

test("per-game history uses saved results, authenticated owner, both legacy game references, and a bounded stable limit", async () => {
  const f = fixture();
  const response = await f.read("aviator-x");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.ok([30, 40, 50].includes(data.limit));
  assert.deepEqual(f.queries[1], {
    filter: { userId: "alice", gameId: { $in: ["catalog-id", "aviator-x"] }, outcome: { $ne: "pending" } },
    sort: { createdAt: -1 }, limit: data.limit,
  });
  assert.deepEqual(data.plays, [{
    id: "saved-result", round: 7, bet: 100, payout: 0, outcome: "win",
    at: "2026-11-14T12:00:00Z", poolPending: true, claim: 800,
  }]);
  assert.equal((await (await f.read("aviator-x")).json()).limit, data.limit);
});

test("unfinished wagers cannot fill the history limit or appear in player records; completed pool claims remain visible", async () => {
  const completed = {
    _id: "finished", userId: "alice", gameId: "catalog-id", roundNo: 1,
    betAmount: 10, winAmount: 50, outcome: "win", createdAt: "2026-11-13T12:00:00Z",
  };
  const results = [
    ...Array.from({ length: 101 }, (_, i) => ({ ...completed, _id: `unfinished-${i}`, outcome: "pending", betAmount: 10000, createdAt: "2026-11-14T12:00:00Z" })),
    completed,
    { ...completed, _id: "claim", betAmount: 100, winAmount: 0, poolPending: true, poolClaim: 800 },
    { ...completed, _id: "other-player", userId: "bob" },
  ];
  const transactions = [{ _id: "deposit", status: "pending", amount: 25 }];
  const before = structuredClone(results);
  const f = fixture({ results, transactions });
  const response = await f.read();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.plays.map(row => row._id), ["finished", "claim"]);
  assert.equal(data.plays[1].poolPending, true);
  assert.equal(data.plays[1].poolClaim, 800);
  assert.deepEqual(data.totals, { rounds: 1, bets: 10, wins: 50 });
  assert.deepEqual(data.transactions, transactions, "Pending deposits are not unfinished game results");
  assert.deepEqual(results, before, "Reading history must not settle or delete saved wagers");
  assert.deepEqual((await (await f.read("aviator-x")).json()).plays.map(row => row.id), ["finished", "claim"]);
});

test("history refuses guests, staff, invalid slugs and unknown games instead of reading other results", async () => {
  for (const user of [null, { id: "admin", role: "admin" }]) {
    const f = fixture({ user });
    assert.equal((await f.read("aviator")).status, 401);
    assert.equal(f.queries.length, 0);
  }
  const invalid = fixture();
  assert.equal((await invalid.read("bad%2Fslug")).status, 400);
  assert.equal(invalid.queries.length, 0);
  const missing = fixture({ missing: true });
  assert.equal((await missing.read("unknown")).status, 404);
  assert.equal(missing.queries.length, 1);
});

test("history exposes database outages as errors, not an empty success-shaped list", async () => {
  const f = fixture({ fail: true });
  const response = await f.read("plinko");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.equal(body.plays, undefined);
});
