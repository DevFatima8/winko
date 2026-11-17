import { dbConnect } from "./mongo";
import { ChickenGame, Game, GameResult, User, oid, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { sampleCrashLane } from "./crashLane";
import { holdWinShare } from "./winHold";
import { MAX_GAME_BET } from "./gameBetLimits";


export const MIN_BET = 10;
export const MAX_BET = MAX_GAME_BET;
export const MAX_WIN = Number.MAX_SAFE_INTEGER;
const CELLS = 25;
const RTP = 0.98; // 2% house edge
export const CHICKEN_ROAD_MULTIPLIER_MODEL = "chicken-road-steps-v2";
export const CHICKEN_ROAD_MAX_MULTIPLIER = 1000;

export const DIFFICULTIES = {
  easy: { cars: 1, steps: 26, label: "Easy" },
  medium: { cars: 3, steps: 22, label: "Medium" },
  hard: { cars: 5, steps: 18, label: "Hard" },
  hardcore: { cars: 10, steps: 15, label: "Hardcore" },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const isDifficulty = (d: string): d is Difficulty => d in DIFFICULTIES;
export const lanesFor = (d: Difficulty) => DIFFICULTIES[d].steps;
const legacyLanesFor = (d: Difficulty) => CELLS - DIFFICULTIES[d].cars;

const MULTIPLIERS: Record<Difficulty, number[]> = {
  easy: [1.01, 1.03, 1.06, 1.13, 1.24, 1.37, 1.55, 1.72, 1.90, 2.11, 2.34, 2.59, 2.87, 3.18, 3.52, 3.88, 4.25, 4.63, 5.05, 5.55, 6.10, 6.70, 7.35, 8.10, 9.00, 10.00],
  medium: [1.08, 1.15, 1.24, 1.34, 1.46, 1.60, 1.78, 2.00, 2.28, 2.65, 3.10, 3.65, 4.35, 5.25, 6.40, 7.90, 9.50, 11.50, 14.50, 18.50, 24.50, 32.00],
  hard: [1.15, 1.30, 1.48, 1.70, 1.96, 2.30, 2.75, 3.35, 4.15, 5.25, 6.80, 9.00, 12.20, 17.00, 25.00, 38.00, 60.00, 100.00],
  hardcore: [1.30, 1.65, 2.30, 4.00, 6.50, 11.00, 19.00, 33.00, 58.00, 105.00, 190.00, 340.00, 540.00, 760.00, 1000.00],
};

/** Original ladder retained for rounds accepted before the fixed-paytable model. */
export function legacyMultiplierAt(d: Difficulty, k: number) {
  if (k <= 0) return 1;
  const lanes = legacyLanesFor(d);
  let p = 1;
  for (let i = 0; i < k; i++) p *= (lanes - i) / (CELLS - i);
  return Math.min(MAX_MULTIPLIER, Math.max(1, Math.floor((RTP / p) * 100) / 100));
}

export function multiplierAt(d: Difficulty, k: number) {
  if (k <= 0) return 1;
  const table = MULTIPLIERS[d];
  return table[Math.min(k, table.length) - 1];
}

export const multiplierTable = (d: Difficulty) => Array.from({ length: lanesFor(d) }, (_, i) => multiplierAt(d, i + 1));

/** The original crash curve is retained so changing ladders does not change overall hit/clear odds. */
export function survivalTable(d: Difficulty) {
  const lanes = legacyLanesFor(d);
  const surv = [1];
  for (let k = 1; k <= lanes; k++) surv[k] = surv[k - 1] * (lanes - k + 1) / (CELLS - k + 1);
  return surv;
}

/** Extend or compress the old crash-point support while preserving its total clear probability. */
export function rollCrashLane(d: Difficulty) {
  const oldLanes = legacyLanesFor(d);
  const newLanes = lanesFor(d);
  const sampled = sampleCrashLane(survivalTable(d));
  if (sampled === oldLanes + 1) return newLanes + 1;
  return Math.min(sampled, newLanes);
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

type GameLike = { poolVersion?: string; poolPending?: boolean; poolClaim?: number; multiplierModel?: string; _id: ObjectId; difficulty: string; betAmount: number; lanes: number; position: number; status: string; winAmount: number; crashLane: number };

export function multiplierForGame(g: Pick<GameLike, "difficulty" | "multiplierModel">, position: number) {
  const difficulty = g.difficulty as Difficulty;
  return g.multiplierModel === CHICKEN_ROAD_MULTIPLIER_MODEL ? multiplierAt(difficulty, position) : legacyMultiplierAt(difficulty, position);
}

export function tableForGame(g: Pick<GameLike, "difficulty" | "multiplierModel">) {
  const difficulty = g.difficulty as Difficulty;
  return g.multiplierModel === CHICKEN_ROAD_MULTIPLIER_MODEL
    ? multiplierTable(difficulty)
    : Array.from({ length: legacyLanesFor(difficulty) }, (_, index) => legacyMultiplierAt(difficulty, index + 1));
}

export function publicState(g: GameLike) {
  const diff = g.difficulty as Difficulty;
  const multipliers = tableForGame(g);
  return {
    id: String(g._id),
    difficulty: diff,
    bet: g.betAmount,
    lanes: g.lanes,
    position: g.position,
    status: g.status as "active" | "cashed" | "dead",
    win: g.winAmount,
    poolVersion: g.poolVersion, poolPending: g.poolPending, poolClaim: g.poolClaim,
    multiplierModel: g.multiplierModel,
    multipliers,
    currentMultiplier: multiplierForGame(g, g.position),
    nextMultiplier: g.position < g.lanes ? multiplierForGame(g, g.position + 1) : null,
    crashLane: g.status === "active" ? null : g.crashLane, // revealed only after the game ends
  };
}

const winFor = (bet: number, m: number, cap = MAX_MULTIPLIER) => payoutAfterHouseShare(bet * Math.min(cap, m));

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
    recent: recent.map((r) => ({ id: String(r._id), difficulty: r.difficulty, bet: r.betAmount, win: r.winAmount, status: r.status, position: r.position, multiplier: r.status === "cashed" ? multiplierForGame(r, r.position) : 0 })),
  };
}

export async function startGame(userId: string, amount: number, difficulty: string) {
  await dbConnect();
  if (!isDifficulty(difficulty)) return { error: "Difficulty select karein." };
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  if (amount > MAX_BET) return { error: "Maximum bet per player per round is Rs. 100,000." };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "chicken-road-2");
  if (denied) return { error: denied };
  const uid = oid(userId);
  if (await ChickenGame.exists({ userId: uid, status: "active", betAmount: { $gt: 0 } })) return { error: "Pehle wali game abhi chal rahi hai." };

  const r = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (r.modifiedCount === 0) return { error: "Insufficient balance. Pehle deposit karein." };

  const gid = await gameId();
  const result = await GameResult.create({ gameId: gid, userId: uid, betAmount: amount, outcome: "pending", resultData: `${DIFFICULTIES[difficulty].label} · started` });
  const g = await ChickenGame.create({ userId: uid, resultId: String(result._id), difficulty, betAmount: amount, lanes: lanesFor(difficulty), crashLane: rollCrashLane(difficulty), multiplierModel: CHICKEN_ROAD_MULTIPLIER_MODEL });
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
    const m = multiplierForGame(g, next);
    const cap = g.multiplierModel === CHICKEN_ROAD_MULTIPLIER_MODEL ? CHICKEN_ROAD_MAX_MULTIPLIER : MAX_MULTIPLIER;
    const win = winFor(g.betAmount, m, cap);
    g.status = "cashed";
    g.winAmount = win;
    await g.save();
    await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
    await holdWinShare(userId, g.betAmount * Math.min(cap, m));
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
  const m = multiplierForGame(g, g.position);
  const cap = g.multiplierModel === CHICKEN_ROAD_MULTIPLIER_MODEL ? CHICKEN_ROAD_MAX_MULTIPLIER : MAX_MULTIPLIER;
  const win = winFor(g.betAmount, m, cap);
  g.winAmount = win;
  await g.save();
  await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
  await holdWinShare(userId, g.betAmount * Math.min(cap, m));
  await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "win", winAmount: win, resultData: `${DIFFICULTIES[diff].label} · cashed out at lane ${g.position} @ ${m.toFixed(2)}x` } });
  return { ok: true, game: publicState(g.toObject()), multiplier: m, win };
}
