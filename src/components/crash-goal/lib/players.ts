import { WIN_RATIO } from "./crash";

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomName(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return out;
}

const AVATAR_TONES = [
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-lime-400 to-green-600",
];

export function randomTone(): string {
  return AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)];
}

export interface BotPlayer {
  id: string;
  name: string;
  tone: string;
  bet: number;
  /** Auto cash-out target of the bot. */
  target: number;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
  payout: number;
}

/** Builds the visible table for a round (targets are assigned at take-off). */
export function createRoster(count = 14): BotPlayer[] {
  const bots: BotPlayer[] = [];
  for (let i = 0; i < count; i += 1) {
    bots.push({
      id: `bot-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name: randomName(),
      tone: randomTone(),
      bet: pickStake(),
      target: 2 + Math.random() * 6,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0,
    });
  }
  return bots;
}

/**
 * Puts every bot on the correct side of the crash point using the very same
 * 35 / 65 rule the player is subject to.
 */
export function assignTargets(bots: BotPlayer[], crashPoint: number): void {
  for (const bot of bots) {
    const willWin = Math.random() < WIN_RATIO;
    if (willWin) {
      bot.target = Math.max(1.02, Math.min(bot.target, crashPoint - 0.03));
    } else {
      bot.target = Math.min(500, Math.max(bot.target, crashPoint + 0.05));
    }
    bot.target = Number(bot.target.toFixed(2));
    bot.cashedOut = false;
    bot.cashoutMultiplier = null;
    bot.payout = 0;
  }
}

const STAKE_POOL = [
  0.2, 0.3, 0.5, 0.5, 1, 1, 2, 2, 2.4, 3, 3.2, 4, 4, 5, 6, 8, 10, 15, 25, 40,
];

function pickStake(): number {
  return STAKE_POOL[Math.floor(Math.random() * STAKE_POOL.length)];
}



/** Big pseudo round id shown in the footer bar, like the original. */
export function randomRoundId(): string {
  let out = "";
  for (let i = 0; i < 16; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}
