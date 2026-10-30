
export type SymbolId = "WILD" | "SYCEE" | "FIRECRACKER" | "ORANGE" | "ENVELOPE" | "A" | "K" | "Q" | "J";

export interface SymbolDef {
  id: SymbolId;
  name: string;
  glyph: string;
  color: string;
  bg: string;
  pay3: number; // multiplier of (bet per line)
  weight: number;
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  WILD: { id: "WILD", name: "Wild Ox", glyph: "🐂", color: "#ffe28a", bg: "linear-gradient(160deg,#ffd76a,#b8860b)", pay3: 100, weight: 2 },
  SYCEE: { id: "SYCEE", name: "Gold Sycee", glyph: "🪙", color: "#ffd700", bg: "linear-gradient(160deg,#ffe9a3,#d4a017)", pay3: 100, weight: 3 },
  FIRECRACKER: { id: "FIRECRACKER", name: "Firecrackers", glyph: "🧨", color: "#ff4d4d", bg: "linear-gradient(160deg,#ff7a7a,#b00000)", pay3: 50, weight: 4 },
  ORANGE: { id: "ORANGE", name: "Orange", glyph: "🍊", color: "#ffa033", bg: "linear-gradient(160deg,#ffc266,#e07000)", pay3: 25, weight: 5 },
  ENVELOPE: { id: "ENVELOPE", name: "Red Envelope", glyph: "🧧", color: "#ff6b6b", bg: "linear-gradient(160deg,#ff8a8a,#c00c0c)", pay3: 10, weight: 6 },
  A: { id: "A", name: "A", glyph: "A", color: "#ffb3c6", bg: "linear-gradient(160deg,#ff7aa8,#9b0d3f)", pay3: 5, weight: 8 },
  K: { id: "K", name: "K", glyph: "K", color: "#b3e0ff", bg: "linear-gradient(160deg,#5fb6ff,#0b3c8c)", pay3: 5, weight: 8 },
  Q: { id: "Q", name: "Q", glyph: "Q", color: "#c9ffb3", bg: "linear-gradient(160deg,#8be36a,#1f6b14)", pay3: 2, weight: 9 },
  J: { id: "J", name: "J", glyph: "J", color: "#e2c4ff", bg: "linear-gradient(160deg,#b98cff,#4a1c8c)", pay3: 2, weight: 9 },
};

export const SYMBOL_LIST = Object.values(SYMBOLS);
const NON_WILD = SYMBOL_LIST.filter((s) => s.id !== "WILD");

// Grid is grid[reel][row] with reel 0..2 and row 0..2
export type Grid = SymbolId[][];

// 10 paylines (row index per reel) — same layout as Fortune Ox
export const PAYLINES: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
  [0, 0, 1],
  [2, 2, 1],
  [1, 0, 0],
  [1, 2, 2],
  [1, 0, 1],
];

export const LINES = PAYLINES.length;
export const BET_SIZES = [0.1, 0.2, 0.3, 0.5, 0.9, 1, 2, 3, 5, 10];
export const BET_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const totalBet = (size: number, level: number) => +(size * level * LINES).toFixed(2);

export interface LineWin {
  line: number;
  symbol: SymbolId;
  positions: [number, number][]; // [reel,row]
  amount: number;
}

export interface SpinResult {
  grid: Grid;
  wins: LineWin[];
  total: number;
  fullWild: boolean;
  multiplier: number;
}

const rnd = (n: number) => Math.floor(Math.random() * n);

function weightedPick(list: SymbolDef[]): SymbolId {
  const sum = list.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * sum;
  for (const s of list) {
    r -= s.weight;
    if (r <= 0) return s.id;
  }
  return list[list.length - 1].id;
}

export function randomGrid(): Grid {
  return [0, 1, 2].map(() => [0, 1, 2].map(() => weightedPick(SYMBOL_LIST)));
}

export function evaluate(grid: Grid, lineBet: number): { wins: LineWin[]; total: number; fullWild: boolean; multiplier: number } {
  const wins: LineWin[] = [];
  PAYLINES.forEach((rows, li) => {
    const syms = rows.map((r, reel) => grid[reel][r]);
    const base = syms.find((s) => s !== "WILD");
    const all = syms.every((s) => s === "WILD" || s === base);
    if (all) {
      const sym: SymbolId = base ?? "WILD";
      wins.push({
        line: li,
        symbol: sym,
        positions: rows.map((r, reel) => [reel, r] as [number, number]),
        amount: +(SYMBOLS[sym].pay3 * lineBet).toFixed(2),
      });
    }
  });
  const fullWild = grid.every((reel) => reel.every((s) => s === "WILD"));
  const multiplier = fullWild ? 10 : 1;
  const total = +(wins.reduce((a, w) => a + w.amount, 0) * multiplier).toFixed(2);
  return { wins, total, fullWild, multiplier };
}

function makeLosingGrid(): Grid {
  for (let i = 0; i < 200; i++) {
    const g = [0, 1, 2].map(() => [0, 1, 2].map(() => weightedPick(NON_WILD)));
    if (evaluate(g, 1).total === 0) return g;
  }
  // deterministic fallback
  return [
    ["A", "K", "Q"],
    ["J", "A", "K"],
    ["Q", "J", "ORANGE"],
  ];
}

function makeWinningGrid(): Grid {
  // bias toward small wins so the game looks natural
  const r = Math.random();
  const pool: SymbolId[] =
    r < 0.5 ? ["J", "Q", "K", "A"] : r < 0.8 ? ["ENVELOPE", "ORANGE"] : r < 0.95 ? ["FIRECRACKER", "SYCEE"] : ["WILD"];
  const sym = pool[rnd(pool.length)];
  const line = PAYLINES[rnd(PAYLINES.length)];
  const g = makeLosingGrid();
  line.forEach((row, reel) => {
    g[reel][row] = sym;
  });
  // occasionally add a wild into the line
  if (sym !== "WILD" && Math.random() < 0.2) {
    const reel = rnd(3);
    g[reel][line[reel]] = "WILD";
  }
  // tiny chance of full wild (10x)
  if (sym === "WILD" && Math.random() < 0.15) {
    return [0, 1, 2].map(() => ["WILD", "WILD", "WILD"] as SymbolId[]);
  }
  return g;
}

export const WIN_RATE = 0.35;

export function spin(lineBet: number): SpinResult {
  const win = Math.random() < WIN_RATE;
  const grid = win ? makeWinningGrid() : makeLosingGrid();
  const ev = evaluate(grid, lineBet);
  return { grid, ...ev };
}

export function prepareServerSpin(stake: number, won: boolean): SpinResult {
  const lineBet = stake / LINES;
  if (!won) {
    const grid = makeLosingGrid();
    return { grid, ...evaluate(grid, lineBet) };
  }
  for (let attempt = 0; attempt < 2000; attempt++) {
    const grid = makeWinningGrid();
    const result = { grid, ...evaluate(grid, lineBet) };
    if (result.total > stake && result.total <= Math.round(stake * 200) / 100) return result;
  }
  const grid: Grid = [["ENVELOPE", "J", "A"], ["ENVELOPE", "J", "K"], ["ENVELOPE", "J", "Q"]];
  return { grid, ...evaluate(grid, lineBet) };
}
