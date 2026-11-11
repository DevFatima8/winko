import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";
import { verifyAviatorRound } from "./verify-aviator-round.mjs";

function load(file, imports = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const rules = load("src\\lib\\aviatorRules.ts");
const flight = load("src\\lib\\aviator.ts", {
  "node:crypto": crypto, "./mongo": {}, "@/models": {}, "./gameAccess": {}, "./aviatorRules": rules,
  "./multiplayer-store": {}, "./dailyPoolRules": {}, "./dailyPool": {},
});
const targets = [1.01, 1.2, 1.5, 1.98, 1.99, 2, 2.01, 3, 5, 10, 20, 50, 99.98];
const D = 2n ** 52n;
function successesAt(k, model = rules.AVIATOR_MODEL) {
  const divisor = BigInt(model === rules.AVIATOR_MODEL && k === 199 ? 200 : k);
  return (80n * D + divisor - 1n) / divisor - 1n;
}

test("exact versioned distributions verify every cent target, including v2's 79.6% RTP at 1.99x", () => {
  assert.equal(rules.crashCentsFromSample(0), 9999);
  assert.equal(rules.crashCentsFromSample(Number(D) - 1), 100);
  for (const model of rules.AVIATOR_MODELS) for (let k = 101; k <= 9998; k++) {
    const successes = successesAt(k, model);
    const probability = Number(successes) / Number(D);
    const theoreticalRtp = model === rules.AVIATOR_MODEL && k === 199 ? 0.796 : 0.8;
    assert.ok(Math.abs(probability * k / 100 - theoreticalRtp) < 3e-14);
    const boundary = Number(successes);
    assert.ok(rules.crashCentsFromSample(boundary - 1, model) > k);
    assert.ok(rules.crashCentsFromSample(boundary, model) <= k);
    for (const growth of [0.06, 0.075]) {
      assert.ok(rules.aviatorReachAt(1_792_937_765_217, (k + 1) / 100, growth) >
        rules.aviatorReachAt(1_792_937_765_217, k / 100, growth), "Integer clock targets must not alias");
    }
    for (const stake of [1000, 1001, 1255, 10000]) {
      const payout = Number(BigInt(stake) * BigInt(k) / 100n);
      assert.equal(rules.aviatorPayout(stake / 100, k / 100), payout / 100);
      const roundedRtp = payout / stake * probability;
      assert.ok(roundedRtp <= theoreticalRtp + 1e-14);
      assert.ok(roundedRtp >= theoreticalRtp - probability / stake - 3e-14);
    }
  }
  assert.equal(rules.validAutoCashout(99.98), true);
  for (const invalid of [1, 0, 99.99, 100, 10000, 1.015, 1.010000000001, NaN, Infinity, "2", null]) {
    assert.equal(rules.validAutoCashout(invalid), false);
  }
  assert.throws(() => rules.crashCentsFromSample(-1), /Invalid/);
  assert.throws(() => rules.crashCentsFromSample(Number(D)), /Invalid/);
  assert.equal(rules.aviatorPayout(10.01, 1.01), 10.11);
  assert.equal(rules.aviatorPayout(100, 2), 200);
  assert.throws(() => rules.aviatorPayout(88000000000001, 1.01), /precision/, "A large payout must never silently lose one paisa in Number conversion");
  for (const [stake, multiplier] of [[10.001, 2], [NaN, 2], [10, 99.99], [10, 1.015]]) {
    assert.throws(() => rules.aviatorPayout(stake, multiplier), /Invalid/);
  }
});

test("strictly below 2x is 60% in v2, not a 60% at-or-below quota or a changed legacy result", () => {
  const boundary = Number(successesAt(200));
  assert.ok(Math.abs((Number(D) - boundary) / Number(D) - 0.6) < 1 / Number(D));
  assert.equal(rules.crashCentsFromSample(boundary), 199);
  assert.ok(rules.crashCentsFromSample(boundary - 1) > 200);
  assert.equal(rules.crashCentsFromSample(boundary, rules.AVIATOR_PREVIOUS_MODEL), 200);
  assert.ok(1 - Number(successesAt(199, rules.AVIATOR_PREVIOUS_MODEL)) / Number(D) < 0.6);
});

test("five million cryptographically sampled outcomes verify final capped probabilities and RTP with statistical bounds", () => {
  const N = 5_000_000;
  const samples = crypto.randomBytes(N * 7);
  const wins = targets.map(() => 0);
  const counts = new Uint32Array(10000);
  const sampleBins = new Uint32Array(16);
  for (let i = 0; i < N; i++) {
    const offset = i * 7;
    const sample = samples.readUIntBE(offset, 6) * 16 + (samples[offset + 6] >>> 4);
    sampleBins[Math.floor(sample / (Number(D) / 16))]++;
    const cents = rules.crashCentsFromSample(sample);
    assert.ok(cents >= 100 && cents <= 9999);
    counts[cents]++;
    for (let j = 0; j < targets.length; j++) if (cents > Math.round(targets[j] * 100)) wins[j]++;
  }
  const report = targets.map((target, i) => {
    const p = Number(successesAt(Math.round(target * 100))) / Number(D);
    const observed = wins[i] / N;
    const tolerance = 7 * Math.sqrt(p * (1 - p) / N) + 1 / N;
    assert.ok(Math.abs(observed - p) <= tolerance, `${target}x probability ${observed}, expected ${p}`);
    return { target, reachPercent: observed * 100, simulatedRtp: observed * target * 100 };
  });
  assert.ok(counts[100] > 0 && counts[101] > 0 && counts[9999] > 0);
  const below2 = counts.slice(100, 200).reduce((sum, count) => sum + count, 0) / N;
  assert.ok(Math.abs(below2 - 0.6) < 7 * Math.sqrt(0.6 * 0.4 / N), `Below 2x: ${below2}`);
  assert.equal(counts[200], 0, "The old 2.00x mass belongs below 2x in v2");
  for (const count of sampleBins) {
    assert.ok(Math.abs(count / N - 1 / 16) < 7 * Math.sqrt((1 / 16) * (15 / 16) / N), "Uniform 52-bit sample bins");
  }
  for (const [cents, probability] of [
    [100, 1 - Number((80n * D + 99n) / 100n - 1n) / Number(D)],
    [9999, Number((80n * D + 9997n) / 9998n - 1n) / Number(D)],
  ]) {
    const tolerance = 7 * Math.sqrt(probability * (1 - probability) / N) + 1 / N;
    assert.ok(Math.abs(counts[cents] / N - probability) < tolerance, `${cents / 100}x mass`);
  }
  assert.ok(counts.filter(count => count > 0).length > 8000, "Not a fixed multiplier sequence");
  console.log("Capped Aviator simulation (5,000,000 rounds):", JSON.stringify({ below2Percent: below2 * 100, targets: report }));
});

test("both games derive independent outcomes from secure seeds with reproducible commitment verification", () => {
  for (const invalid of ["constructor", "__proto__", "other"]) assert.equal(flight.isTable(invalid), false);
  for (const table of ["aviator", "aviator-x"]) {
    const first = flight.generateCrashPoint(table, 42, "a".repeat(64));
    assert.deepEqual(flight.generateCrashPoint(table, 42, "a".repeat(64)), first);
    const verified = verifyAviatorRound(table, 42, first.seed, first.hash, undefined, rules.AVIATOR_MODEL);
    assert.equal(verified.validCommitment, true);
    assert.equal(verified.crashPoint, first.crashPoint);
    assert.equal(verified.digest, first.digest);
    assert.equal(verifyAviatorRound(table, 42, first.seed, first.hash, first.crashPoint, rules.AVIATOR_MODEL).verified, true);
    const wrongCrash = first.crashPoint === 2 ? 3 : 2;
    assert.equal(verifyAviatorRound(table, 42, first.seed, first.hash, wrongCrash, rules.AVIATOR_MODEL).verified, false);
    assert.notEqual(flight.generateCrashPoint(table, 43, first.seed).digest, first.digest);
    assert.equal(verifyAviatorRound(table, 42, "b".repeat(64), first.hash, undefined, rules.AVIATOR_MODEL).validCommitment, false);
    assert.notEqual(verifyAviatorRound(table, 43, first.seed, first.hash, undefined, rules.AVIATOR_MODEL).digest,
      first.digest, "Published nonce must be used to recompute the result");
    const seeds = new Set(), values = new Set(), sampleBins = new Uint32Array(16);
    for (let i = 0; i < 10000; i++) {
      const generated = flight.generateCrashPoint(table, i);
      assert.ok(generated.crashPoint >= 1 && generated.crashPoint < 100);
      assert.equal(seeds.has(generated.seed), false);
      seeds.add(generated.seed);
      values.add(generated.crashPoint);
      sampleBins[Number.parseInt(generated.digest[0], 16)]++;
    }
    assert.ok(values.size > 500);
    for (const count of sampleBins) assert.ok(Math.abs(count / 10000 - 1 / 16) < 7 * Math.sqrt((1 / 16) * (15 / 16) / 10000));
  }
  assert.notEqual(flight.generateCrashPoint("aviator", 42, "a".repeat(64)).digest,
    flight.generateCrashPoint("aviator-x", 42, "a".repeat(64)).digest);
  assert.doesNotMatch(readFileSync("src\\lib\\aviator.ts", "utf8"), /Math\.random|0\.65|0\.35|balance.*generateCrash/);
});

test("independent verifier CLI fails for a matching seed hash with a mismatched published crash", () => {
  const generated = flight.generateCrashPoint("aviator", 42, "a".repeat(64));
  const args = ["scripts\\verify-aviator-round.mjs", "aviator", "42", generated.seed, generated.hash];
  const valid = spawnSync(process.execPath, [...args, String(generated.crashPoint), rules.AVIATOR_MODEL], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).verified, true);
  const invalid = spawnSync(process.execPath, [...args, generated.crashPoint === 2 ? "3" : "2", rules.AVIATOR_MODEL], { encoding: "utf8" });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.equal(JSON.parse(invalid.stdout).validCommitment, true);
  assert.equal(JSON.parse(invalid.stdout).validCrashPoint, false);
  assert.throws(() => verifyAviatorRound("aviator", 42, generated.seed, generated.hash, 100), /Published crash/);
});

test("settled accounting excludes non-settlement outcomes and rejects corrupt monetary records explicitly", () => {
  const excluded = ["pending", "cancelled", "refunded", "invalid"].map(outcome => ({ betAmount: 10, winAmount: 10, outcome }));
  assert.deepEqual(rules.aviatorAccounting(excluded), {
    totalBets: 0, totalPayouts: 0, settledBets: 0, pendingBets: 1, ggr: 0, actualRtp: null,
  });
  for (const bet of [
    { betAmount: -10, winAmount: 0, outcome: "lose" },
    { betAmount: 0, winAmount: 10, outcome: "win" },
    { betAmount: 10, winAmount: 10, outcome: "lose" },
    { betAmount: 10, winAmount: NaN, outcome: "win" },
    { betAmount: 10.001, winAmount: 20, outcome: "win" },
  ]) assert.throws(() => rules.aviatorAccounting([bet]), /Invalid/);
  const exact = rules.aviatorAccounting(Array.from({ length: 700 }, () => ({ betAmount: 10.01, winAmount: 20.02, outcome: "win" })));
  assert.equal(exact.totalBets, 7007);
  assert.equal(exact.totalPayouts, 14014);
  assert.equal(exact.actualRtp, 200);
  assert.equal(exact.ggr, -7007);
});

test("statistics paginate all model results without truncation and keep player scope", async () => {
  const s = createLegacyScene();
  for (let i = 0; i < 1600; i++) s.data.gameresults.push({
    _id: `stats-${String(i).padStart(5, "0")}`, gameId: "aviator", flightModel: i % 2 ? rules.AVIATOR_MODEL : rules.AVIATOR_PREVIOUS_MODEL,
    userId: i % 2 ? "alice" : "bob", betAmount: 10.01, winAmount: 20.02, outcome: "win",
  });
  s.data.gameresults.push({ _id: "other-model", gameId: "aviator", betAmount: 100, winAmount: 500, outcome: "win" });
  const all = await s.flight.flightStatistics("aviator");
  assert.equal(all.settledBets, 1600);
  assert.equal(all.totalBets, 16016);
  assert.equal(all.totalPayouts, 32032);
  assert.equal(all.ggr, -16016);
  const alice = await s.flight.flightStatistics("aviator", "alice");
  assert.equal(alice.settledBets, 800);
  assert.equal(alice.totalBets, 8008);
  assert.equal(alice.actualRtp, 200);
});

test("production commitment validation refuses changed results, seeds, nonces and next-seed commitments", () => {
  for (const table of ["aviator", "aviator-x"]) {
    const generated = flight.generateCrashPoint(table, 1, "a".repeat(64));
    const round = {
      roundNo: 1, crashPoint: generated.crashPoint,
      fairness: { version: rules.AVIATOR_MODEL, clientSeed: rules.AVIATOR_CLIENT_SEED, nonce: 1,
        serverSeed: generated.seed, serverSeedHash: generated.hash, nextServerSeed: "b".repeat(64), nextServerSeedHash: flight.flightSeedHash("b".repeat(64)) },
    };
    flight.validateFlightRound(round, table);
    assert.throws(() => flight.validateFlightRound({ ...round, crashPoint: 100 }, table), /verification failed/);
    for (const [field, value] of [
      ["serverSeed", "c".repeat(64)], ["serverSeedHash", "d".repeat(64)],
      ["clientSeed", "changed"], ["nonce", 2], ["version", "changed"], ["nextVersion", "changed"],
      ["nextServerSeed", "c".repeat(64)], ["nextServerSeedHash", "d".repeat(64)],
    ]) assert.throws(() => flight.validateFlightRound({ ...round, fairness: { ...round.fairness, [field]: value } }, table), /verification failed/);
  }
});

test("lifetime statistics select only settled model wagers under the game lock and scope player totals", async () => {
  let filters, rows = [], lock;
  const api = load("src\\lib\\aviator.ts", {
    "node:crypto": crypto, "./mongo": { dbConnect: async () => {} }, "./gameAccess": {}, "./aviatorRules": rules,
    "@/models": {
      Game: { findOneAndUpdate: () => ({ lean: async () => ({ _id: "flight-game" }) }) },
    },
    "./dailyPoolRules": { dailyPoolLock: table => `lock:${table}` },
    "./dailyPool": { allRows: async (_tx, _collection, query) => { filters = query; return rows.filter(row => row.flightModel === query.flightModel); } },
    "./multiplayer-store": { mysqlMultiplayerStore: { transact: async (room, fn) => { lock = room; return fn({}); } } },
  });
  const empty = await api.flightStatistics("aviator", "alice");
  assert.equal(empty.actualRtp, null);
  assert.equal(empty.ggr, 0);
  assert.deepEqual(filters, { gameId: "flight-game", flightModel: rules.AVIATOR_MODEL, userId: "alice" });
  assert.equal(lock, "lock:aviator");
  rows = [
    { betAmount: 1000, winAmount: 800, outcome: "win" },
    { betAmount: 900, winAmount: 900, outcome: "refunded" },
    { betAmount: 500, winAmount: 0, outcome: "cancelled" },
    { betAmount: 500, winAmount: 0, outcome: "pending" },
    { betAmount: 500, winAmount: 0, outcome: "invalid" },
  ].map(row => ({ ...row, flightModel: rules.AVIATOR_MODEL }));
  const aggregate = await api.flightStatistics("aviator");
  assert.equal(filters.userId, undefined);
  assert.equal(aggregate.actualRtp, 80);
  assert.equal(aggregate.ggr, 200);
  assert.equal(aggregate.netProfit, -200);
  assert.equal(aggregate.settledBets, 1);
  const accounting = rules.aviatorAccounting([
    { betAmount: 100, winAmount: 200, outcome: "win" },
    { betAmount: 50, winAmount: 0, outcome: "lose" },
    { betAmount: 500, winAmount: 0, outcome: "pending" },
  ]);
  assert.equal(accounting.totalBets, 150);
  assert.equal(accounting.pendingBets, 1);
  assert.equal(accounting.ggr, -50);
});

for (const table of ["aviator", "aviator-x"]) {
  function scene(crashPoint = 3) {
    const s = createLegacyScene(["alice", "bob"], { poolEnabled: true });
    const generate = s.flight.generateCrashPoint;
    s.flight.generateCrashPoint = (...args) => ({ ...generate(...args), crashPoint });
    return s;
  }
  test(`${table}: v1 accepted bets, queued commitments, refunds, proofs and recovery survive the v2 transition`, async () => {
    const s = createLegacyScene(["alice"], { realFlight: true, poolEnabled: true });
    await s.flight.getState("alice", table);
    const raw = s.data.aviatorrounds[0];
    function previousResult(nonce, accepts) {
      for (let i = 0; i < 20000; i++) {
        const seed = crypto.createHash("sha256").update(`v1-transition:${table}:${nonce}:${i}`).digest("hex");
        const generated = flight.generateCrashPoint(table, nonce, seed, rules.AVIATOR_PREVIOUS_MODEL);
        if (accepts(generated.crashPoint)) return generated;
      }
      assert.fail("Could not construct a reproducible legacy transition fixture");
    }
    const old = previousResult(raw.roundNo, crash => crash === 2);
    const oldNext = previousResult(raw.roundNo + 1, crash => crash >= 3 && crash <= 5);
    Object.assign(raw, { crashPoint: old.crashPoint, fairness: {
      version: rules.AVIATOR_PREVIOUS_MODEL, clientSeed: rules.AVIATOR_CLIENT_SEED, nonce: raw.roundNo,
      serverSeed: old.seed, serverSeedHash: old.hash, nextServerSeed: oldNext.seed, nextServerSeedHash: oldNext.hash,
    } });
    const first = await s.flight.getState("alice", table);
    assert.equal(first.config.theoreticalRtpAt199, 80);
    const refundable = await s.flight.placeBet("alice", table, 10, 1, first.round.id);
    assert.equal((await s.flight.cancelBet("alice", table, 1, first.round.id)).ok, true);
    assert.equal(s.data.multiplayerrequests.find(row => row.resultId === refundable.bet.id && row.action === "refund").flightModel,
      rules.AVIATOR_PREVIOUS_MODEL);
    const current = await s.flight.placeBet("alice", table, 100, 0, first.round.id);
    assert.equal(current.bet.flightModel, rules.AVIATOR_PREVIOUS_MODEL);
    s.at(rules.aviatorReachAt(first.round.startsAt, 1.5, first.config.growth));
    const manual = await s.flight.cashOut("alice", table, 0, first.round.id);
    assert.equal(manual.win, 150);
    const queued = await s.flight.placeBet("alice", table, 100, 1, first.round.id + 1, false, 1.99);
    assert.equal(queued.bet.flightModel, rules.AVIATOR_PREVIOUS_MODEL);
    assert.equal(queued.serverSeedHash, first.fairness.nextServerSeedHash);
    s.at(rules.aviatorReachAt(first.round.startsAt, 2, first.config.growth) + 1);
    const crashed = await s.flight.getState("alice", table);
    assert.equal(crashed.round.crashPoint, 2, "An accepted v1 crash must not be moved to 1.99x");
    assert.equal(verifyAviatorRound(table, raw.roundNo, old.seed, old.hash, 2).verified, true,
      "The existing verifier invocation must still verify old rounds");
    s.at(crashed.round.endedAt + first.config.pauseMs);
    const next = await s.flight.getState("alice", table);
    assert.equal(next.fairness.version, rules.AVIATOR_PREVIOUS_MODEL);
    assert.equal(next.fairness.serverSeedHash, oldNext.hash);
    assert.equal(next.fairness.nextVersion, rules.AVIATOR_MODEL);
    s.at(next.round.startsAt + 1);
    const future = await s.flight.placeBet("alice", table, 100, 0, next.round.id + 1, false, 1.99);
    assert.equal(future.bet.flightModel, rules.AVIATOR_MODEL);
    s.at(rules.aviatorReachAt(next.round.startsAt, oldNext.crashPoint, next.config.growth) + 1);
    await s.poolService.processDailyPool(table);
    assert.equal(s.data.gameresults.find(row => row._id === queued.bet.id).winAmount, 199);
    assert.equal(s.users.get("alice").balance, 1049);
    assert.equal(s.data.dailypoolentries.length, 0, "Neither model re-enters legacy allocation");
    const stats = await s.flight.flightStatistics(table, "alice");
    assert.equal(stats.totalBets, 200);
    assert.equal(stats.totalPayouts, 349);
    assert.equal(stats.ggr, -149);
    const second = s.data.aviatorrounds.at(-1);
    s.at(+second.endedAt + next.config.pauseMs);
    const upgraded = await s.flight.getState("alice", table);
    assert.equal(upgraded.fairness.version, rules.AVIATOR_MODEL);
    assert.equal(upgraded.fairness.serverSeedHash, next.fairness.nextServerSeedHash);
    assert.equal(upgraded.config.theoreticalRtpAt199, 79.6);
    assert.equal(upgraded.myBets[0].flightModel, rules.AVIATOR_MODEL);
    assert.equal((await s.flight.cancelBet("alice", table, 0, upgraded.round.id)).ok, true);
    assert.equal(s.users.get("alice").balance, 1149);
    assert.equal(s.data.multiplayerrequests.find(row => row.resultId === future.bet.id && row.action === "refund").flightModel,
      rules.AVIATOR_MODEL);
    assert.ok(s.data.multiplayerrequests.filter(row => row.action === "payout").every(row => row.flightModel === rules.AVIATOR_PREVIOUS_MODEL));
  });
  test(`${table}: exact gross/manual payouts, player P&L, GGR and no winner-triggered crash or hold`, async () => {
    const s = scene();
    const state = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0);
    await s.flight.placeBet("alice", table, 50, 1);
    s.at(state.round.startsAt + Math.log(2.001) / s.flight.TABLES[table].growth * 1000);
    const paid = await s.flight.cashOut("alice", table, 0, state.round.id);
    assert.equal(paid.win, 200);
    assert.equal(paid.netProfit, 100);
    assert.equal(s.users.get("alice").balance, 1050);
    assert.equal(s.data.aviatorrounds[0].crashPoint, 3);
    assert.equal(s.data.aviatorrounds[0].status, "running");
    assert.equal(s.data.dailypoolentries.length, 0);
    assert.equal(s.data.winholds.length, 0);
    const duplicate = await s.flight.cashOut("alice", table, 0);
    assert.ok(duplicate.error);
    s.at(state.round.startsAt + Math.log(3) / s.flight.TABLES[table].growth * 1000 + 2);
    const after = await s.flight.getState("alice", table);
    assert.equal(after.myBets.find(bet => bet.slot === 1).netProfit, -50);
    assert.deepEqual(after.accounting, { totalBets: 150, totalPayouts: 200, settledBets: 2, pendingBets: 0, ggr: -50, actualRtp: 200 / 150 * 100 });
  });
  test(`${table}: saved automatic cashout pays its exact target once even when next read is after the crash`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    const accepted = await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    assert.equal(accepted.serverSeedHash, first.fairness.serverSeedHash);
    s.at(first.round.startsAt + Math.log(3) / s.flight.TABLES[table].growth * 1000 + 2);
    const [a, b] = await Promise.all([s.flight.getState("alice", table), s.flight.getState("alice", table)]);
    assert.equal(s.users.get("alice").balance, 1100);
    assert.equal(a.myBets[0].win, 200);
    assert.equal(b.myBets[0].win, 200);
    assert.equal(a.myBets[0].autoCashout, 2);
    assert.equal(s.changes.filter(change => change.delta > 0).length, 1);
    assert.equal(s.data.winholds.length, 0);
  });
  test(`${table}: equal-crash auto targets and late manual requests lose; invalid limits never debit`, async () => {
    const s = scene(2);
    const first = await s.flight.getState("alice", table);
    for (const target of [100, 99.99, 1, 1.015, NaN, Infinity]) {
      assert.ok((await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, target)).error);
    }
    assert.equal(s.users.get("alice").balance, 1000);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    s.at(first.round.startsAt + Math.log(2) / s.flight.TABLES[table].growth * 1000 + 2);
    assert.ok((await s.flight.cashOut("alice", table, 0)).error);
    const state = await s.flight.getState("alice", table);
    assert.equal(state.myBets[0].win, 0);
    assert.equal(state.myBets[0].outcome, "lose");
    assert.equal(s.users.get("alice").balance, 900);
  });
  test(`${table}: auto settlement rollback preserves pending ledger and wallet on SQL failure`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    s.at(first.round.startsAt + Math.log(2.01) / s.flight.TABLES[table].growth * 1000);
    s.failNext("users");
    await assert.rejects(s.flight.getState("alice", table), /Injected/);
    assert.equal(s.data.gameresults[0].outcome, "pending");
    assert.equal(s.users.get("alice").balance, 900);
    await s.flight.getState("alice", table);
    assert.equal(s.users.get("alice").balance, 1100);
  });
  test(`${table}: scheduler recovers disconnected new-model players without daily-pool membership`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    assert.equal(s.data.dailypoolentries.length, 0);
    s.at(first.round.startsAt + Math.log(3) / s.flight.TABLES[table].growth * 1000 + 2);
    await s.poolService.processDailyPool(table);
    assert.equal(s.data.gameresults[0].outcome, "win");
    assert.equal(s.data.gameresults[0].winAmount, 200);
    assert.equal(s.users.get("alice").balance, 1100);
    await s.poolService.processDailyPool(table);
    assert.equal(s.users.get("alice").balance, 1100);
  });
  test(`${table}: automatic/manual concurrency and slow wallet reads cannot cause duplicate or late manual payment`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    s.at(first.round.startsAt + Math.log(2.1) / s.flight.TABLES[table].growth * 1000);
    await Promise.all([s.flight.getState("alice", table), s.flight.cashOut("alice", table, 0)]);
    assert.equal(s.data.gameresults[0].winAmount, 200);
    assert.equal(s.users.get("alice").balance, 1100);
    const late = scene();
    const state = await late.flight.getState("alice", table);
    await late.flight.placeBet("alice", table, 100);
    late.at(state.round.startsAt + Math.log(3) / late.flight.TABLES[table].growth * 1000 - 20);
    late.setReadDelay(50);
    assert.ok((await late.flight.cashOut("alice", table, 0)).error);
    assert.equal(late.users.get("alice").balance, 900);
  });
  test(`${table}: a slow manual request crossing its saved auto target pays the target, not a higher multiplier`, async () => {
    const s = scene(2.01);
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    const targetAt = rules.aviatorReachAt(first.round.startsAt, 2, first.config.growth);
    s.at(targetAt - 10);
    s.setReadDelay(250);
    const paid = await s.flight.cashOut("alice", table, 0, first.round.id);
    assert.equal(paid.ok, true);
    assert.equal(paid.multiplier, 2);
    assert.equal(paid.win, 200);
    assert.equal(s.users.get("alice").balance, 1100);
    assert.equal(s.data.multiplayerrequests.filter(row => row.action === "payout").length, 1);
  });
  test(`${table}: crash boundary, automatic tie and manual requests agree at authoritative integer milliseconds`, async () => {
    const s = scene(2);
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
    const crashAt = rules.aviatorReachAt(first.round.startsAt, 2, first.config.growth);
    s.at(crashAt);
    assert.ok((await s.flight.cashOut("alice", table, 0, first.round.id)).error);
    const result = await s.flight.getState("alice", table);
    assert.equal(result.round.status, "crashed");
    assert.equal(result.round.endedAt, crashAt);
    assert.equal(result.myBets[0].outcome, "lose");
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.multiplayerrequests.filter(row => row.action === "payout").length, 0);
  });
  test(`${table}: wallet stake, payout and refund receipts survive cancellation and commit atomically`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    const cancelled = await s.flight.placeBet("alice", table, 100);
    await s.flight.cancelBet("alice", table, 0);
    assert.equal(s.data.gameresults.length, 0);
    const receipts = s.data.multiplayerrequests.filter(row => row.resultId === cancelled.bet.id);
    assert.deepEqual(receipts.map(row => [row.action, row.deltaCents, row.balanceBeforeCents, row.balanceAfterCents]),
      [["stake", -10000, 100000, 90000], ["refund", 10000, 90000, 100000]]);
    await s.flight.placeBet("alice", table, 100);
    s.at(rules.aviatorReachAt(first.round.startsAt, 2, first.config.growth));
    s.failNext("multiplayerrequests");
    await assert.rejects(s.flight.cashOut("alice", table, 0), /Injected/);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.gameresults[0].outcome, "pending");
    await s.flight.cashOut("alice", table, 0);
    assert.equal(s.users.get("alice").balance, 1100);
    const paid = s.data.multiplayerrequests.find(row => row.action === "payout");
    assert.equal(paid.deltaCents, 20000);
    assert.equal(paid.cashoutMultiplier, 2);
    assert.equal(paid.serverSeedHash, first.fairness.serverSeedHash);
    assert.ok((await s.flight.cashOut("alice", table, 0)).error);
    assert.equal(s.data.multiplayerrequests.filter(row => row.action === "payout").length, 1);
  });
  test(`${table}: tampering with a committed production round stops settlement without altering any wallet`, async () => {
    const s = createLegacyScene(["alice", "bob"], { realFlight: true });
    const first = await s.flight.getState("alice", table);
    await s.flight.placeBet("alice", table, 100);
    const round = s.data.aviatorrounds[0];
    round.crashPoint = round.crashPoint === 2 ? 3 : 2;
    s.at(first.round.startsAt + 100);
    await assert.rejects(s.flight.getState("alice", table), /verification failed/);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.gameresults[0].outcome, "pending");
    assert.equal(s.data.multiplayerrequests.filter(row => row.action === "payout").length, 0);
  });
  test(`${table}: changed wager commitments or automatic targets fail closed rather than paying a different contract`, async () => {
    for (const change of [{ serverSeedHash: "0".repeat(64) }, { autoCashout: 100 }]) {
      const s = scene();
      const first = await s.flight.getState("alice", table);
      await s.flight.placeBet("alice", table, 100, 0, first.round.id, false, 2);
      Object.assign(s.data.gameresults[0], change);
      s.at(first.round.startsAt + 100);
      await assert.rejects(s.flight.getState("alice", table), /commitment or automatic target/);
      assert.equal(s.users.get("alice").balance, 900);
      assert.equal(s.data.gameresults[0].outcome, "pending");
    }
  });
  test(`${table}: concurrent reservations and refunds leave an exact wallet and exclude refunded stakes from GGR`, async () => {
    const s = scene();
    const accepted = await Promise.all([s.flight.placeBet("alice", table, 100, 0), s.flight.placeBet("alice", table, 200, 1)]);
    assert.ok(accepted.every(reply => reply.ok));
    assert.equal(s.users.get("alice").balance, 700);
    const replies = await Promise.all([
      s.flight.cancelBet("alice", table, 0), s.flight.cancelBet("alice", table, 0), s.flight.cancelBet("alice", table, 1),
    ]);
    assert.equal(replies.filter(reply => reply.ok).length, 2);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.multiplayerrequests.filter(row => row.action === "refund").length, 2);
    const stats = await s.flight.flightStatistics(table, "alice");
    assert.equal(stats.totalBets, 0);
    assert.equal(stats.totalPayouts, 0);
    assert.equal(stats.actualRtp, null);
    assert.equal(stats.ggr, 0);
  });
  test(`${table}: legacy rounds drain without accepting a new-model wager or rewriting their crash`, async () => {
    const s = scene(150);
    await s.flight.getState("alice", table);
    const old = s.data.aviatorrounds[0];
    delete old.fairness;
    assert.ok((await s.flight.placeBet("alice", table, 100)).error);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(old.crashPoint, 150);
    s.flight.generateCrashPoint = flight.generateCrashPoint;
    s.at(+old.startsAt + Math.log(150) / s.flight.TABLES[table].growth * 1000 + 3502);
    const next = await s.flight.getState("alice", table);
    assert.equal(next.fairness.version, rules.AVIATOR_MODEL);
    assert.ok((await s.flight.placeBet("alice", table, 100)).ok);
    assert.ok(s.data.aviatorrounds.at(-1).crashPoint < 100);
  });
  test(`${table}: commitments precede wagers, no seeds leak live, next commitment is reused and crashed proofs verify`, async () => {
    const s = createLegacyScene(["alice", "bob"], { realFlight: true });
    const first = await s.flight.getState("alice", table);
    assert.equal(first.fairness.serverSeed, undefined);
    const raw = s.data.aviatorrounds[0];
    assert.equal(JSON.stringify(first).includes(raw.fairness.serverSeed), false);
    assert.equal(JSON.stringify(first).includes(raw.fairness.nextServerSeed), false);
    s.at(first.round.startsAt + Math.log(raw.crashPoint) / s.flight.TABLES[table].growth * 1000 + 2);
    const crashed = await s.flight.getState("alice", table);
    assert.equal(crashed.round.status, "crashed");
    const verified = verifyAviatorRound(table, crashed.fairness.nonce, crashed.fairness.serverSeed, first.fairness.serverSeedHash, crashed.round.crashPoint, crashed.fairness.version);
    assert.equal(verified.validCommitment, true);
    assert.equal(verified.crashPoint, crashed.round.crashPoint);
    const queued = await s.flight.placeBet("alice", table, 100, 0, first.round.id + 1, false, 2);
    assert.equal(queued.ok, true);
    assert.equal(queued.serverSeedHash, first.fairness.nextServerSeedHash);
    s.at(crashed.round.endedAt + 3500);
    const next = await s.flight.getState("alice", table);
    assert.equal(next.round.id, first.round.id + 1);
    assert.equal(next.fairness.serverSeedHash, first.fairness.nextServerSeedHash);
    assert.equal(next.myBets[0].autoCashout, 2);
  });
}
