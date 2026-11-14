import type { MultiplayerTransaction } from "./multiplayer-store";
import { BrowserWagerError } from "./dailyPoolBrowser";
import { nextPlayerWin } from "./playerWinCycle";
import { generateRaceSequence, settleBets } from "@/components/race-betting/engine";
import type { Bet, BetType, RoundResult, Suit } from "@/components/race-betting/types";
import { cents } from "./dailyPool";

const ODDS: Record<BetType, number> = {
  SUIT_BACK: 3.75, SUIT_LAY: 3.9, COLOR_RED: 1.95, COLOR_BLACK: 1.95,
  TOTAL_CARDS_OVER: 1.9, TOTAL_CARDS_UNDER: 1.9, TOTAL_CARDS_ODD: 1.95, TOTAL_CARDS_EVEN: 1.95,
  TOTAL_POINTS_OVER: 1.9, TOTAL_POINTS_UNDER: 1.9, TOTAL_POINTS_ODD: 1.95, TOTAL_POINTS_EVEN: 1.95,
  CARDS_5_8: 4.5, CARDS_9_12: 1.85, CARDS_13_17: 3.8,
};
const isType = (type: unknown): type is BetType => typeof type === "string" && Object.hasOwn(ODDS, type);
const isSuit = (suit: unknown): suit is Suit => ["SPADE", "HEART", "CLUB", "DIAMOND"].some(value => value === suit);

export async function serverRaceOutcome(tx: MultiplayerTransaction, userId: string, stake: number, selection: unknown) {
  const raw = selection && typeof selection === "object" && "bets" in selection ? selection.bets : null;
  if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new BrowserWagerError("Select valid Race Betting markets.");
  const bets: Bet[] = raw.map((value: unknown, index) => {
    if (!value || typeof value !== "object" || !("type" in value) || !isType(value.type) ||
        !("stake" in value) || typeof value.stake !== "number" || !Number.isFinite(value.stake) ||
        value.stake <= 0 || cents(value.stake) / 100 !== value.stake) {
      throw new BrowserWagerError("Invalid Race Betting stake or market.");
    }
    const type = value.type;
    const target = "target" in value ? value.target : undefined;
    const suitMarket = type === "SUIT_BACK" || type === "SUIT_LAY";
    if (suitMarket && !isSuit(target) || !suitMarket && target !== undefined) throw new BrowserWagerError("Invalid Race Betting suit.");
    const isLay = type === "SUIT_LAY";
    if (("odds" in value && value.odds !== ODDS[type]) || Boolean("isLay" in value && value.isLay) !== isLay) {
      throw new BrowserWagerError("Race Betting odds are determined by the server.");
    }
    return { id: String(index), type, stake: value.stake, odds: ODDS[type], isLay,
      target: isSuit(target) ? target : undefined, targetLabel: type, potentialProfit: 0 };
  });
  const cost = bets.reduce((sum, bet) => sum + (bet.isLay ? bet.stake * (bet.odds - 1) : bet.stake), 0);
  if (cents(cost) !== cents(stake)) throw new BrowserWagerError("Race Betting selections do not match the accepted stake.");
  let winning: ReturnType<typeof generateRaceSequence> | undefined;
  let losing: ReturnType<typeof generateRaceSequence> | undefined;
  const timestamp = await tx.now();
  for (let attempt = 0; attempt < 10000 && (!winning || !losing); attempt++) {
    const plan = generateRaceSequence();
    const result: RoundResult = { ...plan, cardsSequence: plan.cards, roundId: "server", timestamp };
    const payout = settleBets(bets, result).totalPayout;
    if (cents(payout) > cents(stake)) winning = plan;
    if (cents(payout) === 0) losing = plan;
  }
  if (!winning || !losing) throw new BrowserWagerError("These race bets cannot support both a profitable and a zero-return result. Remove conflicting bets or clear them for a refund.");
  const win = await nextPlayerWin(tx, "race-betting", userId);
  const plan = win ? winning : losing;
  const result: RoundResult = { ...plan, cardsSequence: plan.cards, roundId: "server", timestamp };
  const payout = cents(settleBets(bets, result).totalPayout) / 100;
  return { claim: payout, outcome: { ...plan, payout } };
}
