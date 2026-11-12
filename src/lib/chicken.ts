import { dbConnect } from "./mongo";
import { ChickenGame, Game, GameResult, User, oid, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { sampleCrashLane } from "./crashLane";
import { holdWinShare } from "./winHold";


export const MIN_BET = 10;
export const MAX_BET = Number.MAX_SAFE_INTEGER;
export const MAX_WIN = Number.MAX_SAFE_INTEGER;
const CELLS = 25; // like the original: 25 cells, N of them have cars
const RTP = 0.98; // 2% house edge

export const DIFFICULTIES = {
  easy: { cars: 1, label: "Easy" },
  medium: { cars: 3, label: "Medium" },
  hard: { cars: 5, label: "Hard" },
  hardcore: { cars: 10, label: "Hardcore" },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const isDifficulty = (d: string): d is Difficulty => d in DIFFICULTIES;
export const lanesFor = (d: Difficulty) => CELLS - DIFFICULTIES[d].cars;

/** Multiplier after crossing `k` lanes safely: RTP / P(k safe steps in a row). */
export function multiplierAt(d: Difficulty, k: number) {
  if (k <= 0) return 1;
  const lanes = lanesFor(d);
  let p = 1;
  for (let i = 0; i < k; i++) p *= (lanes - i) / (CELLS - i);
  return Math.min(MAX_MULTIPLIER, Math.max(1, Math.floor((RTP / p) * 100) / 100));
}

export const multiplierTable = (d: Difficulty) => Array.from({ length: lanesFor(d) }, (_, i) => multiplierAt(d, i + 1));

/** survival[k] = road's own chance of crossing k lanes safely (cars hidden in the 25 cells). */
export function survivalTable(d: Difficulty) {
  const lanes = lanesFor(d);
  const surv = [1];
  for (let k = 1; k <= lanes; k++) surv[k] = surv[k - 1] * (lanes - k + 1) / (CELLS - k + 1);
  return surv;
}

/** Decide (secretly, at game start) on which lane the chicken gets hit. lanes+1 = never. */
export function rollCrashLane(d: Difficulty) {
  return sampleCrashLane(survivalTable(d));
}

let cachedGameId: ObjectId | null = null;
export async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate(
    { slug: "chicken-road-2" },
    { $setOnInsert: { name: "Chicken Road 2", slug: "chicken-road-2", icon: "🐔", description: "Chicken ko road cross karwayein — har lane par multiplier barhta hai!", isActive: true } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  cachedGameId = g!._id;
  return cachedGameId!;
}

type GameLike = { poolVersion?: string; poolPending?: boolean; poolClaim?: number; _id: ObjectId; difficulty: string; betAmount: number; lanes: number; position: number; status: string; winAmount: number; crashLane: number };

export function publicState(g: GameLike) {
  const diff = g.difficulty as Difficulty;
  return {
    id: String(g._id),
    difficulty: diff,
    bet: g.betAmount,
    lanes: g.lanes,
    position: g.position,
    status: g.status as "active" | "cashed" | "dead",
    win: g.winAmount,
    poolVersion: g.poolVersion, poolPending: g.poolPending, poolClaim: g.poolClaim,
    currentMultiplier: multiplierAt(diff, g.position),
    nextMultiplier: g.position < g.lanes ? multiplierAt(diff, g.position + 1) : null,
    crashLane: g.status === "active" ? null : g.crashLane, // revealed only after the game ends
  };
}

const winFor = (bet: number, m: number) => payoutAfterHouseShare(bet * Math.min(MAX_MULTIPLIER, m));

export async function getState(userId: string | null) {
  await dbConnect();
  const [active, me, recent] = userId
    ? await Promise.all([
      ChickenGame.findOne({ userId: oid(userId), status: "active", betAmount: { $gt: 0 } }).lean(),
      User.findById(userId, "balance").lean(),
      ChickenGame.find({ userId: oid(userId), status: { $ne: "active" } }).sort({ createdAt: -1 }).limit(12).lean(),
    ])
    : [null, null, []];
  const keys = Object.keys(DIFFICULTIES) as Difficulty[];
  return {
    game: active ? publicState(active) : null,
    balance: me?.balance ?? 0,
    tables: Object.fromEntries(keys.map((d) => [d, multiplierTable(d)])),
    difficulties: Object.fromEntries(keys.map((d) => [d, { ...DIFFICULTIES[d], lanes: lanesFor(d) }])),
    limits: { min: MIN_BET, max: MAX_BET },
    recent: recent.map((r) => ({ id: String(r._id), difficulty: r.difficulty, bet: r.betAmount, win: r.winAmount, status: r.status, position: r.position, multiplier: r.status === "cashed" ? multiplierAt(r.difficulty as Difficulty, r.position) : 0 })),
  };
}

export async function startGame(userId: string, amount: number, difficulty: string) {
  await dbConnect();
  if (!isDifficulty(difficulty)) return { error: "Difficulty select karein." };
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "chicken-road-2");
  if (denied) return { error: denied };
  const uid = oid(userId);
  if (await ChickenGame.exists({ userId: uid, status: "active", betAmount: { $gt: 0 } })) return { error: "Pehle wali game abhi chal rahi hai." };

  const r = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (r.modifiedCount === 0) return { error: "Insufficient balance. Pehle deposit karein." };

  const gid = await gameId();
  const result = await GameResult.create({ gameId: gid, userId: uid, betAmount: amount, outcome: "pending", resultData: `${DIFFICULTIES[difficulty].label} · started` });
  const g = await ChickenGame.create({ userId: uid, resultId: String(result._id), difficulty, betAmount: amount, lanes: lanesFor(difficulty), crashLane: rollCrashLane(difficulty) });
  return { ok: true, game: publicState(g.toObject()) };
}

export async function step(userId: string) {
  await dbConnect();
  const g = await ChickenGame.findOne({ userId: oid(userId), status: "active", betAmount: { $gt: 0 } });
  if (!g) return { error: "Koi active game nahi." };
  const next = g.position + 1;
  const diff = g.difficulty as Difficulty;
  const label = DIFFICULTIES[diff].label;

  if (next >= g.crashLane) {
    g.status = "dead";
    g.position = next;
    await g.save();
    await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "lose", resultData: `${label} · hit by car at lane ${next}` } });
    return { ok: true, game: publicState(g.toObject()), event: "dead" as const };
  }

  g.position = next;
  if (next >= g.lanes) {
    const m = multiplierAt(diff, next);
    const win = winFor(g.betAmount, m);
    g.status = "cashed";
    g.winAmount = win;
    await g.save();
    await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
    await holdWinShare(userId, g.betAmount * Math.min(MAX_MULTIPLIER, m));
    await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "win", winAmount: win, resultData: `${label} · crossed all ${g.lanes} lanes @ ${m.toFixed(2)}x` } });
    return { ok: true, game: publicState(g.toObject()), event: "finished" as const };
  }

  await g.save();
  return { ok: true, game: publicState(g.toObject()), event: "safe" as const };
}

export async function cashOut(userId: string) {
  await dbConnect();
  const g = await ChickenGame.findOneAndUpdate({ userId: oid(userId), status: "active", betAmount: { $gt: 0 }, position: { $gte: 1 } }, { $set: { status: "cashed" } }, { returnDocument: "after" });
  if (!g) return { error: "Cash out ke liye kam az kam ek lane cross karein." };
  const diff = g.difficulty as Difficulty;
  const m = multiplierAt(diff, g.position);
  const win = winFor(g.betAmount, m);
  g.winAmount = win;
  await g.save();
  await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
  await holdWinShare(userId, g.betAmount * Math.min(MAX_MULTIPLIER, m));
  await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "win", winAmount: win, resultData: `${DIFFICULTIES[diff].label} · cashed out at lane ${g.position} @ ${m.toFixed(2)}x` } });
  return { ok: true, game: publicState(g.toObject()), multiplier: m, win };
}
