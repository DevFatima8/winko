export type GameResultNotice = {
  game: string;
  id?: string;
  win: number;
  won: boolean;
  bet?: number;
  poolPending?: boolean;
  poolClaim?: number;
};

export const LEGACY_RESULT_GAMES: readonly string[] = [
  "aviator", "aviator-x", "chicken-road-2", "chicken-dash", "dragon-tiger",
  "andar-bahar", "mines", "limbo", "plinko", "lucky-777",
];

export function notifyGameResult(game: string, id: string, amount: number, poolPending = false) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid game result amount.");
  const claim = Math.round(amount * 100) / 100;
  window.dispatchEvent(new CustomEvent<GameResultNotice>("wx:game-result", {
    detail: { game, id, win: poolPending ? 0 : claim, won: claim > 0, poolPending, poolClaim: claim },
  }));
}
