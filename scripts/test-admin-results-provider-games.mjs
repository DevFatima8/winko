import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", outputText)(loaded, loaded.exports, (name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  });
  return loaded.exports;
}

const resultGames = load(join("src", "lib", "gameResultGames.ts"));
const { gameResultSummaries } = resultGames;

test("Results list includes every provider catalog game with its image, even without rounds", () => {
  const summaries = gameResultSummaries(
    [{ _id: "builtin-1", slug: "mines", name: "Mines", icon: "💎" }],
    [{ slug: "gregmorn-a", title: "1001 Fruit Wishes", imageUrl: "https://img/a.png" }, { slug: "gregmorn-b", title: "Mines", imageUrl: "https://img/b.png" }],
    [],
  );
  assert.deepEqual(summaries.map((s) => [s.key, s.name, s.icon, s.total]), [
    ["gregmorn-a", "1001 Fruit Wishes", "https://img/a.png", 0],
    ["builtin-1", "Mines", "💎", 0],
    ["gregmorn-b", "Mines", "https://img/b.png", 0],
  ]);
});

test("Provider results recorded under the saved game id or slug count toward that API game", () => {
  const summaries = gameResultSummaries(
    [{ _id: "saved-1", slug: "gregmorn-a", name: "Old title", icon: "" }],
    [{ slug: "gregmorn-a", title: "Fruit Wishes", imageUrl: "https://img/a.png" }, { slug: "gregmorn-b", title: "Coin Horse", imageUrl: "https://img/b.png" }],
    [
      { _id: "saved-1", total: 3, wins: 1, losses: 2, bet: 30, paid: 12 },
      { _id: "gregmorn-a", total: 1, wins: 0, losses: 1, bet: 5, paid: 0 },
      { _id: "gregmorn-b", total: 2, wins: 2, losses: 0, bet: 4, paid: 9 },
      { _id: "deleted-game", total: 1, wins: 0, losses: 1, bet: 1, paid: 0 },
    ],
  );
  const byKey = Object.fromEntries(summaries.map((s) => [s.key, s]));
  assert.deepEqual([byKey["saved-1"].name, byKey["saved-1"].icon, byKey["saved-1"].total, byKey["saved-1"].wins, byKey["saved-1"].losses, byKey["saved-1"].profit], ["Fruit Wishes", "https://img/a.png", 4, 1, 3, 23]);
  assert.deepEqual(byKey["saved-1"].refs, ["saved-1", "gregmorn-a"]);
  assert.deepEqual([byKey["gregmorn-b"].total, byKey["gregmorn-b"].profit], [2, -5]);
  assert.deepEqual([byKey.unknown.name, byKey.unknown.refs], ["Unknown", ["deleted-game"]]);
  assert.equal(summaries[0].key, "saved-1");
});

function resultsFixture(level = 2) {
  const users = [
    { _id: "alice", name: "Alice", phone: "fixture-a", role: "client", referredBy: "staff", balance: 1000 },
    { _id: "bob", name: "Bob", phone: "fixture-b", role: "client", referredBy: "other", balance: 1000 },
  ];
  const games = [{ _id: "saved-mines", slug: "mines", name: "Mines", icon: "M" }];
  const catalog = [{ slug: "provider-a", title: "Provider A", imageUrl: "" }, { slug: "provider-b", title: "Provider B", imageUrl: "" }];
  const result = (_id, extra) => ({
    _id, userId: "alice", gameId: "mines", roundNo: 1, betAmount: 100, winAmount: 200,
    outcome: "win", createdAt: new Date("2026-11-14T12:00:00Z"), ...extra,
  });
  const rows = [
    ...Array.from({ length: 501 }, (_, i) => result(`unfinished-${i}`, { outcome: "pending", betAmount: 10000, createdAt: new Date("2026-11-15T12:00:00Z") })),
    result("win", {}),
    result("lose", { gameId: "saved-mines", outcome: "lose", betAmount: 50, winAmount: 0 }),
    result("claim", { gameId: "saved-mines", betAmount: 20, winAmount: 0, poolPending: true, poolClaim: 180 }),
    result("outside", { userId: "bob", outcome: "lose", betAmount: 30, winAmount: 0 }),
    result("provider-win", { gameId: "provider-a", betAmount: 10, winAmount: 15 }),
    result("provider-unfinished", { gameId: "provider-b", outcome: "pending" }),
  ];
  const before = structuredClone(rows);
  const matches = (row, filter) => Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some(part => matches(row, part));
    if (condition && typeof condition === "object") return Object.entries(condition).every(([op, value]) => {
      if (op === "$in") return value.includes(row[key]);
      if (op === "$ne") return row[key] !== value;
      assert.fail(`Unexpected fixture operator: ${op}`);
    });
    return row[key] === condition;
  });
  const query = records => {
    let order = {}, limit = Infinity;
    return {
      sort(value) { order = value; return this; },
      limit(value) { limit = value; return this; },
      lean: async () => [...records].sort((a, b) => {
        for (const [key, direction] of Object.entries(order)) {
          if (a[key] < b[key]) return -direction;
          if (a[key] > b[key]) return direction;
        }
        return 0;
      }).slice(0, limit),
    };
  };
  const empty = { find: () => query([]) };
  const { recordedPlayerLogins } = load(join("src", "lib", "dashboardLogins.ts"));
  const route = load(join("src", "app", "api", "admin", "data", "route.ts"), {
    "next/server": { NextResponse: Response },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "staff", dbRole: "admin", level }) },
    "@/lib/auth": { isStaff: role => role === "admin" },
    "@/lib/platform": { getSettings: async () => ({}) },
    "@/lib/siteGameCatalog": { getSiteGameCatalog: async () => catalog },
    "@/lib/gameCatalog": { GAME_SLUGS: ["mines"] },
    "@/lib/gameAvailability": { PROVIDER_GAMES_VISIBLE: true },
    "@/lib/gameResultGames": resultGames,
    "@/lib/dashboardLogins": { recordedPlayerLogins },
    "@/models": {
      User: { find: (filter = {}) => query(users.filter(row => matches(row, filter))), findById: id => ({ lean: async () => users.find(row => row._id === id) }) },
      Game: { find: (filter = {}) => query(games.filter(row => matches(row, filter))) },
      Transaction: empty, LoginEvent: empty, PaymentAccount: empty, SupportThread: empty, Commission: empty,
      GameResult: {
        find: filter => query(rows.filter(row => matches(row, filter))),
        aggregate: async pipeline => {
          let selected = rows;
          for (const stage of pipeline) if (stage.$match) selected = selected.filter(row => matches(row, stage.$match));
          const stats = new Map();
          for (const row of selected) {
            const stat = stats.get(row.gameId) ?? { _id: row.gameId, total: 0, wins: 0, losses: 0, bet: 0, paid: 0 };
            stat.total++;
            stat.wins += Number(row.outcome === "win");
            stat.losses += Number(row.outcome === "lose");
            if (row.outcome !== "pending") { stat.bet += row.betAmount; stat.paid += row.winAmount; }
            stats.set(row.gameId, stat);
          }
          return [...stats.values()];
        },
      },
    },
  });
  return {
    read: search => route.GET(new Request(`http://localhost/api/admin/data?${search}`)),
    assertUnchanged: () => assert.deepEqual(rows, before),
  };
}

test("Game Results counts and limited details exclude unfinished wagers without hiding completed payout claims", async () => {
  const f = resultsFixture();
  const summary = await f.read("view=results");
  assert.equal(summary.status, 200);
  const { games } = await summary.json();
  const mines = games.find(game => game.key === "saved-mines");
  assert.deepEqual([mines.total, mines.wins, mines.losses, mines.profit], [4, 2, 2, 0]);
  assert.equal(games.find(game => game.key === "provider-b").total, 0);
  const response = await f.read("view=results&game=saved-mines");
  assert.equal(response.status, 200);
  const { rows } = await response.json();
  assert.deepEqual(rows.map(row => row._id), ["win", "lose", "claim", "outside"]);
  assert.equal(rows.find(row => row._id === "claim").poolClaim, 180);
  assert.ok(rows.every(row => row.outcome !== "pending"));
  f.assertUnchanged();
});

test("completed results retain agent team isolation in both summary and game details", async () => {
  const f = resultsFixture(1);
  const { games } = await (await f.read("view=results")).json();
  const mines = games.find(game => game.key === "saved-mines");
  assert.deepEqual([mines.total, mines.wins, mines.losses, mines.profit], [3, 2, 1, -30]);
  const { rows } = await (await f.read("view=results&game=saved-mines")).json();
  assert.deepEqual(rows.map(row => row._id), ["win", "lose", "claim"]);
  assert.ok(rows.every(row => row.userId.name === "Alice"));
  f.assertUnchanged();
});

test("dashboard recent results and player details do not surface abandoned wagers", async () => {
  const f = resultsFixture();
  const dashboard = await f.read("view=dashboard");
  assert.equal(dashboard.status, 200);
  const data = await dashboard.json();
  assert.equal(data.recentResults.length, 5);
  assert.ok(data.recentResults.every(row => row.outcome !== "pending"));
  assert.deepEqual(data.resultStats, { c: 5, bet: 210, win: 215 });
  const response = await f.read("view=user&id=alice");
  assert.equal(response.status, 200);
  const player = await response.json();
  assert.deepEqual(player.plays.map(row => row._id), ["win", "lose", "claim", "provider-win"]);
  f.assertUnchanged();
});
