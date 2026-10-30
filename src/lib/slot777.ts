import { createHash, randomInt, randomUUID } from "node:crypto";
import { dbConnect } from "./mongo";
import { Game, GameResult, User, oid, type GameResultDoc, type ObjectId, type UserDoc, type WinHoldDoc } from "@/models";
import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { heldPortion } from "./winHold";
import { dedicatedTransaction } from "./dailyPoolDedicated";
import { cents } from "./dailyPool";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { DAILY_POOL_WIN_CAP } from "./dailyPoolRules";
import { nextPlayerPrize } from "./playerWinCycle";

export const MIN_BET = 10, MAX_BET = Number.MAX_SAFE_INTEGER, MAX_WIN = Number.MAX_SAFE_INTEGER;
// Classic 3-reel, 1-line "Lucky 777".
export const SYMBOLS = ["seven", "bar3", "bar2", "bar1", "bell", "cherry", "lemon", "orange", "plum"] as const;
export type Sym = (typeof SYMBOLS)[number];
export const PAYTABLE: { combo: string; label: string; mult: number }[] = [
  { combo: "seven,seven,seven", label: "7 7 7", mult: 100 },
  { combo: "bar3,bar3,bar3", label: "BAR BAR BAR (triple)", mult: 100 },
  { combo: "bar2,bar2,bar2", label: "BAR BAR BAR (double)", mult: 50 },
  { combo: "bar1,bar1,bar1", label: "BAR BAR BAR (single)", mult: 25 },
  { combo: "anybar", label: "Any 3 BARs", mult: 10 },
  { combo: "bell,bell,bell", label: "Bell ×3", mult: 20 },
  { combo: "plum,plum,plum", label: "Plum ×3", mult: 12 },
  { combo: "orange,orange,orange", label: "Orange ×3", mult: 10 },
  { combo: "lemon,lemon,lemon", label: "Lemon ×3", mult: 8 },
  { combo: "cherry,cherry,cherry", label: "Cherry ×3", mult: 6 },
  { combo: "cherry2", label: "Any 2 Cherries", mult: 2 },
  { combo: "cherry1", label: "Any 1 Cherry", mult: 1 },
];

export function evaluate(reels: Sym[]) {
  const [a, b, c] = reels;
  const key = reels.join(",");
  const exact = PAYTABLE.find((p) => p.combo === key);
  if (exact) return exact;
  const isBar = (s: Sym) => s.startsWith("bar");
  if (isBar(a) && isBar(b) && isBar(c)) return PAYTABLE.find((p) => p.combo === "anybar")!;
  const cherries = reels.filter((s) => s === "cherry").length;
  if (cherries === 2) return PAYTABLE.find((p) => p.combo === "cherry2")!;
  if (cherries === 1) return PAYTABLE.find((p) => p.combo === "cherry1")!;
  return null;
}
type SpinCategory = "orange" | "lemon" | "cherry3" | "cherry2" | "cherry1";
const PRIZES: readonly SpinCategory[] = [
  "orange", "lemon", "lemon", "cherry3", "cherry3", "cherry3", "cherry2", "cherry2", "cherry1", "cherry1",
];
const CATEGORY_COMBOS: Record<SpinCategory, string> = {
  orange: "orange,orange,orange", lemon: "lemon,lemon,lemon", cherry3: "cherry,cherry,cherry", cherry2: "cherry2", cherry1: "cherry1",
};
export const WIN_CAP = Math.min(2, DAILY_POOL_WIN_CAP["lucky-777"]!);
const NON_CHERRIES = SYMBOLS.filter(symbol => symbol !== "cherry");
// Reel strip weights are retained for visual variety on losing spins.
const WEIGHTS: Record<Sym, number>[] = [
  { seven: 3, bar3: 4, bar2: 5, bar1: 7, bell: 7, cherry: 10, lemon: 8, orange: 8, plum: 8 },
  { seven: 3, bar3: 4, bar2: 5, bar1: 7, bell: 7, cherry: 9, lemon: 8, orange: 8, plum: 8 },
  { seven: 3, bar3: 4, bar2: 5, bar1: 7, bell: 7, cherry: 8, lemon: 8, orange: 8, plum: 8 },
];

function spinReel(i: number): Sym {
  const w = WEIGHTS[i]; const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = randomInt(total);
  for (const s of SYMBOLS) { r -= w[s]; if (r < 0) return s; }
  return "plum";
}

function otherReels(): Sym[] {
  for (;;) {
    const reels = [spinReel(0), spinReel(1), spinReel(2)];
    if (!evaluate(reels)) return reels;
  }
}

/** Final multiplier paid for a hit: never above the per-wager cap. */
export const cappedMultiplier = (mult: number) => Math.min(MAX_MULTIPLIER, WIN_CAP, mult);

function shuffle<T>(values: T[]) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

// Only a distinct admitted player consumes a slot; acceptance and both cycles commit together.
async function nextSpin(tx: MultiplayerTransaction, userId: string) {
  const category = await nextPlayerPrize(tx, "lucky-777", userId, PRIZES);
  let reels: Sym[];
  if (category === null) reels = otherReels();
  else if (category === "orange" || category === "lemon") reels = [category, category, category];
  else if (category === "cherry3") reels = ["cherry", "cherry", "cherry"];
  else {
    const count = category === "cherry2" ? 2 : 1;
    reels = shuffle(Array.from({ length: 3 }, (_, index): Sym =>
      index < count ? "cherry" : NON_CHERRIES[randomInt(NON_CHERRIES.length)]));
  }
  const match = evaluate(reels);
  const hit = match ? { ...match, mult: cappedMultiplier(match.mult) } : null;
  return { reels, hit, data: `${reels.join(" | ")}${hit ? ` → ${hit.label} ×${hit.mult}` : ""}` };
}

/** Capped gross return per equal stake across 100 distinct admitted players, excluding repeat losses. */
export function theoreticalRtp() {
  return PRIZES.reduce((total, category) =>
    total + cappedMultiplier(PAYTABLE.find(entry => entry.combo === CATEGORY_COMBOS[category])!.mult), 0) / 100;
}

let cachedGameId: ObjectId | null = null;
async function gameId(): Promise<ObjectId> {
  if (cachedGameId) return cachedGameId;
  const g = await Game.findOneAndUpdate({ slug: "lucky-777" }, { $setOnInsert: { name: "Lucky 777", slug: "lucky-777", icon: "🎰", category: "original", description: "Classic 3-reel slot — 7 7 7 par jackpot!", isActive: true } }, { upsert: true, returnDocument: "after" }).lean();
  cachedGameId = g!._id; return cachedGameId!;
}

export async function getState(userId: string | null) {
  await dbConnect();
  const gid = await gameId();
  const [me, recent] = userId ? await Promise.all([User.findById(userId, "balance").lean(), GameResult.find({ gameId: gid, userId: oid(userId) }).sort({ createdAt: -1 }).limit(20).lean()]) : [null, []];
  return { balance: me?.balance ?? 0, dailyPoolEnabled: false, limits: { min: MIN_BET, max: MAX_BET }, paytable: PAYTABLE, recent: recent.map((r) => ({ id: String(r._id), bet: r.betAmount, win: r.winAmount, data: r.resultData, at: r.createdAt, poolPending: r.poolPending, poolClaim: r.poolClaim })) };
}

export async function spin(userId: string, amount: number, requestId = "") {
  await dbConnect();
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  amount = Math.floor(amount);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) return { error: "A valid wager request ID is required." };
  const denied = await checkGameAccess(userId, "lucky-777");
  if (denied) return { error: denied };
  const fingerprint = JSON.stringify([amount]);
  return dedicatedTransaction("lucky-777", async tx => {
    const key = createHash("sha256").update(`dedicated:lucky-777:${userId}:${requestId}`).digest("hex");
    const previous = await tx.get<{ _id: string; fingerprint: string; response: Record<string, unknown>; resultId: string }>("multiplayerrequests", key);
    const user = await tx.get<UserDoc>("users", userId, true);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return { error: "Request ID already belongs to a different wager." };
      const result = await tx.get<GameResultDoc>("gameresults", previous.resultId);
      if (!result || !user) throw new Error("Lucky 777 replay record is incomplete.");
      return { ...previous.response, payout: result.winAmount, poolPending: result.poolPending, poolClaim: result.poolClaim, balance: user.balance };
    }
    if (!user || !user.isActive || user.role !== "client" || user.blockedGames?.includes("lucky-777")) return { error: "This account cannot bet on this game." };
    if (cents(user.balance) < cents(amount)) return { error: "Insufficient balance." };
    const { reels, hit, data } = await nextSpin(tx, userId);
    const gross = hit ? amount * cappedMultiplier(hit.mult) : 0;
    const payout = payoutAfterHouseShare(gross);
    const now = new Date(await tx.now());
    const gid = await gameId();
    const id = randomUUID();
    const result: GameResultDoc = { _id: id, gameId: gid, userId, roundNo: null, betSlot: 0, betAmount: amount, winAmount: payout, outcome: payout > 0 ? "win" : "lose", resultData: data, createdAt: now, updatedAt: now };
    user.balance = (cents(user.balance) - cents(amount) + cents(payout)) / 100;
    user.updatedAt = now;
    await tx.put("users", userId, user);
    await tx.insert("gameresults", id, result);
    const hold = heldPortion(gross);
    if (hold > 0) {
      const holdId = randomUUID();
      const row: WinHoldDoc = { _id: holdId, userId, amount: hold, claimed: false, claimedAt: null, unlockAt: now, createdAt: now, updatedAt: now };
      await tx.insert("winholds", holdId, row);
    }
    const response = { ok: true, reels, win: hit ? { label: hit.label, mult: hit.mult } : null, payout, balance: user.balance };
    await tx.insert("multiplayerrequests", key, { _id: key, fingerprint, response, resultId: id, createdAt: now });
    return response;
  });
}
