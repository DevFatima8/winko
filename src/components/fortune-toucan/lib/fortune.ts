export type SymbolId =
  | "wild"
  | "mask"
  | "drum"
  | "egg"
  | "feather"
  | "coffee"
  | "leaf";

export type Cell = SymbolId | "blank";

export interface LineWin {
  line: number;
  symbol: SymbolId;
  amount: number;
  cells: number[];
}

export interface SpinResult {
  type: "base" | "feature";
  grid: Cell[];
  wins: LineWin[];
  totalWin: number;
  fullScreen: boolean;
  featureSymbol?: Exclude<SymbolId, "wild">;
  featureSteps?: Cell[][];
}

export const SYMBOL_ORDER: SymbolId[] = [
  "wild",
  "mask",
  "drum",
  "egg",
  "feather",
  "coffee",
  "leaf",
];

export const PAY_SYMBOLS: Exclude<SymbolId, "wild">[] = [
  "mask",
  "drum",
  "egg",
  "feather",
  "coffee",
  "leaf",
];

export const PAYTABLE: Record<SymbolId, number> = {
  wild: 50,
  mask: 20,
  drum: 5,
  egg: 2,
  feather: 1.6,
  coffee: 1,
  leaf: 0.6,
};

export const PAYLINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const LINE_LABELS = [
  "Top row",
  "Middle row",
  "Bottom row",
  "Diagonal ↘",
  "Diagonal ↗",
];

export const BET_SIZES = [0.1, 0.2, 0.5, 1, 2];
export const BET_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const LINES = 5;
export const START_BALANCE = 5000;
export const WIN_RATE = 0.35;

export const SYMBOL_META: Record<
  SymbolId,
  { name: string; src: string; hint: string }
> = {
  wild: {
    name: "Fortune Toucan",
    src: "/images/toucan-mascot.png",
    hint: "Wild — substitutes for every symbol",
  },
  mask: {
    name: "Tribal Mask",
    src: "/images/symbol-mask.png",
    hint: "Highest paying rainforest relic",
  },
  drum: {
    name: "Ceremonial Drum",
    src: "/images/symbol-drum.png",
    hint: "High paying jungle drum",
  },
  egg: {
    name: "Golden Egg",
    src: "/images/symbol-egg.png",
    hint: "Medium paying toucan egg",
  },
  feather: {
    name: "Toucan Feather",
    src: "/images/symbol-feather.png",
    hint: "Colorful medium-low symbol",
  },
  coffee: {
    name: "Coffee Beans",
    src: "/images/symbol-coffee.png",
    hint: "Low paying harvest symbol",
  },
  leaf: {
    name: "Jungle Leaf",
    src: "/images/symbol-leaf.png",
    hint: "Lowest paying tropical leaf",
  },
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function totalBet(size: number, level: number): number {
  return round2(size * level * LINES);
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function allBetCombos(): { size: number; level: number; total: number }[] {
  const combos: { size: number; level: number; total: number }[] = [];
  for (const size of BET_SIZES) {
    for (const level of BET_LEVELS) {
      combos.push({ size, level, total: totalBet(size, level) });
    }
  }
  return combos;
}

export function uniqueTotals(): number[] {
  return Array.from(new Set(allBetCombos().map((c) => c.total))).sort(
    (a, b) => a - b,
  );
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function resolveLine(cells: Cell[]): SymbolId | null {
  if (cells.some((c) => c === "blank")) return null;
  const filled = cells as SymbolId[];
  const nonWild = filled.filter((c) => c !== "wild");
  if (nonWild.length === 0) return "wild";
  const target = nonWild[0];
  return nonWild.every((c) => c === target) ? target : null;
}

export function evaluate(
  grid: Cell[],
  bet: number,
): { wins: LineWin[]; total: number; fullScreen: boolean } {
  const wins: LineWin[] = [];
  const involved = new Set<number>();

  for (let i = 0; i < PAYLINES.length; i++) {
    const idxs = PAYLINES[i]!;
    const symbol = resolveLine(idxs.map((j) => grid[j]!));
    if (!symbol) continue;
    const amount = round2(PAYTABLE[symbol] * bet);
    wins.push({ line: i, symbol, amount, cells: idxs });
    idxs.forEach((j) => involved.add(j));
  }

  let total = round2(wins.reduce((sum, win) => sum + win.amount, 0));
  const fullScreen =
    grid.length === 9 &&
    grid.every((cell) => cell !== "blank") &&
    involved.size === 9 &&
    wins.length > 0;

  if (fullScreen) total = round2(total * 10);
  return { wins, total, fullScreen };
}

function randomPaySymbol(): Exclude<SymbolId, "wild"> {
  const weights: [Exclude<SymbolId, "wild">, number][] = [
    ["leaf", 30],
    ["coffee", 24],
    ["feather", 18],
    ["egg", 14],
    ["drum", 9],
    ["mask", 5],
  ];
  const sum = weights.reduce((s, w) => s + w[1], 0);
  let r = Math.random() * sum;
  for (const [sym, w] of weights) {
    r -= w;
    if (r <= 0) return sym;
  }
  return "leaf";
}

const SAFE_LOSS: SymbolId[] = [
  "leaf",
  "coffee",
  "feather",
  "egg",
  "mask",
  "drum",
  "coffee",
  "leaf",
  "egg",
];

export function generateLosingGrid(): SymbolId[] {
  for (let n = 0; n < 120; n++) {
    const grid: SymbolId[] = Array.from({ length: 9 }, () => randomPaySymbol());
    if (evaluate(grid, 1).total === 0) return grid;
  }

  return SAFE_LOSS.slice();
}

export function prepareServerSpin(bet: number, won: boolean): SpinResult {
  if (!won) {
    const grid = generateLosingGrid();
    return { type: "base", grid, wins: [], totalWin: 0, fullScreen: false };
  }
  const feature = Math.random() < 0.15;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const grid = feature ? null : generateWinningGrid();
    const result: SpinResult = grid
      ? (() => { const ev = evaluate(grid, bet); return { type: "base", grid, wins: ev.wins, totalWin: ev.total, fullScreen: ev.fullScreen }; })()
      : generatePayingFeature(bet);
    if (result.totalWin > bet && result.totalWin <= round2(bet * 2)) return result;
  }
  const grid: Cell[] = ["feather", "feather", "feather", "egg", "mask", "drum", "coffee", "leaf", "egg"];
  const ev = evaluate(grid, bet);
  return { type: "base", grid, wins: ev.wins, totalWin: ev.total, fullScreen: ev.fullScreen };
}

function generateWinningGrid(): SymbolId[] {
  const roll = Math.random();
  if (roll < 0.012) {
    const full = Math.random() < 0.1 ? "wild" : randomPaySymbol();
    return Array.from({ length: 9 }, () => full as SymbolId);
  }

  const grid = generateLosingGrid();
  const line = pick(PAYLINES);

  let symbol: SymbolId;
  const r = Math.random();
  if (r < 0.58) symbol = pick(["leaf", "coffee", "feather"] as const);
  else if (r < 0.84) symbol = pick(["egg", "feather", "coffee"] as const);
  else if (r < 0.95) symbol = pick(["drum", "egg"] as const);
  else if (r < 0.99) symbol = "mask";
  else symbol = "wild";

  for (const idx of line) {
    grid[idx] = symbol !== "wild" && Math.random() < 0.14 ? "wild" : symbol;
  }

  if (evaluate(grid, 1).total === 0) {
    for (const idx of line) grid[idx] = symbol;
  }
  return grid;
}

function generatePayingFeature(bet: number): SpinResult {
  const symbol = randomPaySymbol();
  const steps: Cell[][] = [];
  let grid: Cell[] = Array.from({ length: 9 }, () => "blank");
  const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  grid[order[0]!] = Math.random() < 0.18 ? "wild" : symbol;
  if (Math.random() < 0.55) {
    grid[order[1]!] = Math.random() < 0.2 ? "wild" : symbol;
  }
  steps.push(grid.slice());

  const targetLine = pick(PAYLINES);
  const missing = () => targetLine.filter((i) => grid[i] === "blank");

  let guard = 0;
  while (missing().length > 0 && guard < 7) {
    const next = grid.slice();
    const need = missing();
    const add = Math.min(need.length, Math.random() < 0.45 ? 1 : 2);
    for (let k = 0; k < add; k++) {
      const idx = need[k]!;
      next[idx] = Math.random() < 0.16 ? "wild" : symbol;
    }
    for (let i = 0; i < 9; i++) {
      if (next[i] === "blank" && Math.random() < 0.2) {
        next[i] = Math.random() < 0.12 ? "wild" : symbol;
      }
    }
    grid = next;
    steps.push(grid.slice());
    guard++;
  }

  if (grid.some((c) => c === "blank") && Math.random() < 0.65) {
    steps.push(grid.slice());
  }

  let ev = evaluate(grid, bet);
  if (ev.total <= 0) {
    const forced = grid.slice();
    for (const idx of targetLine) forced[idx] = symbol;
    steps.push(forced);
    grid = forced;
    ev = evaluate(grid, bet);
  }

  return {
    type: "feature",
    grid,
    wins: ev.wins,
    totalWin: ev.total,
    fullScreen: ev.fullScreen,
    featureSymbol: symbol,
    featureSteps: steps,
  };
}

export function playSpin(bet: number): SpinResult {
  const isWin = Math.random() < WIN_RATE;

  if (!isWin) {
    const grid = generateLosingGrid();
    return {
      type: "base",
      grid,
      wins: [],
      totalWin: 0,
      fullScreen: false,
    };
  }

  if (Math.random() < 0.18) {
    return generatePayingFeature(bet);
  }

  const grid = generateWinningGrid();
  let ev = evaluate(grid, bet);
  if (ev.total <= 0) {
    const forced = grid.slice();
    forced[3] = "leaf";
    forced[4] = "leaf";
    forced[5] = "leaf";
    ev = evaluate(forced, bet);
    return {
      type: "base",
      grid: forced,
      wins: ev.wins,
      totalWin: ev.total,
      fullScreen: ev.fullScreen,
    };
  }

  return {
    type: "base",
    grid,
    wins: ev.wins,
    totalWin: ev.total,
    fullScreen: ev.fullScreen,
  };
}

export const INITIAL_GRID: SymbolId[] = [
  "leaf",
  "mask",
  "feather",
  "egg",
  "coffee",
  "drum",
  "coffee",
  "feather",
  "leaf",
];

export function winTier(win: number, bet: number): "none" | "win" | "big" | "super" | "mega" {
  if (win <= 0) return "none";
  const x = win / bet;
  if (x >= 50) return "mega";
  if (x >= 20) return "super";
  if (x >= 8) return "big";
  return "win";
}
