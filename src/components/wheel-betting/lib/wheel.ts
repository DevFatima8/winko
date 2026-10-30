/**
 * Wheel configuration — shared between the server (spin engine) and the client (rendering).
 * The wheel has 20 segments: 13 losing segments (65%) and 7 winning segments (35%).
 */

export type SegmentStyle = {
  /** gradient start colour */
  from: string;
  /** gradient end colour */
  to: string;
  /** label text colour */
  text: string;
  /** glow / accent colour */
  accent: string;
  /** peg colour */
  peg: string;
};

export const LOSE_MULTIPLIER = 0;

export const MULTIPLIER_STYLES: Record<number, SegmentStyle> = {
  0: {
    from: "#232c42",
    to: "#141b2c",
    text: "#8ea0c4",
    accent: "#33415e",
    peg: "#4a5878",
  },
  2: {
    from: "#00e5a0",
    to: "#00865f",
    text: "#03291d",
    accent: "#00ffb2",
    peg: "#00ffc4",
  },
  3: {
    from: "#8b6bff",
    to: "#5433d6",
    text: "#ffffff",
    accent: "#a98cff",
    peg: "#c3b0ff",
  },
  5: {
    from: "#ffcc45",
    to: "#e07800",
    text: "#3b1d00",
    accent: "#ffd76e",
    peg: "#ffe08a",
  },
};

/**
 * Ordered clockwise, segment 0 starts at 12 o'clock when the wheel rotation is 0.
 */
export const SEGMENT_MULTIPLIERS: number[] = [
  0, // 0
  2, // 1
  0, // 2
  3, // 3
  0, // 4
  0, // 5
  2, // 6
  0, // 7
  5, // 8
  0, // 9
  3, // 10
  0, // 11
  0, // 12
  2, // 13
  0, // 14
  2, // 15
  0, // 16
  0, // 17
  0, // 18
  0, // 19
];

export const SEGMENT_COUNT = SEGMENT_MULTIPLIERS.length;
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

export const WIN_INDICES: number[] = SEGMENT_MULTIPLIERS.map((m, i) => (m > 0 ? i : -1)).filter(
  (i) => i >= 0,
);

export const LOSE_INDICES: number[] = SEGMENT_MULTIPLIERS.map((m, i) => (m === 0 ? i : -1)).filter(
  (i) => i >= 0,
);

export function segmentStyle(multiplier: number): SegmentStyle {
  return MULTIPLIER_STYLES[multiplier] ?? MULTIPLIER_STYLES[0];
}

export function segmentLabel(multiplier: number): string {
  return multiplier === 0 ? "0×" : `${multiplier}×`;
}

export function multiplierToneClass(multiplier: number): string {
  if (multiplier >= 5) return "text-amber-300";
  if (multiplier >= 3) return "text-violet-300";
  if (multiplier > 0) return "text-emerald-300";
  return "text-slate-400";
}

export function multiplierChipClass(multiplier: number): string {
  if (multiplier >= 5)
    return "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40 shadow-[0_0_18px_rgba(255,190,60,0.35)]";
  if (multiplier >= 3)
    return "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/40 shadow-[0_0_18px_rgba(150,110,255,0.3)]";
  if (multiplier > 0)
    return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/40 shadow-[0_0_18px_rgba(0,230,160,0.3)]";
  return "bg-slate-600/20 text-slate-400 ring-1 ring-slate-500/30";
}

export const CURRENCY = "Rs.";

export function formatMoney(value: number): string {
  return `${CURRENCY} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const MIN_BET = 10;
