import { randomInt } from "node:crypto";
import { dbConnect } from "./mongo";
import { PlinkoBet, User, oid } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { MAX_MULTIPLIER } from "./outcomes";
import { acceptDedicatedInstant } from "./dailyPoolDedicated";
import { MAX_GAME_BET } from "./gameBetLimits";


export const MIN_BET = 10;
export const MAX_BET = MAX_GAME_BET;
export const MAX_WIN = Number.MAX_SAFE_INTEGER;
export const ROWS = [12] as const;
export type Risk = "low" | "medium" | "high";
export const isRisk = (r: string): r is Risk => r === "low" || r === "medium" || r === "high";

const PLINKO_TABLE: Record<number, number[]> = {
  12: [1.8, 1.5, 1.3, 1.1, 1, 0.7, 0, 0.7, 1, 1.1, 1.3, 1.5, 1.8],
};
export const TABLES: Record<Risk, Record<number, number[]>> = { low: PLINKO_TABLE, medium: PLINKO_TABLE, high: PLINKO_TABLE };
export const PLINKO_PRIZES = [...new Set(PLINKO_TABLE[12])].filter(multiplier => multiplier > 0).map(String);
export function plinkoPayout(amount: number, multiplier: number) {
  const grossCents = Math.round(amount * multiplier * 100);
  return Math.floor(grossCents * 98 / 100) / 100;
}

export function plinkoPrize(amount: number) {
  const payoutSum = PLINKO_PRIZES.reduce((sum, prize) => sum + Math.round(plinkoPayout(amount, Number(prize)) * 100), 0);
  // Equal positive-prize probabilities; calibrate against paisa-rounded net payouts.
  const payableSamples = amount * 80 * PLINKO_PRIZES.length;
  if (randomInt(payoutSum) >= payableSamples) return null;
  return PLINKO_PRIZES[randomInt(PLINKO_PRIZES.length)];
}

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
    const dir = randomInt(rows - i) < rights ? 1 : 0;
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
    dailyPoolEnabled: false,
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
  const exceedsLimit = amount > MAX_BET;
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "plinko");
  if (denied) return { error: denied };
  const table = rows === 12 ? multipliersFor(risk, rows) : null;
  const rowsError = { error: "Plinko ke naye board mein 12 rows hain." };
  return acceptDedicatedInstant("plinko", userId, amount, requestId, JSON.stringify([amount, risk, rows]), async () => {
    if (exceedsLimit) return { error: "Maximum bet per player per round is Rs. 100,000." };
    if (!table) return rowsError;
    const bucket = plinkoBucket(table, plinkoPrize(amount));
    const path = plinkoPath(rows, bucket);
    const multiplier = table[bucket];
    return {
      claim: Math.round(amount * multiplier * 100) / 100,
      payout: plinkoPayout(amount, multiplier),
      data: `${risk} · ${rows} rows · bucket ${bucket + 1}/${rows + 1} → ${multiplier}x`,
      response: { path, bucket, multiplier },
      plinko: { risk, rows, path, bucket, multiplier },
    };
  });
}
