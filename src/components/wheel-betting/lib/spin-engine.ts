import { createHash, randomBytes } from "node:crypto";

import { LOSE_INDICES, SEGMENT_MULTIPLIERS, WIN_INDICES } from "./wheel";

/**
 * House-configured outcome split.
 */
export const WIN_PROBABILITY = 0.35;

export type SpinResult = {
  /** index of the segment the wheel stops on */
  index: number;
  /** payout multiplier of that segment */
  multiplier: number;
  /** true when the round was resolved as a win */
  win: boolean;
  /** raw bet amount */
  bet: number;
  /** total returned to the player (0 on a loss) */
  payout: number;
  /** profit/loss for the round (negative on a loss) */
  profit: number;
  /** long random hex used as the server seed for this round */
  serverSeed: string;
  /** sha256(serverSeed:clientSeed:nonce) — verifiable outcome source */
  hash: string;
  /** deterministic float used to decide win / loss */
  roll: number;
};

function toFloat(hex: string): number {
  return parseInt(hex, 16) / 0x1_0000_0000;
}

export function spin(bet: number, clientSeed?: string): SpinResult {
  const serverSeed = randomBytes(16).toString("hex");
  const client = clientSeed?.slice(0, 64) || randomBytes(8).toString("hex");
  const nonce = randomBytes(4).readUInt32BE(0);

  const hash = createHash("sha256")
    .update(`${serverSeed}:${client}:${nonce}`)
    .digest("hex");

  const roll = toFloat(hash.slice(0, 8));
  const slot = toFloat(hash.slice(8, 16));

  const win = roll < WIN_PROBABILITY;
  const pool = win ? WIN_INDICES : LOSE_INDICES;
  const index = pool[Math.min(pool.length - 1, Math.floor(slot * pool.length))];
  const multiplier = SEGMENT_MULTIPLIERS[index];

  const payout = win ? Math.round(bet * multiplier * 100) / 100 : 0;

  return {
    index,
    multiplier,
    win,
    bet,
    payout,
    profit: Math.round((payout - bet) * 100) / 100,
    serverSeed,
    hash,
    roll,
  };
}
