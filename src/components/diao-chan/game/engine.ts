import {
  PAYLINES,
  REELS,
  ROWS,
  SYMBOLS,
  scatterInstantPay,
  FREE_SPINS,
  type FreeMode,
  type SymbolId,
} from "./config";

/** Grid is reel-major: grid[reel][row], 5 reels × 3 rows. */
export type Grid = SymbolId[][];

export interface Cell {
  reel: number;
  row: number;
}

export interface LineWin {
  lineIndex: number;
  symbol: SymbolId;
  count: number;
  amount: number;
  cells: Cell[];
  wild: boolean;
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  lineWin: number;
  scatterCount: number;
  scatterCells: Cell[];
  scatterPay: number;
  totalWin: number;
  expandedReels: number[];
}

/* ---------------- weighted random ---------------- */

const BAG: SymbolId[] = (() => {
  const bag: SymbolId[] = [];
  (Object.keys(SYMBOLS) as SymbolId[]).forEach((id) => {
    for (let i = 0; i < SYMBOLS[id].weight; i++) bag.push(id);
  });
  return bag;
})();

function randSym(excludeScatter = false): SymbolId {
  for (let i = 0; i < 8; i++) {
    const s = BAG[(Math.random() * BAG.length) | 0];
    if (!excludeScatter || s !== "scatter") return s;
  }
  return "N";
}

export function emptyGrid(fill: SymbolId = "N"): Grid {
  return Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, () => fill),
  );
}

/** Random grid with scatter count capped (loss spins use cap 1 → never trigger). */
export function randomGrid(scatterCap = 5): Grid {
  const g = emptyGrid();
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++) g[r][row] = randSym();

  const found: Cell[] = [];
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++)
      if (g[r][row] === "scatter") found.push({ reel: r, row });

  while (found.length > scatterCap) {
    const c = found.splice((Math.random() * found.length) | 0, 1)[0];
    g[c.reel][c.row] = randSym(true);
  }
  return g;
}

/* ---------------- evaluation ---------------- */

export function evaluate(
  grid: Grid,
  lineBet: number,
  wildMult = 1,
): {
  lineWins: LineWin[];
  lineWin: number;
  scatterCount: number;
  scatterCells: Cell[];
} {
  const lineWins: LineWin[] = [];
  let lineWin = 0;
  const scatterCells: Cell[] = [];

  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++)
      if (grid[r][row] === "scatter") scatterCells.push({ reel: r, row });

  PAYLINES.forEach((pattern, lineIndex) => {
    const line: SymbolId[] = pattern.map((row, reel) => grid[reel][row]);

    let target: SymbolId | null = null;
    let count = 0;
    let wild = false;

    for (let i = 0; i < REELS; i++) {
      const s = line[i];
      if (s === "scatter") break;
      if (s === "wild") {
        wild = true;
        count++;
        continue;
      }
      if (target === null) {
        target = s;
        count++;
        continue;
      }
      if (s === target) {
        count++;
        continue;
      }
      break;
    }

    if (target === null) target = "wild"; // all wilds
    const meta = SYMBOLS[target];
    if (count < meta.min) return;
    const mult = meta.pays[count as 2 | 3 | 4 | 5] ?? 0;
    if (mult <= 0) return;

    let amount = mult * lineBet;
    if (wild && wildMult > 1) amount *= wildMult;
    lineWin += amount;
    lineWins.push({
      lineIndex,
      symbol: target,
      count,
      amount,
      wild,
      cells: pattern.slice(0, count).map((row, reel) => ({ reel, row })),
    });
  });

  return { lineWins, lineWin, scatterCount: scatterCells.length, scatterCells };
}


function injectScatters(grid: Grid, n: number) {
  const positions: Cell[] = [];
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++) positions.push({ reel: r, row });
  for (let i = 0; i < n && positions.length; i++) {
    const c = positions.splice((Math.random() * positions.length) | 0, 1)[0];
    grid[c.reel][c.row] = "scatter";
  }
}

const LOWS: SymbolId[] = ["N", "T", "J", "Q", "K", "A"];
const MIDS: SymbolId[] = ["lotus", "rings", "soldier"];
const HIGHS: SymbolId[] = ["dong", "lubu"];

function pickForceSymbol(): SymbolId {
  const r = Math.random();
  const pool = r < 0.55 ? LOWS : r < 0.8 ? MIDS : HIGHS;
  return pool[(Math.random() * pool.length) | 0];
}

function pickForceCount(): number {
  const r = Math.random();
  if (r < 0.68) return 3;
  if (r < 0.9) return 4;
  return 5;
}

/** Guarantee at least one paying line (small wins biased for sane RTP). */
export function forceWin(grid: Grid, lineBet: number, wildMult = 1): Grid {
  const g = grid.map((col) => [...col]);
  const order = PAYLINES.map((_, i) => i).sort(() => Math.random() - 0.5);

  for (const li of order) {
    const pattern = PAYLINES[li];
    const sym = pickForceSymbol();
    const count = pickForceCount();
    let ok = true;
    for (let i = 0; i < count; i++) {
      if (g[i][pattern[i]] === "scatter") {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (let i = 0; i < count; i++) {
      g[i][pattern[i]] = Math.random() < 0.12 && i > 0 ? "wild" : sym;
    }
    if (evaluate(g, lineBet, wildMult).lineWin > 0) return g;
  }

  g[0][1] = "lubu";
  g[1][1] = "lubu";
  g[2][1] = "lubu";
  return g;
}

const BREAKER_EVEN: SymbolId[] = ["N", "Q", "K"];
const BREAKER_ODD: SymbolId[] = ["T", "J", "A"];

/** Provably win-free grid: even/odd reels use disjoint low sets → every line breaks at reel 1. */
export function lossFallbackGrid(): Grid {
  const g = emptyGrid();
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++) {
      const pool = r % 2 === 0 ? BREAKER_EVEN : BREAKER_ODD;
      g[r][row] = pool[(row + r) % pool.length];
    }
  return g;
}

/** Remove every paying line (base-game loss spins). */
export function stripWins(grid: Grid, lineBet: number): Grid {
  const g = grid.map((col) => [...col]);
  for (let guard = 0; guard < 40; guard++) {
    const ev = evaluate(g, lineBet, 1);
    if (ev.lineWin <= 0) return g;
    for (const w of ev.lineWins) {
      const cell = w.cells[(Math.random() * w.cells.length) | 0];
      const pool = (cell.reel % 2 === 0 ? BREAKER_EVEN : BREAKER_ODD).filter(
        (s) => s !== w.symbol,
      );
      g[cell.reel][cell.row] = pool[(Math.random() * pool.length) | 0];
    }
  }
  // Absolute guarantee fallback (keeps up to 1 scatter visuals out — pure loss).
  return lossFallbackGrid();
}

/* ---------------- free-spins modifiers ---------------- */

export function applyExpandingWilds(grid: Grid): { grid: Grid; expanded: number[] } {
  const g = grid.map((col) => [...col]);
  const expanded: number[] = [];
  for (let r = 0; r < REELS; r++) {
    if (g[r].includes("wild")) {
      g[r] = ["wild", "wild", "wild"];
      expanded.push(r);
    }
  }
  return { grid: g, expanded };
}

export function applyLubuMagic(grid: Grid, sticky: Cell[]): Grid {
  const g = grid.map((col) => [...col]);
  for (const s of sticky) g[s.reel][s.row] = "lubu";
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++) {
      const s = g[r][row];
      if ((s === "soldier" || s === "dong") && Math.random() < 0.45) {
        g[r][row] = "lubu";
      }
    }
  let lubuCount = 0;
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++) if (g[r][row] === "lubu") lubuCount++;
  if (lubuCount >= 4) {
    for (let r = 0; r < REELS; r++)
      for (let row = 0; row < ROWS; row++) {
        const s = g[r][row];
        if ((s === "T" || s === "N" || s === "J") && Math.random() < 0.6) {
          g[r][row] = "lubu";
        }
      }
  }
  return g;
}

export function rollLubuSticky(): Cell[] {
  const rows = [0, 1, 2].sort(() => Math.random() - 0.5);
  const n = 1 + ((Math.random() * 2) | 0); // 1–2 sticky cells on reel 1
  return rows.slice(0, n).map((row) => ({ reel: 0, row }));
}

/* ---------------- main spin entry ---------------- */

export interface SpinOpts {
  wantWin: boolean;
  lineBet: number;
  totalBet: number;
  mode: FreeMode | null;
  sticky: Cell[];
  winSymbol?: SymbolId | null;
}

/** Base-game outcome per 100 spins: 7 Ten, 7 Nine, 4 Queen, 2 Jack wins; the other 80 are no-win. */
export function rollBaseOutcome(): SymbolId | null {
  const r = Math.random() * 100;
  if (r < 7) return "T";
  if (r < 14) return "N";
  if (r < 18) return "Q";
  if (r < 20) return "J";
  return null;
}

function symbolWinGrid(symbol: SymbolId, lineBet: number): Grid {
  for (let attempt = 0; attempt < 40; attempt++) {
    const base = attempt < 39 ? stripWins(randomGrid(1), lineBet) : lossFallbackGrid();
    const pattern = attempt < 39 ? PAYLINES[(Math.random() * PAYLINES.length) | 0] : PAYLINES[0];
    const count = pickForceCount();
    for (let i = 0; i < count; i++) base[i][pattern[i]] = symbol;
    const ev = evaluate(base, lineBet, 1);
    if (ev.lineWin > 0 && ev.scatterCount < 2 && ev.lineWins.every((w) => w.symbol === symbol && !w.wild)) return base;
  }
  const g = lossFallbackGrid();
  for (let i = 0; i < 3; i++) g[i][1] = symbol;
  return g;
}

const money = (amount: number) => Math.round(amount * 100) / 100;

function preparedResult(grid: Grid, stake: number, mode: FreeMode | null = null): SpinResult {
  const expandedReels = mode === "diaochan"
    ? grid.flatMap((col, reel) => col.every(symbol => symbol === "wild") ? [reel] : [])
    : [];
  const ev = evaluate(grid, stake / 30, mode === "dongzhuo" ? 4 : 1);
  const scatterPay = scatterInstantPay(ev.scatterCount, stake);
  return { grid, ...ev, scatterPay, totalWin: money(ev.lineWin + scatterPay), expandedReels };
}

export function prepareServerSpin(stake: number, won: boolean, mode: FreeMode | null = null): SpinResult {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const spin = generateSpin({ wantWin: won, lineBet: stake / 30, totalBet: stake, mode,
      sticky: mode === "lubu" ? rollLubuSticky() : [] });
    const total = money(spin.totalWin);
    if (spin.scatterCount < 2 && (won ? total > stake && total <= money(stake * 2) : total === 0)) {
      return { ...spin, totalWin: total };
    }
  }
  const grid = lossFallbackGrid();
  if (won) {
    // Two three-soldier lines and five two-soldier lines pay exactly 2×.
    grid[0] = ["soldier", "soldier", mode === "lubu" ? "lubu" : "K"];
    grid[1] = ["T", "soldier", "A"];
    grid[2] = ["K", "soldier", "Q"];
  }
  return preparedResult(grid, stake, mode);
}

export interface ServerSequence {
  spin: SpinResult;
  freeModes: Partial<Record<FreeMode, SpinResult[]>>;
  singleMode?: FreeMode;
}

export function prepareServerSequence(stake: number, won: boolean): ServerSequence {
  const featureRoll = Math.random();
  if (!won || featureRoll >= 0.2) return { spin: prepareServerSpin(stake, won), freeModes: {} };
  const grid = lossFallbackGrid();
  if (featureRoll < 0.08) {
    grid[4][0] = "scatter";
    grid[4][1] = "scatter";
    const modes: FreeMode[] = ["diaochan", "dongzhuo", "lubu"];
    const singleMode = modes[Math.floor(Math.random() * modes.length)];
    return { spin: preparedResult(grid, stake), singleMode,
      freeModes: { [singleMode]: [prepareServerSpin(stake, true, singleMode)] } };
  }
  grid[4] = ["scatter", "scatter", "scatter"];
  const spin = preparedResult(grid, stake);
  // Three scatters naturally pay the entire 2× budget. Mode choices retain their
  // complete free-spin animations, but cannot create another funded outcome.
  const freeModes: ServerSequence["freeModes"] = {};
  for (const mode of ["diaochan", "dongzhuo", "lubu"] as const) {
    freeModes[mode] = Array.from({ length: FREE_SPINS[mode].spins }, () => prepareServerSpin(stake, false, mode));
  }
  return { spin, freeModes };
}

export function generateSpin(o: SpinOpts): SpinResult {
  const wildMult = o.mode === "dongzhuo" ? 4 : 1;

  if (!o.mode && o.winSymbol) {
    const grid = symbolWinGrid(o.winSymbol, o.lineBet);
    const ev = evaluate(grid, o.lineBet, 1);
    return {
      grid,
      lineWins: ev.lineWins,
      lineWin: ev.lineWin,
      scatterCount: ev.scatterCount,
      scatterCells: ev.scatterCells,
      scatterPay: 0,
      totalWin: ev.lineWin,
      expandedReels: [],
    };
  }

  if (o.wantWin) {
    let grid = randomGrid(5);
    // Occasionally inject a scatter trigger on base-game win spins (~9%).
    if (!o.mode && Math.random() < 0.09) {
      injectScatters(grid, Math.random() < 0.8 ? 3 : 4);
    }
    if (o.mode === "lubu") grid = applyLubuMagic(grid, o.sticky);
    let expanded: number[] = [];
    if (o.mode === "diaochan") {
      const r = applyExpandingWilds(grid);
      grid = r.grid;
      expanded = r.expanded;
    }
    let ev = evaluate(grid, o.lineBet, wildMult);
    if (ev.lineWin + scatterInstantPay(ev.scatterCount, o.totalBet) <= 0) {
      grid = forceWin(grid, o.lineBet, wildMult);
      if (o.mode === "diaochan") {
        const r = applyExpandingWilds(grid);
        grid = r.grid;
        expanded = r.expanded;
      }
      ev = evaluate(grid, o.lineBet, wildMult);
    }
    const scatterPay = scatterInstantPay(ev.scatterCount, o.totalBet);
    return {
      grid,
      lineWins: ev.lineWins,
      lineWin: ev.lineWin,
      scatterCount: ev.scatterCount,
      scatterCells: ev.scatterCells,
      scatterPay,
      totalWin: ev.lineWin + scatterPay,
      expandedReels: expanded,
    };
  }

  // ---- loss spin: base game guarantees zero win + max 1 scatter ----
  let grid = randomGrid(1);
  if (o.mode === "lubu") grid = applyLubuMagic(grid, o.sticky);
  let expanded: number[] = [];
  if (o.mode === "diaochan") {
    const r = applyExpandingWilds(grid);
    grid = r.grid;
    expanded = r.expanded;
  }
  if (!o.mode) grid = stripWins(grid, o.lineBet);
  const ev = evaluate(grid, o.lineBet, wildMult);
  const scatterPay = scatterInstantPay(ev.scatterCount, o.totalBet);
  return {
    grid,
    lineWins: ev.lineWins,
    lineWin: ev.lineWin,
    scatterCount: ev.scatterCount,
    scatterCells: ev.scatterCells,
    scatterPay,
    totalWin: ev.lineWin + scatterPay,
    expandedReels: expanded,
  };
}
