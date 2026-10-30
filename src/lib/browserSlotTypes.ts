import { evaluate as evaluateOx, SYMBOLS as OX_SYMBOLS, type SpinResult as OxSpin } from "@/components/fortune-ox/lib/fortuneOx";
import { evaluate as evaluateGems, SYMBOLS as GEM_SYMBOLS, MULTIPLIERS, type SpinResult as GemsSpin } from "@/components/fortune-gems/game/logic";
import { evaluate as evaluateToucan, SYMBOL_ORDER, type SpinResult as ToucanSpin } from "@/components/fortune-toucan/lib/fortune";
import { evaluate as evaluateGates, REGULAR_SYMBOLS, type SpinResult as GatesSpin } from "@/components/gates-of-olympus/game/engine";
import { evaluate as evaluateDiao, type SpinResult as DiaoSpin, type ServerSequence } from "@/components/diao-chan/game/engine";
import { FREE_SPINS, SYMBOLS as DIAO_SYMBOLS, scatterInstantPay, type FreeMode } from "@/components/diao-chan/game/config";

type Envelope<G extends string> = { game: G; stake: number; payout: number };
export interface BrowserSlotOutcomes {
  "fortune-ox": Envelope<"fortune-ox"> & { spin: OxSpin };
  "fortune-gems": Envelope<"fortune-gems"> & { spin: GemsSpin; extra: boolean; baseBet: number };
  "fortune-toucan": Envelope<"fortune-toucan"> & { spin: ToucanSpin };
  "gates-of-olympus": Envelope<"gates-of-olympus"> & { spins: GatesSpin[] };
  "diao-chan": Envelope<"diao-chan"> & ServerSequence;
}
export type BrowserSlotGame = keyof BrowserSlotOutcomes;
export type BrowserSlotOutcome = BrowserSlotOutcomes[BrowserSlotGame];
export type BrowserSlotSelection = { extra?: boolean; baseBet?: number };
const money = (n: number) => Math.round(n * 100) / 100;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const grid = (value: unknown, cols: number, rows: number, symbols: readonly string[]): value is string[][] =>
  Array.isArray(value) && value.length === cols && value.every(col =>
    Array.isArray(col) && col.length === rows && col.every(symbol => symbols.includes(symbol)));
const flatGrid = (value: unknown, length: number, symbols: readonly string[]): value is string[] =>
  Array.isArray(value) && value.length === length && value.every(symbol => symbols.includes(symbol));

/** Re-evaluate the exact visible reels; malformed or unsupported money never animates. */
export function readBrowserSlotOutcome<G extends BrowserSlotGame>(
  game: G, value: unknown, stake: number,
): BrowserSlotOutcomes[G] | null {
  try {
    if (!value || typeof value !== "object") return null;
    const outcome = value as BrowserSlotOutcome;
    if (outcome.game !== game || outcome.stake !== stake || !Number.isFinite(outcome.payout) ||
        outcome.payout < 0 || outcome.payout > money(stake * 2) || money(outcome.payout) !== outcome.payout) return null;
    switch (outcome.game) {
      case "fortune-ox": {
        const spin = outcome.spin;
        if (!grid(spin.grid, 3, 3, Object.keys(OX_SYMBOLS))) return null;
        const ev = evaluateOx(spin.grid, stake / 10);
        if (!same(spin.wins, ev.wins) || spin.total !== ev.total || spin.fullWild !== ev.fullWild ||
            spin.multiplier !== ev.multiplier || outcome.payout !== ev.total) return null;
        break;
      }
      case "fortune-gems": {
        const spin = outcome.spin;
        if (!grid(spin.grid, 3, 3, GEM_SYMBOLS) || typeof outcome.extra !== "boolean" ||
            !Number.isFinite(outcome.baseBet) || money(outcome.baseBet * (outcome.extra ? 1.5 : 1)) !== stake ||
            !MULTIPLIERS.includes(spin.multiplier) || !Array.isArray(spin.multReel) ||
            spin.multReel.length !== 3 || !spin.multReel.every(mult => MULTIPLIERS.includes(mult)) ||
            spin.multReel[1] !== spin.multiplier) return null;
        const wins = evaluateGems(spin.grid);
        const pay = wins.reduce((sum, win) => sum + win.pay, 0) * spin.multiplier;
        if (!same(wins, spin.wins) || spin.payMultiplier !== pay || spin.isWin !== (pay > 0) ||
            outcome.payout !== money(pay * outcome.baseBet)) return null;
        break;
      }
      case "fortune-toucan": {
        const spin = outcome.spin;
        if (!flatGrid(spin.grid, 9, [...SYMBOL_ORDER, "blank"])) return null;
        const ev = evaluateToucan(spin.grid, stake);
        if (!same(spin.wins, ev.wins) || spin.totalWin !== ev.total || spin.fullScreen !== ev.fullScreen ||
            outcome.payout !== ev.total || !["base", "feature"].includes(spin.type)) return null;
        if (spin.type === "feature") {
          if (!spin.featureSymbol || !SYMBOL_ORDER.includes(spin.featureSymbol) || !Array.isArray(spin.featureSteps) ||
              !spin.featureSteps.length || !spin.featureSteps.every(step => flatGrid(step, 9, [...SYMBOL_ORDER, "blank"])) ||
              !same(spin.featureSteps.at(-1), spin.grid)) return null;
          for (let i = 1; i < spin.featureSteps.length; i++) {
            if (spin.featureSteps[i - 1].some((symbol, cell) => symbol !== "blank" && spin.featureSteps![i][cell] !== symbol)) return null;
          }
        }
        break;
      }
      case "gates-of-olympus": {
        if (!Array.isArray(outcome.spins) || ![1, 7].includes(outcome.spins.length)) return null;
        let total = 0;
        for (const [index, spin] of outcome.spins.entries()) {
          if (!Array.isArray(spin.grid) || spin.grid.length !== 30 || !spin.grid.every(cell =>
            cell && typeof cell.id === "string" && [...REGULAR_SYMBOLS, "bolt"].includes(cell.symbol) &&
            (cell.multiplier === undefined || [2, 3, 5, 10].includes(cell.multiplier)))) return null;
          const ev = evaluateGates(spin.grid, stake);
          const matching = spin.grid.filter(cell => cell.symbol === spin.winner);
          if (ev.amount !== spin.amount || spin.bonus !== ev.bonus || ev.winners.length > 1 ||
              spin.winner !== (ev.winners[0] ?? null) || spin.count !== matching.length ||
              spin.multiplier !== (matching.reduce((sum, cell) => sum + (cell.multiplier ?? 0), 0) || 1) ||
              spin.bonus !== (index === 0 && outcome.spins.length === 7)) return null;
          total += spin.amount;
        }
        if (money(total) !== outcome.payout) return null;
        break;
      }
      case "diao-chan": {
        const valid = (spin: DiaoSpin, mode: FreeMode | null) => {
          if (!grid(spin.grid, 5, 3, Object.keys(DIAO_SYMBOLS))) return false;
          const ev = evaluateDiao(spin.grid, stake / 30, mode === "dongzhuo" ? 4 : 1);
          const scatterPay = scatterInstantPay(ev.scatterCount, stake);
          return same(spin.lineWins, ev.lineWins) && spin.lineWin === ev.lineWin && spin.scatterCount === ev.scatterCount &&
            same(spin.scatterCells, ev.scatterCells) && spin.scatterPay === scatterPay &&
            spin.totalWin === money(ev.lineWin + scatterPay) && Array.isArray(spin.expandedReels) &&
            spin.expandedReels.every(reel => Number.isInteger(reel) && reel >= 0 && reel < 5 && spin.grid[reel].every(symbol => symbol === "wild"));
        };
        if (!valid(outcome.spin, null) || !outcome.freeModes || typeof outcome.freeModes !== "object") return null;
        if (outcome.spin.scatterCount >= 3) {
          if (outcome.spin.scatterCount !== 3 || outcome.singleMode) return null;
          for (const mode of ["diaochan", "dongzhuo", "lubu"] as const) {
            const spins = outcome.freeModes[mode];
            if (!Array.isArray(spins) || spins.length !== FREE_SPINS[mode].spins ||
                !spins.every(spin => valid(spin, mode) && spin.scatterCount < 2) ||
                money(outcome.spin.totalWin + spins.reduce((sum, spin) => sum + spin.totalWin, 0)) !== outcome.payout) return null;
          }
        } else if (outcome.spin.scatterCount === 2) {
          const mode = outcome.singleMode;
          if (!mode || !["diaochan", "dongzhuo", "lubu"].includes(mode) ||
              Object.keys(outcome.freeModes).length !== 1) return null;
          const spins = outcome.freeModes[mode];
          if (!Array.isArray(spins) || spins.length !== 1 || !valid(spins[0], mode) || spins[0].scatterCount >= 2 ||
              money(outcome.spin.totalWin + spins[0].totalWin) !== outcome.payout) return null;
        } else if (outcome.singleMode || Object.keys(outcome.freeModes).length ||
            outcome.spin.totalWin !== outcome.payout) return null;
        break;
      }
    }
    return outcome as BrowserSlotOutcomes[G];
  } catch {
    return null;
  }
}
