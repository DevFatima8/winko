// ---------------------------------------------------------------
//  Fishing Arcade – game configuration
//  Rs. balance. No database.
// ---------------------------------------------------------------

import { BET_PRESETS } from "@/lib/betPresets";

export const W = 1280;
export const H = 720;

export const WIN_RATE = 0.35;
export const LOSS_RATE = 0.63;
export const PLATFORM_RATE = 0.02;

export const START_BALANCE = 10000;
export const BETS: number[] = [...BET_PRESETS];

export const CANNON = { x: W / 2, y: 628 };
export const BALANCE_TARGET = { x: 150, y: 664 };

export const MAX_FISH = 20;

export type FishKind = "fish" | "puffer" | "jelly" | "turtle" | "shark" | "golden";

export interface Species {
  id: string;
  name: string;
  kind: FishKind;
  mult: number;
  weight: number;
  w: number;
  h: number;
  /** hit box half extents as factor of w / h */
  hit: [number, number];
  speed: [number, number];
  wobble: [number, number];
  school?: [number, number];
  c1: string;
  c2: string;
  accent: string;
}

export const SPECIES: Species[] = [
  {
    id: "clown",
    name: "Clownfish",
    kind: "fish",
    mult: 1.5,
    weight: 36,
    w: 66,
    h: 42,
    hit: [0.42, 0.5],
    speed: [60, 105],
    wobble: [8, 22],
    school: [3, 5],
    c1: "#ff9a2e",
    c2: "#e8480c",
    accent: "#ff7a1a",
  },
  {
    id: "tang",
    name: "Blue Tang",
    kind: "fish",
    mult: 2,
    weight: 26,
    w: 78,
    h: 50,
    hit: [0.42, 0.5],
    speed: [55, 95],
    wobble: [10, 26],
    school: [2, 4],
    c1: "#3fa9ff",
    c2: "#1239c9",
    accent: "#ffd21f",
  },
  {
    id: "puffer",
    name: "Pufferfish",
    kind: "puffer",
    mult: 3,
    weight: 16,
    w: 80,
    h: 76,
    hit: [0.46, 0.46],
    speed: [38, 70],
    wobble: [12, 24],
    c1: "#ffe36a",
    c2: "#e0a31a",
    accent: "#c9831a",
  },
  {
    id: "jelly",
    name: "Jellyfish",
    kind: "jelly",
    mult: 4,
    weight: 9,
    w: 76,
    h: 100,
    hit: [0.44, 0.44],
    speed: [28, 50],
    wobble: [30, 52],
    c1: "#ff8be0",
    c2: "#9a4dff",
    accent: "#ffc4f2",
  },
  {
    id: "turtle",
    name: "Sea Turtle",
    kind: "turtle",
    mult: 6,
    weight: 5,
    w: 136,
    h: 100,
    hit: [0.42, 0.42],
    speed: [32, 52],
    wobble: [12, 22],
    c1: "#6fd35a",
    c2: "#1c7a3a",
    accent: "#b6e86a",
  },
  {
    id: "shark",
    name: "Shark",
    kind: "shark",
    mult: 10,
    weight: 3,
    w: 250,
    h: 112,
    hit: [0.42, 0.3],
    speed: [48, 78],
    wobble: [10, 18],
    c1: "#7f93a8",
    c2: "#3b4b61",
    accent: "#5d7088",
  },
  {
    id: "golden",
    name: "Golden Dragon",
    kind: "golden",
    mult: 25,
    weight: 1,
    w: 240,
    h: 124,
    hit: [0.42, 0.42],
    speed: [40, 62],
    wobble: [14, 22],
    c1: "#fff08a",
    c2: "#e8920c",
    accent: "#ff6a1a",
  },
];

export const TOTAL_WEIGHT = SPECIES.reduce((s, f) => s + f.weight, 0);

export function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatMult(m: number): string {
  return Number.isInteger(m) ? `${m}` : m.toFixed(1);
}
