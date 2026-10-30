import { dbConnect } from "./mongo";
import { ChickenDash, Game, GameResult, User, oid, type ObjectId, type ChickenDashDoc } from "@/models";
import type { Doc } from "./localdb";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { spreadCrashLane } from "./crashLane";
import { holdWinShare } from "./winHold";


export const MIN_BET = 10;
export const MAX_BET = Number.MAX_SAFE_INTEGER;
export const MAX_WIN = Number.MAX_SAFE_INTEGER;
export const RTP = 0.9685; // official Chicken Dash RTP 96.85%

// Official level specs: tiles, first-step multiplier, max multiplier
export const LEVELS = {
  easy: { label: "Easy", steps: 28, first: 1.01, max: 14.54, bag: [0.1, 0.6] as const },
  normal: { label: "Normal", steps: 24, first: 1.05, max: 43.15, bag: [0.3, 2] as const },
  hard: { label: "Hard", steps: 20, first: 1.21, max: 100, bag: [1, 8] as const },
} as const;
export type Level = keyof typeof LEVELS;
export const isLevel = (l: string): l is Level => l in LEVELS;

export const DASH_P = 0.09; // chance of a dash boost on a step (only through safe tiles)
const BAG_P = 0.22; // chance a bonus bag van shows up in a round

/**
 * Per-step survival probability decreases linearly from p1 (= RTP/first) to pEnd,
 * where pEnd is solved so that the final multiplier equals the official max.
 * Multiplier at step k = RTP / P(survive k steps)  → fair for every cash-out strategy.
 */
function buildLevel(level: Level) {
  const { steps, first, max } = LEVELS[level];
  const p1 = RTP / first;
  const target = first / max; // product of p_2..p_n
  const productFor = (pEnd: number) => {
    let prod = 1;
    for (let k = 2; k <= steps; k++) prod *= p1 + ((pEnd - p1) * (k - 1)) / (steps - 1);
    return prod;
  };
  let lo = 0.01, hi = p1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (productFor(mid) > target) hi = mid; else lo = mid;
  }
  const pEnd = (lo + hi) / 2;
  const surv: number[] = [1];
  const ladder: number[] = [];
  for (let k = 1; k <= steps; k++) {
    const pk = k === 1 ? p1 : p1 + ((pEnd - p1) * (k - 1)) / (steps - 1);
    surv[k] = surv[k - 1] * pk;
    ladder.push(Math.round((RTP / surv[k]) * 100) / 100);
  }
  ladder[0] = first;
  ladder[steps - 1] = Math.min(MAX_MULTIPLIER, max);
  return { ladder, surv };
}
const BUILT = Object.fromEntries((Object.keys(LEVELS) as Level[]).map((l) => [l, buildLevel(l)])) as Record<Level, { ladder: number[]; surv: number[] }>;

export const ladderFor = (l: Level) => BUILT[l].ladder;
export const survivalFor = (l: Level) => BUILT[l].surv;
export const multiplierAt = (l: Level, k: number) => (k <= 0 ? 1 : Math.min(MAX_MULTIPLIER, BUILT[l].ladder[Math.min(k, LEVELS[l].steps) - 1]));

export function rollCrashLane(l: Level, bet: number) {
  const steps = LEVELS[l].steps;
  const firstProfitIndex = ladderFor(l).findIndex((m) => payoutAfterHouseShare(bet * m) > bet);
  return spreadCrashLane(survivalFor(l), firstProfitIndex < 0 ? steps : firstProfitIndex + 1);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const r2 = (n: number) => Math.round(n * 100) / 100;

let cachedGameId: ObjectId | null = null;
export async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate(
    { slug: "chicken-dash" },
    { $setOnInsert: { name: "Chicken Dash", slug: "chicken-dash", icon: "🐤", category: "original", description: "Busy highway cross karein — Dash boost aur Bonus Bag ke saath 100x tak!", isActive: true } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  cachedGameId = g!._id;
  return cachedGameId!;
}

type GameLike = {
  poolVersion?: string; poolPending?: boolean; poolClaim?: number;
  _id: ObjectId; level: string; betAmount: number; lanes: number; position: number; status: string; winAmount: number;
  crashLane: number; bagLane: number; bagMult: number; bagCollected: boolean; dashes: { from?: number | null; to?: number | null }[];
};

export function pub(g: GameLike) {
  const level = g.level as Level;
  const m = multiplierAt(level, g.position);
  const bonus = g.bagCollected ? g.bagMult : 0;
  return {
    id: String(g._id),
    level,
    bet: g.betAmount,
    lanes: g.lanes,
    position: g.position,
    status: g.status as "active" | "cashed" | "dead",
    win: g.winAmount,
    poolVersion: g.poolVersion, poolPending: g.poolPending, poolClaim: g.poolClaim,
    multiplier: m,
    nextMultiplier: g.position < g.lanes ? multiplierAt(level, g.position + 1) : null,
    potential: r2(g.betAmount * Math.min(MAX_MULTIPLIER, m + bonus)),
    bagLane: g.bagLane || null,
    bagMult: g.bagLane ? g.bagMult : 0,
    bagCollected: g.bagCollected,
    crashLane: g.status === "active" ? null : g.crashLane,
    dashes: (g.dashes ?? []).map((d) => ({ from: d.from ?? 0, to: d.to ?? 0 })),
  };
}

const winFor = (bet: number, m: number, bonus: number) => payoutAfterHouseShare(bet * Math.min(MAX_MULTIPLIER, m + bonus));

export function bagFor(level: Level) {
  const spec = LEVELS[level];
  return Math.random() < BAG_P
    ? { bagLane: 2 + Math.floor(Math.random() * Math.min(7, spec.steps - 2)), bagMult: r2(rnd(spec.bag[0], spec.bag[1])) }
    : { bagLane: 0, bagMult: 0 };
}

export async function getState(userId: string | null) {
  await dbConnect();
  const [active, me, recent] = userId
    ? await Promise.all([
      ChickenDash.findOne({ userId: oid(userId), status: "active", betAmount: { $gt: 0 } }).lean(),
      User.findById(userId, "balance").lean(),
      ChickenDash.find({ userId: oid(userId), status: { $ne: "active" } }).sort({ createdAt: -1 }).limit(12).lean(),
    ])
    : [null, null, []];
  return {
    game: active ? pub(active) : null,
    balance: me?.balance ?? 0,
    ladders: Object.fromEntries((Object.keys(LEVELS) as Level[]).map((l) => [l, ladderFor(l)])),
    levels: Object.fromEntries((Object.keys(LEVELS) as Level[]).map((l) => [l, { label: LEVELS[l].label, steps: LEVELS[l].steps, max: LEVELS[l].max }])),
    limits: { min: MIN_BET, max: MAX_BET },
    recent: recent.map((r) => ({ id: String(r._id), level: r.level, bet: r.betAmount, win: r.winAmount, status: r.status, position: r.position, multiplier: r.status === "cashed" ? multiplierAt(r.level as Level, r.position) : 0 })),
  };
}

export async function startGame(userId: string, amount: number, level: string) {
  await dbConnect();
  if (!isLevel(level)) return { error: "Level select karein." };
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "chicken-dash");
  if (denied) return { error: denied };
  const uid = oid(userId);
  if (await ChickenDash.exists({ userId: uid, status: "active", betAmount: { $gt: 0 } })) return { error: "Pehle wali game abhi chal rahi hai." };

  const r = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (r.modifiedCount === 0) return { error: "Insufficient balance. Pehle deposit karein." };

  const spec = LEVELS[level];
  const crashLane = rollCrashLane(level, amount);
  const { bagLane, bagMult } = bagFor(level);
  const gid = await gameId();
  const result = await GameResult.create({ gameId: gid, userId: uid, betAmount: amount, outcome: "pending", resultData: `${spec.label} · started` });
  const g = await ChickenDash.create({ userId: uid, resultId: String(result._id), level, betAmount: amount, lanes: spec.steps, crashLane, bagLane, bagMult });
  return { ok: true, game: pub(g.toObject()) };
}

async function finish(g: Doc<ChickenDashDoc>, how: "cashed" | "finished") {
  const level = g.level as Level;
  const m = multiplierAt(level, g.position);
  const bonus = g.bagCollected ? g.bagMult : 0;
  const win = winFor(g.betAmount, m, bonus);
  g.status = "cashed";
  g.winAmount = win;
  await g.save();
  await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
  await holdWinShare(String(g.userId), g.betAmount * Math.min(MAX_MULTIPLIER, m + bonus));
  const bonusTxt = bonus ? ` + bag ${bonus}x` : "";
  await GameResult.updateOne(
    { _id: g.resultId },
    { $set: { outcome: win > g.betAmount ? "win" : "lose", winAmount: win, resultData: `${LEVELS[level].label} · ${how === "finished" ? `crossed all ${g.lanes} tiles` : `cashed out at tile ${g.position}`} @ ${m}x${bonusTxt}` } },
  );
  return { m, win };
}

export async function step(userId: string) {
  await dbConnect();
  const g = await ChickenDash.findOne({ userId: oid(userId), status: "active", betAmount: { $gt: 0 } });
  if (!g) return { error: "Koi active game nahi." };
  const level = g.level as Level;
  const next = g.position + 1;

  if (next >= g.crashLane) {
    g.status = "dead";
    g.position = next;
    await g.save();
    await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "lose", resultData: `${LEVELS[level].label} · hit by car at tile ${next}${g.bagCollected ? " (bag lost)" : ""}` } });
    return { ok: true, event: "dead" as const, game: pub(g.toObject()) };
  }

  // Dash boost: sprint 2–3 tiles at once, only through tiles that are safe anyway
  let to = next;
  let dash = false;
  if (Math.random() < DASH_P) {
    const len = 2 + Math.floor(Math.random() * 2);
    const end = g.position + len;
    if (end < g.crashLane && end <= g.lanes && !(g.bagLane && g.bagLane > g.position && g.bagLane < end)) {
      to = end;
      dash = true;
      g.dashes.push({ from: g.position, to });
    }
  }
  g.position = to;
  let bagNow = false;
  if (g.bagLane && !g.bagCollected && g.bagLane <= to) {
    g.bagCollected = true;
    bagNow = true;
  }

  if (to >= g.lanes) {
    await finish(g, "finished");
    return { ok: true, event: "finished" as const, dash, bagNow, game: pub(g.toObject()) };
  }
  await g.save();
  return { ok: true, event: dash ? ("dash" as const) : ("safe" as const), dash, bagNow, game: pub(g.toObject()) };
}

export async function cashOut(userId: string) {
  await dbConnect();
  const g = await ChickenDash.findOne({ userId: oid(userId), status: "active", betAmount: { $gt: 0 }, position: { $gte: 1 } });
  if (!g) return { error: "Cash out ke liye kam az kam ek tile cross karein." };
  const { m, win } = await finish(g, "cashed");
  return { ok: true, multiplier: m, win, game: pub(g.toObject()) };
}
