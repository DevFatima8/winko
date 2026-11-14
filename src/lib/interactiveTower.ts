import { randomInt } from "node:crypto";
import { DIFF, ROWS, type Difficulty, type TowerCell, type TowerView } from "./towerRules";
import { InteractiveMoveError, type EngineStep, type InteractiveCardEngine } from "./browserCardInteractiveGames";

type State = TowerView & { win: boolean };
const difficulty = (value: unknown): value is Difficulty => typeof value === "string" && Object.hasOwn(DIFF, value);

function step(state: State, claim?: number): EngineStep<State> {
  const { win: _win, ...view } = state;
  return { state, view, phase: claim === undefined ? "playing" : claim > 0 ? "won" : "lost",
    ...(claim === undefined ? {} : { claim }) };
}

function reveal(state: State) {
  const cfg = DIFF[state.difficulty];
  for (const row of state.board) {
    if (!row.some(cell => cell !== "hidden")) {
      const safe = new Set<number>();
      while (safe.size < cfg.safe) safe.add(randomInt(cfg.cols));
      for (let col = 0; col < cfg.cols; col++) row[col] = safe.has(col) ? "egg-dim" : "dragon-dim";
    }
  }
}

export const towerEngine: InteractiveCardEngine<State> = {
  start({ selection, win }) {
    const value = selection && typeof selection === "object" && "difficulty" in selection ? selection.difficulty : undefined;
    if (!difficulty(value)) throw new InteractiveMoveError("Choose a valid Tower difficulty.");
    return step({ difficulty: value, win, level: 0, board: Array.from({ length: ROWS }, () => Array<TowerCell>(DIFF[value].cols).fill("hidden")) });
  },
  act(saved, move, { selection, stake }) {
    const state = structuredClone(saved);
    const cfg = DIFF[state.difficulty];
    if (move === "cashout") {
      if (state.level === 0) throw new InteractiveMoveError("Reveal at least one safe floor before cashing out.");
      reveal(state);
      return step(state, Math.round(stake * cfg.mults[state.level - 1] * 100) / 100);
    }
    if (move !== "pick") throw new InteractiveMoveError("Choose a Tower cell or cash out.");
    const col = selection && typeof selection === "object" && "col" in selection ? selection.col : undefined;
    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col >= cfg.cols || state.level >= ROWS) {
      throw new InteractiveMoveError("Choose a cell on the current Tower floor.");
    }
    const safe = state.level === 0 ? state.win : randomInt(100) < 35;
    const row = state.board[state.level];
    row[col] = safe ? "egg" : "dragon";
    const others = Array.from({ length: cfg.cols }, (_, index) => index).filter(index => index !== col);
    let remainingSafe = cfg.safe - Number(safe);
    while (others.length) {
      const [index] = others.splice(randomInt(others.length), 1);
      row[index] = remainingSafe-- > 0 ? "egg-dim" : "dragon-dim";
    }
    if (!safe) { reveal(state); return step(state, 0); }
    state.level++;
    if (state.level === ROWS) { reveal(state); return step(state, Math.round(stake * cfg.mults[ROWS - 1] * 100) / 100); }
    return step(state);
  },
};
