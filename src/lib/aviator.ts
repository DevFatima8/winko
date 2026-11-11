import { createHash, createHmac, randomBytes } from "node:crypto";
import { dbConnect } from "./mongo";
import { Game, type AviatorRoundDoc, type GameResultDoc, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { AVIATOR_CLIENT_SEED, AVIATOR_MAX_CASHOUT, AVIATOR_MAX_CRASH, AVIATOR_MODEL, AVIATOR_MODELS, AVIATOR_RTP, aviatorAccounting, aviatorPayout, crashCentsFromSample, isAviatorModel, validAutoCashout, type AviatorModel } from "./aviatorRules";
import { mysqlMultiplayerStore } from "./multiplayer-store";
import { dailyPoolLock } from "./dailyPoolRules";
import { allRows } from "./dailyPool";

export const newFlightSeed = () => randomBytes(32).toString("hex");
export const flightSeedHash = (seed: string) => createHash("sha256").update(seed, "utf8").digest("hex");

export const TABLES = {
  aviator: { name: "Aviator", waitMs: 10000, pauseMs: 3500, growth: 0.06, houseEdge: 1 - AVIATOR_RTP, maxMult: AVIATOR_MAX_CRASH, maxCashout: AVIATOR_MAX_CASHOUT, slots: 2, minBet: 10, maxBet: Number.MAX_SAFE_INTEGER },
  "aviator-x": { name: "Aviator X", waitMs: 10000, pauseMs: 3500, growth: 0.075, houseEdge: 1 - AVIATOR_RTP, maxMult: AVIATOR_MAX_CRASH, maxCashout: AVIATOR_MAX_CASHOUT, slots: 3, minBet: 10, maxBet: Number.MAX_SAFE_INTEGER },
} as const;
export type Table = keyof typeof TABLES;
export const isTable = (t: string): t is Table => Object.prototype.hasOwnProperty.call(TABLES, t);

export function multiplierAt(table: Table, startsAt: Date, now: Date = new Date(), maxMult: number = TABLES[table].maxMult) {
  const t = Math.max(0, (now.getTime() - startsAt.getTime()) / 1000);
  return Math.min(maxMult, Math.floor(Math.exp(TABLES[table].growth * t) * 100) / 100);
}

export function generateCrashPoint(table: Table, nonce = 0, seed = newFlightSeed(), model: AviatorModel = AVIATOR_MODEL) {
  if (!isTable(table) || !Number.isSafeInteger(nonce) || nonce < 0 || !/^[a-f0-9]{64}$/.test(seed) || !isAviatorModel(model)) {
    throw new Error("Invalid Aviator fairness inputs.");
  }
  const digest = createHmac("sha256", seed)
    .update(`${model}:${table}:${AVIATOR_CLIENT_SEED}:${nonce}`, "utf8").digest("hex");
  const sample = Number.parseInt(digest.slice(0, 13), 16);
  return { crashPoint: crashCentsFromSample(sample, model) / 100, seed, hash: flightSeedHash(seed), digest };
}

export function validateFlightRound(round: AviatorRoundDoc, table: Table) {
  const proof = round.fairness;
  if (!proof) return;
  if (!isAviatorModel(proof.version) || proof.nextVersion !== undefined && !isAviatorModel(proof.nextVersion)) {
    throw new Error("Aviator round commitment verification failed.");
  }
  const expected = generateCrashPoint(table, round.roundNo, proof.serverSeed, proof.version);
  if (proof.clientSeed !== AVIATOR_CLIENT_SEED ||
      proof.nonce !== round.roundNo || proof.serverSeedHash !== expected.hash ||
      round.crashPoint !== expected.crashPoint || !/^[a-f0-9]{64}$/.test(proof.nextServerSeed) ||
      flightSeedHash(proof.nextServerSeed) !== proof.nextServerSeedHash) {
    throw new Error("Aviator round commitment verification failed.");
  }
}

const gameIds: Partial<Record<Table, ObjectId>> = {};
export async function getGameId(table: Table) {
  if (gameIds[table]) return gameIds[table]!;
  await dbConnect();
  const gme = await Game.findOneAndUpdate(
    { slug: table },
    { $setOnInsert: { name: TABLES[table].name, slug: table, icon: table === "aviator" ? "✈️" : "🚀", category: "original", description: table === "aviator" ? "Plane udne se pehle cash out karein aur multiplier jeetein!" : "Aviator ka X edition — 3 bets, neon sky, crash below 100x.", isActive: true } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  gameIds[table] = gme!._id;
  return gameIds[table]!;
}

export async function getState(userId: string | null, table: Table) {
  return (await import("./sharedLegacyTables")).sharedFlightState(userId, table);
}

export async function placeBet(userId: string, table: Table, amount: number, slot = 0, expectedRound?: number, queueIfClosed = false, autoCashout?: number) {
  const cfg = TABLES[table];
  if (!Number.isFinite(amount) || amount < cfg.minBet) return { error: `Minimum bet Rs. ${cfg.minBet} hai.` };
  if (!Number.isInteger(slot) || slot < 0 || slot >= cfg.slots) return { error: "Invalid bet panel." };
  amount = table === "aviator" ? Math.round(amount * 100) / 100 : Math.floor(amount);
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount > Number.MAX_SAFE_INTEGER / 100 / AVIATOR_MAX_CASHOUT) return { error: "Bet exceeds safe wallet precision." };
  if (autoCashout !== undefined && !validAutoCashout(autoCashout)) return { error: "Auto cashout must be 1.01x to 99.98x, with at most two decimal places." };
  if (expectedRound !== undefined && (!Number.isSafeInteger(expectedRound) || expectedRound < 1)) return { error: "Invalid round." };
  aviatorPayout(amount, AVIATOR_MAX_CASHOUT);
  const denied = await checkGameAccess(userId, table);
  if (denied) return { error: denied };
  return (await import("./sharedLegacyTables")).sharedFlightBet(userId, amount, slot, expectedRound, table, queueIfClosed, autoCashout);
}

export async function cancelBet(userId: string, table: Table, slot = 0, expectedRound?: number) {
  return (await import("./sharedLegacyTables")).sharedFlightCancel(userId, slot, expectedRound, table);
}

export async function cashOut(userId: string, table: Table, slot = 0, expectedRound?: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= TABLES[table].slots ||
      expectedRound !== undefined && (!Number.isSafeInteger(expectedRound) || expectedRound < 1)) return { error: "Invalid cashout request." };
  return (await import("./sharedLegacyTables")).sharedFlightCashout(userId, slot, expectedRound, table);
}

export async function flightStatistics(table: Table, userId?: string) {
  const gid = await getGameId(table);
  return mysqlMultiplayerStore.transact(dailyPoolLock(table), async tx => {
    const bets: GameResultDoc[] = [];
    for (const model of AVIATOR_MODELS) {
      bets.push(...await allRows<GameResultDoc>(tx, "gameresults", { gameId: gid, flightModel: model, ...(userId ? { userId } : {}) }));
    }
    const { pendingBets: _pending, ...totals } = aviatorAccounting(bets);
    void _pending;
    return { model: AVIATOR_MODEL, modelsIncluded: AVIATOR_MODELS, theoreticalRtp: 80, theoreticalRtpAt199: 79.6, ...totals, netProfit: -totals.ggr };
  });
}
