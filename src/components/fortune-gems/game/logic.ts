/**
 * Fortune Gems – game logic
 * 3x3 grid, 5 fixed paylines, 4th multiplier reel (1x–15x), Extra Bet mode.
 */
import { BET_PRESETS } from "@/lib/betPresets";

export type SymbolId = 'wild' | 'red' | 'blue' | 'green' | 'A' | 'K' | 'Q' | 'J';

export const SYMBOLS: SymbolId[] = ['wild', 'red', 'blue', 'green', 'A', 'K', 'Q', 'J'];

/** Payout for 3 in a line (x total bet, before the multiplier reel) */
export const PAYOUT: Record<SymbolId, number> = {
  wild: 5,
  red: 4,
  blue: 3,
  green: 2.4,
  A: 2,
  K: 1.6,
  Q: 1,
  J: 0.4,
};

/** 5 fixed paylines on a 3x3 grid – [row for col0, col1, col2] */
export const PAYLINES: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

export const MULTIPLIERS = [1, 2, 3, 5, 10, 15];

export const WIN_RATE = 0.35;
export const EXTRA_BET_COST = 1.5;

type W<T extends string | number> = Record<T, number>;

/** filler symbols for random cells */
const FILL_WEIGHTS: W<SymbolId> = { wild: 3, red: 9, blue: 12, green: 15, A: 17, K: 19, Q: 21, J: 24 };

/** which symbol makes the winning line in a winning spin */
const WIN_WEIGHTS: W<SymbolId> = { wild: 0.5, red: 2, blue: 4.5, green: 9, A: 15, K: 25, Q: 30, J: 14 };
const WIN_WEIGHTS_EX: W<SymbolId> = { wild: 0.1, red: 0.9, blue: 2.5, green: 4.5, A: 9, K: 18, Q: 35, J: 30 };

/** multiplier wheel weights */
const MULT_WEIGHTS: W<number> = { 1: 70, 2: 15, 3: 8, 5: 4, 10: 2, 15: 1 };
const MULT_WEIGHTS_EX: W<number> = { 1: 0, 2: 50, 3: 27, 5: 13, 10: 6.7, 15: 3.3 };

function pickKey(weights: Record<string, number>): string {
  const keys = Object.keys(weights);
  const total = keys.reduce((a, k) => a + weights[k], 0);
  let r = Math.random() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0 && weights[k] > 0) return k;
  }
  return keys.filter((k) => weights[k] > 0).pop() as string;
}
const pickSym = (w: W<SymbolId>) => pickKey(w) as SymbolId;
const pickNum = (w: W<number>) => Number(pickKey(w as Record<string, number>));

export const randomSymbol = (): SymbolId => pickSym(FILL_WEIGHTS);
export const randomMultiplier = (extra = false): number => pickNum(extra ? MULT_WEIGHTS_EX : { 1: 30, 2: 26, 3: 20, 5: 13, 10: 7, 15: 4 });

export type Grid = SymbolId[][]; // grid[row][col]

export interface LineWin {
  line: number;
  symbol: SymbolId;
  pay: number; // x bet (before multiplier)
  cells: [number, number][]; // [row, col]
}

export function evaluate(grid: Grid): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((line, idx) => {
    const syms = line.map((row, col) => grid[row][col]);
    const base = syms.find((s) => s !== 'wild') ?? 'wild';
    if (syms.every((s) => s === base || s === 'wild')) {
      wins.push({
        line: idx,
        symbol: base,
        pay: PAYOUT[base],
        cells: line.map((row, col) => [row, col] as [number, number]),
      });
    }
  });
  return wins;
}

const randomGrid = (): Grid =>
  Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => randomSymbol()));

function losingGrid(): Grid {
  for (let i = 0; i < 1000; i++) {
    const g = randomGrid();
    if (evaluate(g).length === 0) return g;
  }
  return [
    ['J', 'Q', 'K'],
    ['J', 'Q', 'K'],
    ['J', 'Q', 'K'],
  ];
}

/** grid that has exactly ONE winning line made of `symbol` */
function winningGrid(symbol: SymbolId): Grid {
  for (let i = 0; i < 2000; i++) {
    const g = randomGrid();
    const line = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
    const wildCol = Math.floor(Math.random() * 3);
    line.forEach((row, col) => {
      // sometimes a wild helps to complete the line
      g[row][col] = symbol !== 'wild' && col === wildCol && Math.random() < 0.18 ? 'wild' : symbol;
    });
    const w = evaluate(g);
    if (w.length === 1 && w[0].symbol === symbol) return g;
  }
  const filler = SYMBOLS.filter(id => id !== 'wild' && id !== symbol);
  return [[filler[0], filler[1], filler[2]], [symbol, symbol, symbol], [filler[2], filler[0], filler[1]]];
}

export interface SpinResult {
  grid: Grid; // grid[row][col]
  wins: LineWin[];
  isWin: boolean;
  multiplier: number; // multiplier reel centre value
  multReel: number[]; // 3 values top -> bottom (centre = multiplier)
  payMultiplier: number; // total payout as x bet (line pay * multiplier)
}

export function spin(extra = false): SpinResult {
  const isWin = Math.random() < WIN_RATE;
  const multiplier = randomMultiplier(extra);
  const multReel = [randomMultiplier(extra), multiplier, randomMultiplier(extra)];
  if (!isWin) {
    return { grid: losingGrid(), wins: [], isWin: false, multiplier, multReel, payMultiplier: 0 };
  }
  const symbol = pickSym(extra ? WIN_WEIGHTS_EX : WIN_WEIGHTS);
  const m = pickNum(extra ? MULT_WEIGHTS_EX : MULT_WEIGHTS);
  const grid = winningGrid(symbol);
  const wins = evaluate(grid);
  return {
    grid,
    wins,
    isWin: true,
    multiplier: m,
    multReel: [multReel[0], m, multReel[2]],
    payMultiplier: wins.reduce((a, w) => a + w.pay, 0) * m,
  };
}

export const BETS: number[] = [...BET_PRESETS];
export const START_BALANCE = 10000;

export function prepareServerSpin(extra: boolean, won: boolean, baseBet = 100): SpinResult {
  if (!won) {
    const multiplier = randomMultiplier(extra);
    return { grid: losingGrid(), wins: [], isWin: false, multiplier,
      multReel: [randomMultiplier(extra), multiplier, randomMultiplier(extra)], payMultiplier: 0 };
  }
  const cost = extra ? EXTRA_BET_COST : 1;
  const stake = Math.round(baseBet * cost * 100) / 100;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const result = spin(extra);
    const payout = Math.round(result.payMultiplier * baseBet * 100) / 100;
    if (payout > stake && payout <= Math.round(stake * 200) / 100) return result;
  }
  const grid = winningGrid("Q");
  const wins = evaluate(grid);
  const multiplier = 2;
  return { grid, wins, isWin: true, multiplier, multReel: [2, multiplier, 5],
    payMultiplier: wins.reduce((sum, win) => sum + win.pay, 0) * multiplier };
}
