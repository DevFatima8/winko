import { dbConnect } from "./mongo";
import { Game, type ObjectId } from "@/models";
import { checkGameAccess } from "./gameAccess";

/** browser/node-safe random hex (provably-fair style seed) */
function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr); else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const TABLES = {
  aviator: { name: "Aviator", waitMs: 6000, pauseMs: 3500, growth: 0.06, houseEdge: 0.03, maxMult: 10000, slots: 2, minBet: 10, maxBet: Number.MAX_SAFE_INTEGER },
  "aviator-x": { name: "Aviator X", waitMs: 6000, pauseMs: 3500, growth: 0.075, houseEdge: 0.03, maxMult: 10000, slots: 3, minBet: 10, maxBet: Number.MAX_SAFE_INTEGER },
} as const;
export type Table = keyof typeof TABLES;
export const isTable = (t: string): t is Table => t in TABLES;

export function multiplierAt(table: Table, startsAt: Date, now: Date = new Date()) {
  const t = Math.max(0, (now.getTime() - startsAt.getTime()) / 1000);
  return Math.min(TABLES[table].maxMult, Math.floor(Math.exp(TABLES[table].growth * t) * 100) / 100);
}

/**
 * Crash point generator.
 * Rules:
 * Server-side only — clients never choose the result.
 */
export function generateCrashPoint(table: Table) {
  const seed = randomHex(32);
  const h = randomHex(32);
  const n = parseInt(h.slice(0, 13), 16); // 52 bits
  const r = n / 2 ** 52; // uniform 0..1
  const cfg = TABLES[table];

  let cp: number;
  if (r < 0.65) {
    // 65% LOSS ROUND: random low crash between 1.01 and 1.99 (weighted toward low values, no fixed point)
    const k = r / 0.65;
    cp = Math.min(1.99, Math.floor((1.01 + Math.pow(k, 1.5) * 0.98) * 100) / 100);
  } else {
    const u = (r - 0.65) / 0.35; // 0..1 uniform inside the win band
    if (u < 0.60) {
      // 2.00x .. 5.00x
      cp = 2.00 + (u / 0.60) * 3.00;
    } else if (u < 0.85) {
      // 5.00x .. 15.00x
      cp = 5.00 + ((u - 0.60) / 0.25) * 10.00;
    } else if (u < 0.96) {
      // 15.00x .. 50.00x
      cp = 15.00 + ((u - 0.85) / 0.11) * 35.00;
    } else {
      // 50.00x .. maxMult, heavy-tailed like real crash games (most rare rounds end below a few hundred x)
      const v = (u - 0.96) / 0.04;
      cp = 50.00 / (1 - v * (1 - 50.00 / cfg.maxMult));
    }
    cp = Math.min(cfg.maxMult, Math.floor(cp * 100) / 100);
  }
  return { crashPoint: cp, seed, hash: h };
}

const gameIds: Partial<Record<Table, ObjectId>> = {};
export async function getGameId(table: Table) {
  if (gameIds[table]) return gameIds[table]!;
  await dbConnect();
  const gme = await Game.findOneAndUpdate(
    { slug: table },
    { $setOnInsert: { name: TABLES[table].name, slug: table, icon: table === "aviator" ? "✈️" : "🚀", category: "original", description: table === "aviator" ? "Plane udne se pehle cash out karein aur multiplier jeetein!" : "Aviator ka X edition — 3 bets, neon sky, 10,000x tak!", isActive: true } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  gameIds[table] = gme!._id;
  return gameIds[table]!;
}

export async function getState(userId: string | null, table: Table) {
  return (await import("./sharedLegacyTables")).sharedFlightState(userId, table);
}

export async function placeBet(userId: string, table: Table, amount: number, slot = 0, expectedRound?: number, queueIfClosed = false) {
  const cfg = TABLES[table];
  if (!Number.isFinite(amount) || amount < cfg.minBet) return { error: `Minimum bet Rs. ${cfg.minBet} hai.` };
  if (!Number.isInteger(slot) || slot < 0 || slot >= cfg.slots) return { error: "Invalid bet panel." };
  amount = table === "aviator" ? Math.round(amount * 100) / 100 : Math.floor(amount);
  const denied = await checkGameAccess(userId, table);
  if (denied) return { error: denied };
  return (await import("./sharedLegacyTables")).sharedFlightBet(userId, amount, slot, expectedRound, table, queueIfClosed);
}

export async function cancelBet(userId: string, table: Table, slot = 0, expectedRound?: number) {
  return (await import("./sharedLegacyTables")).sharedFlightCancel(userId, slot, expectedRound, table);
}

export async function cashOut(userId: string, table: Table, slot = 0, expectedRound?: number) {
  return (await import("./sharedLegacyTables")).sharedFlightCashout(userId, slot, expectedRound, table);
}
