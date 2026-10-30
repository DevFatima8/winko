import { BET_PRESETS } from "@/lib/betPresets";

export type SymbolId =
  | "wild"
  | "lubu"
  | "dong"
  | "soldier"
  | "rings"
  | "lotus"
  | "A"
  | "K"
  | "Q"
  | "J"
  | "T"
  | "N"
  | "scatter";

export type FreeMode = "diaochan" | "dongzhuo" | "lubu";

export const REELS = 5;
export const ROWS = 3;
export const LINES_COUNT = 30;

export const WIN_RATE = 0.35;

export const BET_OPTIONS: number[] = [...BET_PRESETS];
export const DEFAULT_BET = 100;
export const START_BALANCE = 10000;

export interface SymbolMeta {
  id: SymbolId;
  name: string;
  img?: string;
  label?: string;
  /** minimum consecutive count on a line to pay */
  min: 2 | 3;
  /** line-bet multipliers by count */
  pays: Partial<Record<2 | 3 | 4 | 5, number>>;
  /** weight for random reel stops */
  weight: number;
}

/** Pays are multipliers of the LINE bet (total bet / 30). */
export const SYMBOLS: Record<SymbolId, SymbolMeta> = {
  wild: {
    id: "wild",
    name: "Diao Chan · Wild",
    img: "/images/diaochan.png",
    min: 2,
    pays: { 2: 10, 3: 100, 4: 500, 5: 2500 },
    weight: 12,
  },
  lubu: {
    id: "lubu",
    name: "Lu Bu · Prince",
    img: "/images/lubu.png",
    min: 2,
    pays: { 2: 5, 3: 50, 4: 200, 5: 800 },
    weight: 25,
  },
  dong: {
    id: "dong",
    name: "Dong Zhuo · Warlord",
    img: "/images/dongzhuo.png",
    min: 2,
    pays: { 2: 5, 3: 40, 4: 150, 5: 500 },
    weight: 30,
  },
  soldier: {
    id: "soldier",
    name: "Soldier",
    img: "/images/soldier.png",
    min: 2,
    pays: { 2: 2, 3: 25, 4: 100, 5: 300 },
    weight: 45,
  },
  rings: {
    id: "rings",
    name: "Golden Rings",
    img: "/images/rings.png",
    min: 3,
    pays: { 3: 20, 4: 60, 5: 180 },
    weight: 60,
  },
  lotus: {
    id: "lotus",
    name: "Lotus Flower",
    img: "/images/lotus.png",
    min: 3,
    pays: { 3: 15, 4: 50, 5: 120 },
    weight: 70,
  },
  A: { id: "A", name: "Ace", label: "A", min: 3, pays: { 3: 10, 4: 30, 5: 100 }, weight: 110 },
  K: { id: "K", name: "King", label: "K", min: 3, pays: { 3: 8, 4: 25, 5: 80 }, weight: 120 },
  Q: { id: "Q", name: "Queen", label: "Q", min: 3, pays: { 3: 5, 4: 20, 5: 60 }, weight: 130 },
  J: { id: "J", name: "Jack", label: "J", min: 3, pays: { 3: 5, 4: 15, 5: 50 }, weight: 140 },
  T: { id: "T", name: "Ten", label: "10", min: 3, pays: { 3: 4, 4: 12, 5: 40 }, weight: 150 },
  N: { id: "N", name: "Nine", label: "9", min: 3, pays: { 3: 3, 4: 10, 5: 30 }, weight: 150 },
  scatter: {
    id: "scatter",
    name: "Phoenix · Scatter",
    img: "/images/scatter.png",
    min: 3,
    pays: {},
    weight: 18,
  },
};

/** 30 fixed paylines — row index per reel (0 top, 1 middle, 2 bottom). */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 1, 2, 2, 1],
  [2, 1, 0, 0, 1],
  [1, 0, 0, 1, 2],
  [1, 2, 2, 1, 0],
  [0, 2, 1, 0, 2],
  [2, 0, 1, 2, 0],
  [0, 0, 2, 0, 0],
];

export const FREE_SPINS: Record<
  FreeMode,
  { spins: number; title: string; cn: string; feature: string; img: string }
> = {
  diaochan: {
    spins: 8,
    title: "Diao Chan",
    cn: "貂蝉",
    feature: "Expanding Wilds — every Wild expands to fill its reel",
    img: "/images/diaochan.png",
  },
  dongzhuo: {
    spins: 10,
    title: "Dong Zhuo",
    cn: "董卓",
    feature: "Wild ×4 Multiplier — every line win with a Wild pays 4×",
    img: "/images/dongzhuo.png",
  },
  lubu: {
    spins: 12,
    title: "Lu Bu",
    cn: "呂布",
    feature: "Sticky Lu Bu + Transform — Lu Bu holds reel 1 & converts Soldiers and Warlords",
    img: "/images/lubu.png",
  },
};

/** Instant scatter pay as multiple of TOTAL bet. */
export function scatterInstantPay(count: number, totalBet: number): number {
  if (count >= 5) return totalBet * 50;
  if (count === 4) return totalBet * 10;
  if (count === 3) return totalBet * 2;
  return 0;
}

/** Free-spins win multiplier granted by 3/4/5+ scatters. */
export function scatterFreeMult(count: number): number {
  if (count >= 5) return 4;
  if (count === 4) return 2;
  return 1;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
