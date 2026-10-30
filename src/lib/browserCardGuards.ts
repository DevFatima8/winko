import { compareMuflis, evaluateHand, type DealResult as MuflisDeal } from "@/components/muflis/lib/muflis";
import { compareEval, bestOfFour, type DealResult as FourDeal } from "@/components/teen-patti-best-of-four/lib/teenpatti";
import { evaluateWithWilds, type RiggedDeal } from "@/components/teen-patti-ak47/lib/teenpatti";
import { isDealResult } from "@/components/poker/lib/poker";

type Paid<T> = T & { payout: number };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const paid = (value: unknown): value is Record<string, unknown> & { payout: number } =>
  record(value) && typeof value.payout === "number" && Number.isFinite(value.payout) && value.payout >= 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const isPokerBrowserDeal = (value: unknown): value is Paid<import("@/components/poker-betting/lib/poker").DealResult> =>
  paid(value) && isDealResult(value);

export function isMuflisBrowserDeal(value: unknown): value is Paid<MuflisDeal> {
  if (!paid(value) || !record(value.playerHand) || !record(value.dealerHand) ||
      !Array.isArray(value.playerHand.cards) || !Array.isArray(value.dealerHand.cards) ||
      value.playerHand.cards.length !== 3 || value.dealerHand.cards.length !== 3) return false;
  try {
    const player = evaluateHand(value.playerHand.cards);
    const dealer = evaluateHand(value.dealerHand.cards);
    return same(player, value.playerHand) && same(dealer, value.dealerHand) &&
      compareMuflis(player, dealer) !== 0 && value.playerWins === (compareMuflis(player, dealer) > 0);
  } catch { return false; }
}

export function isFourBrowserDeal(value: unknown): value is Paid<FourDeal> {
  if (!paid(value) || !Array.isArray(value.player) || !Array.isArray(value.dealer) ||
      value.player.length !== 4 || value.dealer.length !== 4) return false;
  try {
    const player = bestOfFour(value.player);
    const dealer = bestOfFour(value.dealer);
    return same(player, value.playerEval) && same(dealer, value.dealerEval) &&
      compareEval(player, dealer) !== 0 && value.outcome === (compareEval(player, dealer) > 0 ? "win" : "loss");
  } catch { return false; }
}

export function isAK47BrowserDeal(value: unknown): value is Paid<RiggedDeal> {
  if (!paid(value) || !Array.isArray(value.player) || !Array.isArray(value.dealer) ||
      value.player.length !== 3 || value.dealer.length !== 3) return false;
  try {
    const player = evaluateWithWilds(value.player);
    const dealer = evaluateWithWilds(value.dealer);
    return same(player, value.playerEval) && same(dealer, value.dealerEval) &&
      value.outcome === (player.score > dealer.score ? "win" : "loss");
  } catch { return false; }
}

export function isColourBrowserDeal(value: unknown): value is {
  winningColor: "red" | "black"; isWin: boolean; suit: string; value: string; payout: number;
} {
  return paid(value) && (value.winningColor === "red" || value.winningColor === "black") &&
    typeof value.isWin === "boolean" && typeof value.value === "string" &&
    (value.winningColor === "red" ? ["♥", "♦"] : ["♠", "♣"]).includes(String(value.suit));
}

export function isThreeCardsBrowserDeal(value: unknown): value is {
  win: boolean; picked: number; cards: { rank: string; suit: string; color: string }[]; payout: number;
} {
  if (!paid(value) || typeof value.win !== "boolean" || !Number.isInteger(value.picked) ||
      !Array.isArray(value.cards) || value.cards.length !== 3 ||
      !value.cards.every(card => record(card) && typeof card.rank === "string" && typeof card.suit === "string" && typeof card.color === "string")) return false;
  const picked = Number(value.picked);
  return picked >= 0 && picked < 3 &&
    value.cards.filter(card => card.rank === "A" && card.suit === "♠").length === 1 &&
    value.win === (value.cards[picked].rank === "A" && value.cards[picked].suit === "♠");
}
