import { BET_PRESETS } from "@/lib/betPresets";

export type SpotId = "1" | "2" | "5" | "10" | "20" | "40" | "2x" | "7x";

export const SEGMENT_COUNT = 54;
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

export const WIN_PROBABILITY = 0.35;
export const LOSS_PROBABILITY = 1 - WIN_PROBABILITY;

/** Physical layout of the wheel (index 0 sits under the pointer at rest). */
export const WHEEL_SEQUENCE: SpotId[] = [
  "40", "10", "1", "5", "1", "2", "1", "2x", "2", "1", "1", "5", "2", "1",
  "2", "10", "20", "1", "1", "5", "2", "1", "2", "1", "1", "2", "1", "5",
  "10", "7x", "2", "1", "1", "2", "5", "2x", "1", "2", "1", "1", "2", "1",
  "5", "10", "20", "2", "1", "1", "2", "1", "5", "2", "1", "2",
];

export const NUMBER_SPOTS: SpotId[] = ["1", "2", "5", "10", "20", "40"];
export const MULTIPLIER_SPOTS: SpotId[] = ["2x", "7x"];
export const ALL_SPOTS: SpotId[] = [...NUMBER_SPOTS, ...MULTIPLIER_SPOTS];

/** Straight payout (profit multiple) for a winning number bet. */
export const PAYOUT: Record<SpotId, number> = {
  "1": 1,
  "2": 2,
  "5": 5,
  "10": 10,
  "20": 20,
  "40": 40,
  "2x": 2,
  "7x": 7,
};

export const MULTIPLIER_VALUE: Record<string, number> = { "2x": 2, "7x": 7 };

export type SpotTheme = {
  face: string;
  faceDeep: string;
  edge: string;
  text: string;
  glow: string;
};

export const SPOT_THEME: Record<SpotId, SpotTheme> = {
  "1": {
    face: "#f6c531",
    faceDeep: "#c8930d",
    edge: "#ffe9a3",
    text: "#2a1c00",
    glow: "rgba(246,197,49,0.55)",
  },
  "2": {
    face: "#2f7fe4",
    faceDeep: "#16478f",
    edge: "#a9d3ff",
    text: "#f2f8ff",
    glow: "rgba(47,127,228,0.55)",
  },
  "5": {
    face: "#8b4fe0",
    faceDeep: "#4f2491",
    edge: "#d8b8ff",
    text: "#f8f2ff",
    glow: "rgba(139,79,224,0.55)",
  },
  "10": {
    face: "#20b463",
    faceDeep: "#0c6b38",
    edge: "#a6f0c6",
    text: "#f0fff6",
    glow: "rgba(32,180,99,0.55)",
  },
  "20": {
    face: "#ef7d22",
    faceDeep: "#9c4408",
    edge: "#ffd0a3",
    text: "#fff7ee",
    glow: "rgba(239,125,34,0.55)",
  },
  "40": {
    face: "#e03a4c",
    faceDeep: "#8d1524",
    edge: "#ffb3bc",
    text: "#fff2f4",
    glow: "rgba(224,58,76,0.6)",
  },
  "2x": {
    face: "#29c5d6",
    faceDeep: "#0d6f7c",
    edge: "#b2f4fb",
    text: "#02222a",
    glow: "rgba(41,197,214,0.6)",
  },
  "7x": {
    face: "#e9b02c",
    faceDeep: "#8a5a06",
    edge: "#ffe6a8",
    text: "#2b1c00",
    glow: "rgba(233,176,44,0.65)",
  },
};

export const CHIP_DENOMS = BET_PRESETS;

export const CHIP_STYLE: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: "#e8edf5", ring: "#9aa7bd", text: "#1b2434" },
  50: { bg: "#e2495c", ring: "#ffd7dd", text: "#fff" },
  100: { bg: "#2b2f3a", ring: "#cfd6e4", text: "#fff" },
  200: { bg: "#23a05a", ring: "#c8f5dc", text: "#fff" },
  500: { bg: "#8b4fe0", ring: "#e3d0ff", text: "#fff" },
  1000: { bg: "#e9b02c", ring: "#ffe6a8", text: "#2b1c00" },
};

export const STARTING_BALANCE = 1000;

export function spotLabel(spot: SpotId) {
  return spot;
}

export function formatMoney(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function indicesForSpot(spot: SpotId) {
  return WHEEL_SEQUENCE.reduce<number[]>((acc, value, index) => {
    if (value === spot) acc.push(index);
    return acc;
  }, []);
}

/** Natural (un-manipulated) landing weight of each spot, from the wheel layout. */
export const NATURAL_WEIGHT: Record<SpotId, number> = ALL_SPOTS.reduce(
  (acc, spot) => {
    acc[spot] = indicesForSpot(spot).length;
    return acc;
  },
  {} as Record<SpotId, number>,
);
