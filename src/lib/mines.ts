import { dbConnect } from "./mongo";
import { Game, GameResult, MinesGame, User, oid, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, isWinOutcome, MAX_MULTIPLIER } from "./outcomes";
import { holdWinShare } from "./winHold";
import { dailyPoolEnabled } from "./dailyPoolConfig";
import { acceptPoolMines, actPoolMines } from "./dailyPoolDedicated";
import { DAILY_POOL_VERSION } from "./dailyPoolRules";
import type { PoolFields } from "./dailyPool";
import { isMysqlEnabled } from "./mysql";

export const MIN_BET = 10, MAX_BET = Number.MAX_SAFE_INTEGER, MAX_WIN = Number.MAX_SAFE_INTEGER;
export const RTP = 0.97; // Spribe Mines 97%
export const CELLS = 25, MIN_MINES = 1, MAX_MINES = 24;

/** Fair multiplier after s safe reveals with N mines: C(25,s)/C(25-N,s) × RTP */
export function multiplier(mines: number, safe: number) {
  if (safe <= 0) return 1;
  let m = 1;
  for (let i = 0; i < safe; i++) m *= (CELLS - i) / (CELLS - mines - i);
  return Math.min(MAX_MULTIPLIER, Math.floor(m * RTP * 100) / 100);
}
export function nextMultipliers(mines: number, safe: number) {
  const maxSafe = CELLS - mines;
  return Array.from({ length: maxSafe }, (_, i) => multiplier(mines, i + 1)).slice(safe, safe + 5);
}

let cachedGameId: ObjectId | null = null;
async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate({ slug: "mines" }, { $setOnInsert: { name: "Mines", slug: "mines", icon: "💎", category: "original", description: "5×5 grid, mines choose karein, gems kholen aur cash out — 10,000x tak!", isActive: true } }, { upsert: true, returnDocument: "after" }).lean();
  cachedGameId = g!._id; return cachedGameId!;
}

function pub(g: { _id: ObjectId; betAmount: number; mines: number; mineCells: number[]; revealed: number[]; status: string; winAmount: number } & PoolFields) {
  const safe = g.revealed.length;
  const m = multiplier(g.mines, safe);
  return {
    id: String(g._id), bet: g.betAmount, mines: g.mines, revealed: g.revealed, status: g.status as "active" | "cashed" | "dead", win: g.winAmount,
    multiplier: m, potential: Math.floor(g.betAmount * m * 100) / 100, next: multiplier(g.mines, safe + 1), safeLeft: CELLS - g.mines - safe,
    mineCells: g.status === "active" ? null : g.mineCells, // revealed only after game ends
    poolPending: g.poolPending, poolClaim: g.poolClaim,
  };
}

export async function getState(userId: string | null) {
  await dbConnect();
  const [active, me, recent] = userId ? await Promise.all([
    MinesGame.findOne({ userId: oid(userId), status: "active" }).lean(),
    User.findById(userId, "balance").lean(),
    MinesGame.find({ userId: oid(userId), status: { $ne: "active" } }).sort({ createdAt: -1 }).limit(20).lean(),
  ]) : [null, null, []];
  return {
    game: active ? pub(active) : null,
    balance: me?.balance ?? 0,
    dailyPoolEnabled: dailyPoolEnabled(),
    limits: { min: MIN_BET, max: MAX_BET, minMines: MIN_MINES, maxMines: MAX_MINES, rtp: RTP },
    recent: recent.map((r) => ({ id: String(r._id), bet: r.betAmount, mines: r.mines, win: r.winAmount, status: r.status, safe: r.revealed.length, multiplier: r.status === "cashed" ? multiplier(r.mines, r.revealed.length) : 0, poolPending: (r as PoolFields).poolPending, poolClaim: (r as PoolFields).poolClaim })),
  };
}

export async function start(userId: string, amount: number, mines: number) {
  await dbConnect();
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  mines = Math.floor(mines);
  if (!Number.isInteger(mines) || mines < MIN_MINES || mines > MAX_MINES) return { error: `Mines ${MIN_MINES}–${MAX_MINES} ke darmiyan hon.` };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, "mines");
  if (denied) return { error: denied };
  const uid = oid(userId);
  if (await MinesGame.exists({ userId: uid, status: "active" })) return { error: "Pehle wali game abhi chal rahi hai." };
  const tight = !isWinOutcome();
  const cells = Array.from({ length: CELLS }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    if (tight) {
      // weight early half more (0..23)
      const j = Math.floor(Math.pow(Math.random(), 1.35) * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    } else {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
  }
  const mineCells = cells.slice(0, mines).sort((a, b) => a - b);
  if (isMysqlEnabled() || dailyPoolEnabled()) return acceptPoolMines(userId, amount, mines, mineCells, pub, dailyPoolEnabled());
  const upd = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (!upd.modifiedCount) return { error: "Insufficient balance." };
  const gid = await gameId();
  const res = await GameResult.create({ gameId: gid, userId: uid, betAmount: amount, outcome: "pending", resultData: `${mines} mines · started` });
  const g = await MinesGame.create({ userId: uid, resultId: String(res._id), betAmount: amount, mines, mineCells });
  return { ok: true, game: pub(g.toObject()) };
}

export async function reveal(userId: string, cell: number) {
  await dbConnect();
  if (isMysqlEnabled()) return await actPoolMines(userId, "reveal", cell, multiplier, pub) ?? { error: "Koi active game nahi." };
  const g = await MinesGame.findOne({ userId: oid(userId), status: "active" });
  if (!g) return { error: "Koi active game nahi." };
  if ((g as PoolFields).poolVersion === DAILY_POOL_VERSION) return await actPoolMines(userId, "reveal", cell, multiplier, pub) ?? { error: "Koi active game nahi." };
  cell = Math.floor(cell);
  if (cell < 0 || cell >= CELLS || g.revealed.includes(cell)) return { error: "Invalid cell." };
  if (g.mineCells.includes(cell)) {
    g.status = "dead"; await g.save();
    await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "lose", resultData: `${g.mines} mines · hit mine after ${g.revealed.length} safe` } });
    return { ok: true, event: "mine" as const, cell, game: pub(g.toObject()) };
  }
  g.revealed.push(cell);
  const safe = g.revealed.length;
  if (safe >= CELLS - g.mines) {
    // all safe tiles revealed → auto cash out at max
    const m = multiplier(g.mines, safe);
    const win = payoutAfterHouseShare(g.betAmount * m);
    g.status = "cashed"; g.winAmount = win; await g.save();
    await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
    await holdWinShare(userId, g.betAmount * m);
    await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "win", winAmount: win, resultData: `${g.mines} mines · cleared all @ ${m}x` } });
    return { ok: true, event: "cleared" as const, cell, game: pub(g.toObject()) };
  }
  await g.save();
  return { ok: true, event: "gem" as const, cell, game: pub(g.toObject()) };
}

export async function cashOut(userId: string) {
  await dbConnect();
  if (isMysqlEnabled()) return await actPoolMines(userId, "cashout", 0, multiplier, pub) ?? { error: "Kam az kam ek gem kholen." };
  const active = await MinesGame.findOne({ userId: oid(userId), status: "active" }).lean();
  if ((active as PoolFields | null)?.poolVersion === DAILY_POOL_VERSION) return await actPoolMines(userId, "cashout", 0, multiplier, pub) ?? { error: "Koi active game nahi." };
  const g = await MinesGame.findOneAndUpdate({ userId: oid(userId), status: "active", "revealed.0": { $exists: true } }, { $set: { status: "cashed" } }, { returnDocument: "after" });
  if (!g) return { error: "Kam az kam ek gem kholen." };
  const m = multiplier(g.mines, g.revealed.length);
  const win = payoutAfterHouseShare(g.betAmount * m);
  g.winAmount = win; await g.save();
  await User.updateOne({ _id: g.userId }, { $inc: { balance: win } });
  await holdWinShare(userId, g.betAmount * m);
  await GameResult.updateOne({ _id: g.resultId }, { $set: { outcome: "win", winAmount: win, resultData: `${g.mines} mines · cashed out after ${g.revealed.length} @ ${m}x` } });
  return { ok: true, multiplier: m, win, game: pub(g.toObject()) };
}
