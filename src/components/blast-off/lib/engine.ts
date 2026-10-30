export type Phase = "betting" | "flying" | "crashed";

export const WIN_RATE = 0.35;
export const LOSS_RATE = 0.65;

export const BETTING_MS = 6000;
export const CRASH_HOLD_MS = 3200;
export const MAX_MULTIPLIER = 250;

/** multiplier as a function of flight seconds (exponential ascent) */
export function multiplierAt(seconds: number): number {
  return Math.exp(0.155 * seconds);
}

export function secondsForMultiplier(m: number): number {
  return Math.log(Math.max(1, m)) / 0.155;
}

export function fmt(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCredits(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Calibrated crash point generator.
 */
export function generateCrashPoint(target: number): number {
  const t = Math.max(1.05, Math.min(target, 60));
  const win = Math.random() < WIN_RATE;

  // 1 in 40 loss rounds is an instant bust at 1.00x — the classic heartbreak.
  if (!win && Math.random() < 0.025) return 1.0;

  if (win) {
    const m = t * (1.06 + Math.pow(Math.random(), 1.7) * 2.6);
    return Math.min(MAX_MULTIPLIER, Math.round(m * 100) / 100);
  }
  const ceiling = Math.max(1.01, t * 0.985);
  const m = 1.0 + Math.random() * (ceiling - 1.0);
  return Math.round(m * 100) / 100;
}

/** A neutral round for when nobody has a bet riding on it. */
export function generateIdleCrashPoint(): number {
  const r = Math.random();
  const m = 1 + Math.pow(r, 2.1) * 14;
  return Math.round(m * 100) / 100;
}

export function hashSeed(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return (hex(h1) + hex(h2) + hex(h1 ^ h2)).slice(0, 20);
}

export const CALLSIGNS = [
  "orbit_ken",
  "LUNAR-77",
  "cosmo.raj",
  "Vega_Prime",
  "nadia.k",
  "APOGEE",
  "t-minus",
  "sol_rider",
  "ION_WREN",
  "delta.v",
  "kabir_9",
  "HALCYON",
];

export type RosterEntry = {
  id: string;
  name: string;
  stake: number;
  target: number;
  cashoutAt: number | null; // multiplier at which this player exits, null = rides it to the crash
  cashedAt: number | null;
  isYou: boolean;
};

export function buildRoster(crashPoint: number, yourStake: number, isYouIn: boolean): RosterEntry[] {
  const list: RosterEntry[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const target = Math.round((1.15 + Math.random() * 6.5) * 100) / 100;
    const survives = target < crashPoint && Math.random() < 0.42;
    list.push({
      id: `p${i}-${Math.random().toString(36).slice(2, 7)}`,
      name: CALLSIGNS[(i + Math.floor(Math.random() * CALLSIGNS.length)) % CALLSIGNS.length],
      stake: [10, 25, 50, 100, 250, 500, 1000][Math.floor(Math.random() * 7)],
      target,
      cashoutAt: survives ? target : null,
      cashedAt: null,
      isYou: false,
    });
  }
  if (isYouIn) {
    list.unshift({
      id: "you",
      name: "YOU",
      stake: yourStake,
      target: 0,
      cashoutAt: null,
      cashedAt: null,
      isYou: true,
    });
  }
  return list;
}
