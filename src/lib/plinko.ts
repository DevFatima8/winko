import { randomInt } from "node:crypto";
import { dbConnect } from "./mongo";
import { Game, GameResult, PlinkoBet, User, oid, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { holdWinShare } from "./winHold";
import { dailyPoolEnabled } from "./dailyPoolConfig";
import { acceptDedicatedInstant } from "./dailyPoolDedicated";
import { nextPlayerWin } from "./playerWinCycle";


export const MIN_BET = 10;
export const MAX_BET = Number.MAX_SAFE_INTEGER;
export const MAX_WIN = Number.MAX_SAFE_INTEGER;
export const ROWS = [12] as const;
export type Risk = "low" | "medium" | "high";
export const isRisk = (r: string): r is Risk => r === "low" || r === "medium" || r === "high";

const PLINKO_TABLE: Record<number, number[]> = {
  12: [1.8, 1.5, 1.3, 1.1, 1, 0.7, 0, 0.7, 1, 1.1, 1.3, 1.5, 1.8],
};
export const TABLES: Record<Risk, Record<number, number[]>> = { low: PLINKO_TABLE, medium: PLINKO_TABLE, high: PLINKO_TABLE };
export const PLINKO_PRIZES = [...new Set(PLINKO_TABLE[12])].filter(multiplier => multiplier > 0).map(String);
// Preserve in-progress eligibility and repeat-player protection across paytable updates.
const PLINKO_WIN_CYCLE = "plinko:prizes-v2";

export function plinkoBucket(table: number[], prize: string | null) {
  const target = prize === null ? 0 : Number(prize);
  const options = table.map((m, i) => ({ m, i })).filter(x => x.m === target).map(x => x.i);
  if (!options.length) throw new Error("Plinko prize has no matching bucket.");
  return options[randomInt(options.length)];
}

export function plinkoPath(rows: number, bucket: number) {
  const path: number[] = [];
  let rights = bucket;
  for (let i = 0; i < rows; i++) {
    const dir = Math.random() < rights / (rows - i) ? 1 : 0;
    if (dir) rights--;
    path.push(dir);
  }
  return path;
}

export function multipliersFor(risk: Risk, rows: number) {
  return TABLES[risk][rows].map((multiplier) => Math.min(MAX_MULTIPLIER, multiplier));
}

/** Binomial probability of landing in bucket k for n rows. */
export function bucketProb(rows: number, k: number) {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (rows - k + i)) / i;
  return c / Math.pow(2, rows);
}

let cachedGameId: ObjectId | null = null;
async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate(
    { slug: "plinko" },
    { $setOnInsert: { name: "Plinko", slug: "plinko", icon: "🔴", category: "original", description: "Plinko: 12 rows, 13 symmetric buckets, one center 0x and payable multipliers from 0.7x to 1.8x.", isActive: true } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  cachedGameId = g!._id;
  return cachedGameId!;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getState(userId: string | null) {
  await dbConnect();
  const [me, recent] = userId
    ? await Promise.all([User.findById(userId, "balance").lean(), PlinkoBet.find({ userId: oid(userId) }).sort({ createdAt: -1 }).limit(30).lean()])
    : [null, []];
  return {
    balance: me?.balance ?? 0,
    limits: { min: MIN_BET, max: MAX_BET },
    rows: ROWS,
    tables: TABLES,
    dailyPoolEnabled: dailyPoolEnabled(),
    recent: recent.map((b) => ({ id: String(b._id), bet: b.betAmount, risk: b.risk, rows: b.rows, multiplier: b.multiplier, payout: b.payout, bucket: b.bucket, ...poolFields(b) })),
  };
}

const poolFields = (record: object) => {
  const r = record as { poolPending?: boolean; poolClaim?: number };
  return { poolPending: r.poolPending, poolClaim: r.poolClaim };
};

export async function drop(userId: string, amount: number, risk: string, rows: number, requestId = "") {
  await dbConnect();
  if (!isRisk(risk)) return { error: "Risk select karein." };
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "plinko");
  if (denied) return { error: denied };
  const uid = oid(userId);

  const table = rows === 12 ? multipliersFor(risk, rows) : null;
  const rowsError = { error: "Plinko ke naye board mein 12 rows hain." };
  const chooseBucket = (multipliers: number[], won: boolean) => plinkoBucket(multipliers, won ? PLINKO_PRIZES[randomInt(PLINKO_PRIZES.length)] : null);

  if (dailyPoolEnabled()) return acceptDedicatedInstant("plinko", userId, amount, requestId, JSON.stringify([amount, risk, rows]), async tx => {
    if (!table) return rowsError;
    const bucket = chooseBucket(table, await nextPlayerWin(tx, PLINKO_WIN_CYCLE, userId));
    const path = plinkoPath(rows, bucket);
    const multiplier = table[bucket];
    return {
      claim: Math.round(amount * multiplier * 100) / 100,
      data: `${risk} · ${rows} rows · bucket ${bucket + 1}/${rows + 1} → ${multiplier}x`,
      response: { path, bucket, multiplier },
      plinko: { risk, rows, path, bucket, multiplier },
    };
  });
  if (!table) return rowsError;
  const bucket = chooseBucket(table, randomInt(10) === 0);
  const path = plinkoPath(rows, bucket);
  const multiplier = table[bucket];
  const payout = payoutAfterHouseShare(amount * Math.min(MAX_MULTIPLIER, multiplier));

  const upd = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (!upd.modifiedCount) return { error: "Insufficient balance. Pehle deposit karein." };
  if (payout > 0) { await User.updateOne({ _id: uid }, { $inc: { balance: payout } }); await holdWinShare(userId, amount * Math.min(MAX_MULTIPLIER, multiplier)); }
  const bet = await PlinkoBet.create({ userId: uid, betAmount: amount, risk, rows, path, bucket, multiplier, payout });
  const gid = await gameId();
  await GameResult.create({
    gameId: gid, userId: uid, betAmount: amount, winAmount: payout,
    outcome: payout > 0 ? "win" : "lose",
    resultData: `${risk} · ${rows} rows · bucket ${bucket + 1}/${rows + 1} → ${multiplier}x`,
  });
  const me = await User.findById(uid, "balance").lean();
  return { ok: true, id: String(bet._id), path, bucket, multiplier, payout, balance: me?.balance ?? 0 };
}
