import { randomInt } from "node:crypto";
import { cents } from "./dailyPool";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { nextPlayerWin } from "./playerWinCycle";

export class RemainingDealCardError extends Error {}

export const REMAINING_DEAL_CARD_GAMES = [
  "amar-akbar-anthony", "bollywood-casino", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker",
] as const;

export const isRemainingDealCardGame = (game: string) =>
  REMAINING_DEAL_CARD_GAMES.some(value => value === game);

function allocation(selection: unknown, keys: readonly string[], stake: number): Record<string, number> {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new RemainingDealCardError("Choose your card bets.");
  const bets = (selection as { bets?: unknown }).bets;
  if (!bets || typeof bets !== "object" || Array.isArray(bets) ||
      Object.keys(bets).some(key => !keys.includes(key))) throw new RemainingDealCardError("Invalid card bet allocation.");
  const entries = keys.map(key => [key, (bets as Record<string, unknown>)[key]] as const);
  if (entries.some(([, amount]) => typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || cents(amount) / 100 !== amount) ||
      entries.reduce((sum, [, amount]) => sum + cents(amount as number), 0) !== cents(stake) || stake <= 0) {
    throw new RemainingDealCardError("Card bets must match the accepted stake exactly.");
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function compatible<T>(options: T[], claim: (option: T) => number, stake: number) {
  const wins = options.filter(option => cents(claim(option)) > cents(stake));
  const losses = options.filter(option => cents(claim(option)) === 0);
  if (!wins.length || !losses.length) throw new RemainingDealCardError(
    "This bet allocation covers every outcome or cannot produce a net win. Clear or undo bets and leave a losing outcome available for the 10-in-100 card cycle.",
  );
  return { wins, losses };
}

export async function serverRemainingDealCardOutcome(
  tx: MultiplayerTransaction, userId: string, game: string, stake: number, selection: unknown,
) {
  if (game === "amar-akbar-anthony") {
    const keys = ["amar", "akbar", "anthony"] as const;
    const bets = allocation(selection, keys, stake);
    const claim = (key: typeof keys[number]) => cents(bets[key] * 3) / 100;
    const options = compatible([...keys], claim, stake);
    const playerWins = await nextPlayerWin(tx, game, userId);
    const choices = playerWins ? options.wins : options.losses;
    const win = choices[randomInt(choices.length)];
    const payout = claim(win);
    const rank = ["A", "K", "Q", "J", "10", "9", "8", "7"][randomInt(8)];
    return { claim: payout, outcome: { win, playerWins, rank, payout } };
  }
  if (game === "bollywood-casino") {
    const bets = allocation(selection, ["andar", "bahar", "joker"], stake);
    const engine = await import("@/components/bollywood-casino/lib/engine");
    const claim = (key: "andar" | "bahar" | "joker") => cents(bets[key] * (key === "joker" ? 12 : 2)) / 100;
    const options = compatible(["andar", "bahar", "joker"] as const, claim, stake);
    const won = await nextPlayerWin(tx, game, userId);
    const choices = won ? options.wins : options.losses;
    const winner = choices[randomInt(choices.length)];
    const hand = engine.buildHand(winner === "joker" ? "bahar" : winner, winner === "joker");
    const payout = claim(winner);
    return { claim: payout, outcome: { ...hand, payout } };
  }
  if (game === "teen-patti-hukam") {
    const bets = allocation(selection, ["A", "B"], stake);
    const engine = await import("@/components/teen-patti-hukam/lib/hukam");
    const claim = (key: "A" | "B") => cents(bets[key] * 1.98) / 100;
    const options = compatible(["A", "B"] as const, claim, stake);
    const won = await nextPlayerWin(tx, game, userId);
    const choices = won ? options.wins : options.losses;
    const winner = choices[randomInt(choices.length)];
    const round = engine.makeRound(winner);
    const payout = claim(winner);
    return { claim: payout, outcome: { ...round, payout } };
  }
  if (game === "teen-patti-joker") {
    const allocationBets = allocation(selection, ["player", "dealer", "tie"], stake);
    const bets = { player: allocationBets.player, dealer: allocationBets.dealer, tie: allocationBets.tie };
    const engine = await import("@/components/teen-patti-joker/lib/teen-patti");
    const claim = (key: "player" | "dealer" | "tie") => cents(engine.returnsForOutcome(bets, key)) / 100;
    const options = compatible(["player", "dealer", "tie"] as const, claim, stake);
    const won = await nextPlayerWin(tx, game, userId);
    const choices = won ? options.wins : options.losses;
    const winner = choices[randomInt(choices.length)];
    const round = engine.buildRound(winner);
    const payout = claim(winner);
    return { claim: payout, outcome: { ...round, payout } };
  }
  if (game === "teen-patti-faceoff") {
    const engine = await import("@/components/teen-patti-faceoff/lib/teenpatti");
    const bets = allocation(selection, engine.BET_SPOTS, stake) as import("@/components/teen-patti-faceoff/lib/teenpatti").Bets;
    if (bets.A > 0 && bets.B > 0) throw new RemainingDealCardError("Both main hands cover every outcome. Undo one main bet before dealing the 30-in-100 card cycle.");
    type Card = import("@/components/teen-patti-faceoff/lib/teenpatti").Card;
    const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit, id: `${rank}${suit}` });
    const fixtures = [
      { handA: [card(2, "S"), card(5, "H"), card(9, "C")], handB: [card(2, "H"), card(5, "C"), card(9, "D")] },
      { handA: [card(14, "S"), card(14, "H"), card(14, "D")], handB: [card(13, "S"), card(13, "H"), card(13, "D")] },
      { handA: [card(10, "S"), card(11, "S"), card(12, "S")], handB: [card(13, "S"), card(14, "S"), card(2, "H")] },
    ];
    let win: ReturnType<typeof engine.settle> | undefined;
    let loss: ReturnType<typeof engine.settle> | undefined;
    for (let attempt = 0; attempt < 3000 && (!win || !loss); attempt++) {
      const deal = attempt < fixtures.length ? fixtures[attempt] : engine.randomDeal();
      const result = engine.settle(deal.handA, deal.handB, bets);
      if (cents(result.totalReturned) > cents(stake)) win = result;
      if (cents(result.totalReturned) === 0) loss = result;
    }
    if (!win || !loss) throw new RemainingDealCardError("This allocation cannot produce both a paid win and an unpaid loss. Undo covering bets before dealing.");
    const won = await nextPlayerWin(tx, game, userId);
    const round = won ? win : loss;
    const payout = cents(round.totalReturned) / 100;
    return { claim: payout, outcome: { ...round, payout } };
  }
  throw new RemainingDealCardError("Unsupported remaining card game.");
}
