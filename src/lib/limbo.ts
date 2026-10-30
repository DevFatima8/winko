import { createHash, randomInt, randomUUID } from "node:crypto";
import { dbConnect } from "./mongo";
import { Game, GameResult, User, oid, type GameResultDoc, type ObjectId, type UserDoc } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { dedicatedTransaction } from "./dailyPoolDedicated";
import { cents } from "./dailyPool";
import type { MultiplayerTransaction } from "./multiplayer-store";

/** browser/node-safe random hex (provably-fair style seed) */
function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr); else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const MIN_BET = 10, MAX_BET = Number.MAX_SAFE_INTEGER, MAX_WIN = Number.MAX_SAFE_INTEGER;
export const RTP = 0.99; // Stake Limbo: 99% RTP (1% house edge)
export const MIN_TARGET = 1.01, MAX_TARGET = MAX_MULTIPLIER;

let cachedGameId: ObjectId | null = null;
async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate({ slug: "limbo" }, { $setOnInsert: { name: "Limbo", slug: "limbo", icon: "🎯", category: "original", description: "Target multiplier set karein — 100x tak instant result!", isActive: true } }, { upsert: true, returnDocument: "after" }).lean();
  cachedGameId = g!._id; return cachedGameId!;
}

/** Builds a result that is a win (>= target) or a no-win (< target) as decided by the global cycle. */
export function roll(target = 1.01, win = false) {
  const hex = randomHex(32);
  let result: number;
  if (win) {
    // overshoot a bit above target, capped
    const over = target * (1 + Math.random() * (target > 10 ? 1.2 : 0.6));
    result = Math.min(MAX_MULTIPLIER, Math.max(target, Math.round(over * 100) / 100));
  } else {
    const lo = 1, hi = Math.max(lo, target - 0.01);
    result = Math.min(hi, Math.round((lo + Math.random() * (hi - lo)) * 100) / 100);
  }
  return { result, hash: hex };
}

// Every block of 100 different players has exactly 20 winners. A player draws one slot on
// their first bet in a block; further bets by the same player in that block are no-win.
export const CYCLE_SIZE = 100, CYCLE_WINS = 20;
const CYCLE_ID = "limbo:player-cycle:v1";
type Slot = "win" | "lose";
type WinCycle = { _id: string; remaining: Slot[]; players: string[] };

function shuffle<T>(values: T[]) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

// The cycle advances inside the accepting transaction, so retries and failed debits never consume a slot.
async function nextOutcome(tx: MultiplayerTransaction, userId: string, target: number) {
  const saved = await tx.get<WinCycle>("multiplayerrooms", CYCLE_ID);
  if (saved && (!Array.isArray(saved.remaining) || !Array.isArray(saved.players) ||
    saved.remaining.length + saved.players.length !== CYCLE_SIZE || !saved.remaining.length ||
    saved.remaining.some(slot => slot !== "win" && slot !== "lose") ||
    saved.players.some(player => typeof player !== "string" || !player) ||
    new Set(saved.players).size !== saved.players.length ||
    saved.remaining.filter(slot => slot === "win").length > CYCLE_WINS ||
    saved.remaining.filter(slot => slot === "lose").length > CYCLE_SIZE - CYCLE_WINS)) {
    throw new Error("Limbo win cycle is invalid. Contact support.");
  }
  let slot: Slot = "lose";
  if (!saved?.players.includes(userId)) {
    const remaining = saved ? saved.remaining : shuffle([
      ...Array<Slot>(CYCLE_WINS).fill("win"), ...Array<Slot>(CYCLE_SIZE - CYCLE_WINS).fill("lose"),
    ]);
    const players = saved ? [...saved.players, userId] : [userId];
    slot = remaining.shift()!;
    await tx.put("multiplayerrooms", CYCLE_ID, remaining.length ? { _id: CYCLE_ID, remaining, players } : {
      _id: CYCLE_ID, players: [],
      remaining: shuffle([...Array<Slot>(CYCLE_WINS).fill("win"), ...Array<Slot>(CYCLE_SIZE - CYCLE_WINS).fill("lose")]),
    });
  }
  const { result, hash } = roll(target, slot === "win");
  return { result, hash, won: result >= target, data: `result ${result}x · target ${target}x · ${hash.slice(0, 10)}` };
}

const BUDGET_ID = "limbo:instant-budget:v1";
type InstantBudget = { _id: string; stakeCents: number; paidCents: number };

async function instantPayout(tx: MultiplayerTransaction, amount: number, requested: number) {
  const saved = await tx.get<InstantBudget>("multiplayerrooms", BUDGET_ID);
  const budget: InstantBudget = saved ?? { _id: BUDGET_ID, stakeCents: 0, paidCents: 0 };
  if (![budget.stakeCents, budget.paidCents].every(value => Number.isSafeInteger(value) && value >= 0) ||
    BigInt(budget.paidCents) > BigInt(budget.stakeCents) * BigInt(35) / BigInt(100)) {
    throw new Error("Limbo payout budget is invalid. Contact support.");
  }
  budget.stakeCents += cents(amount);
  if (!Number.isSafeInteger(budget.stakeCents)) throw new Error("Limbo payout budget exceeds safe limits.");
  const available = Number(BigInt(budget.stakeCents) * BigInt(35) / BigInt(100)) - budget.paidCents;
  const payoutCents = Math.min(cents(requested), available);
  budget.paidCents += payoutCents;
  await tx.put("multiplayerrooms", BUDGET_ID, budget);
  return payoutCents / 100;
}

export const winChance = () => CYCLE_WINS;

export async function getState(userId: string | null) {
  await dbConnect();
  const gid = await gameId();
  const [me, recent] = userId ? await Promise.all([User.findById(userId, "balance").lean(), GameResult.find({ gameId: gid, userId: oid(userId) }).sort({ createdAt: -1 }).limit(30).lean()]) : [null, []];
  return {
    balance: me?.balance ?? 0,
    dailyPoolEnabled: false,
    limits: { min: MIN_BET, max: MAX_BET, minTarget: MIN_TARGET, maxTarget: MAX_TARGET, rtp: RTP },
    recent: recent.map((r) => { const m = r.resultData?.match(/result ([\d.]+)x.*target ([\d.]+)x/); return { id: String(r._id), bet: r.betAmount, win: r.winAmount, outcome: r.outcome, result: m ? Number(m[1]) : 0, target: m ? Number(m[2]) : 0, at: r.createdAt, poolPending: r.poolPending, poolClaim: r.poolClaim }; }),
  };
}

export async function play(userId: string, amount: number, target: number, requestId = "") {
  await dbConnect();
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  target = Math.floor(Number(target) * 100) / 100;
  if (!Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) return { error: `Target ${MIN_TARGET}x se ${MAX_TARGET.toLocaleString()}x ke darmiyan ho.` };
  amount = Math.floor(amount);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) return { error: "A valid wager request ID is required." };
  const denied = await checkGameAccess(userId, "limbo");
  if (denied) return { error: denied };
  const fingerprint = JSON.stringify([amount, target]);
  const gross = amount * Math.min(target, MAX_MULTIPLIER);
  return dedicatedTransaction("limbo", async tx => {
    const key = createHash("sha256").update(`dedicated:limbo:${userId}:${requestId}`).digest("hex");
    const previous = await tx.get<{ _id: string; fingerprint: string; response: Record<string, unknown>; resultId: string }>("multiplayerrequests", key);
    const user = await tx.get<UserDoc>("users", userId, true);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return { error: "Request ID already belongs to a different wager." };
      const saved = await tx.get<GameResultDoc>("gameresults", previous.resultId);
      if (!saved || !user) throw new Error("Limbo replay record is incomplete.");
      return { ...previous.response, payout: saved.winAmount, poolPending: saved.poolPending, poolClaim: saved.poolClaim, balance: user.balance };
    }
    if (!user || !user.isActive || user.role !== "client" || user.blockedGames?.includes("limbo")) return { error: "This account cannot bet on this game." };
    if (cents(user.balance) < cents(amount)) return { error: "Insufficient balance." };
    const { result, hash, won, data } = await nextOutcome(tx, userId, target);
    const payout = await instantPayout(tx, amount, won ? payoutAfterHouseShare(gross) : 0);
    const now = new Date(await tx.now());
    const gid = await gameId();
    const id = randomUUID();
    const row: GameResultDoc = { _id: id, gameId: gid, userId, roundNo: null, betSlot: 0, betAmount: amount, winAmount: payout, outcome: won ? "win" : "lose", resultData: data, createdAt: now, updatedAt: now };
    user.balance = (cents(user.balance) - cents(amount) + cents(payout)) / 100;
    user.updatedAt = now;
    await tx.put("users", userId, user);
    await tx.insert("gameresults", id, row);
    const response = { ok: true, result, target, won, payout, balance: user.balance, hash: hash.slice(0, 16) };
    await tx.insert("multiplayerrequests", key, { _id: key, fingerprint, response, resultId: id, createdAt: now });
    return response;
  });
}
