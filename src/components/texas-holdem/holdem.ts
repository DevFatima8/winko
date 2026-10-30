import {
  bestHand,
  compareScores,
  createDeck,
  describeScore,
  rankLabel,
  shuffle,
  type Card,
  type HandScore,
} from './cards';

/** Pure Hold'em hand state machine shared by the table UI and the server-dealt engine. */
export const SB = 10;
export const BB = 20;
export const HOUSE_START = 100000;
export const MAX_RAISES = 2; // max raises per betting round

export type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'handOver';

export interface GameResult {
  winner: 'player' | 'dealer' | 'tie';
  amount: number;
  playerScore: HandScore | null;
  dealerScore: HandScore | null;
  reason: string;
}

export interface GameState {
  acceptedStake: number;
  refundedStake: number;
  grossReturn: number;
  handNumber: number;
  deck: Card[];
  playerCards: Card[];
  dealerCards: Card[];
  community: Card[];
  pot: number;
  playerBet: number; // committed this betting round
  dealerBet: number; // committed this betting round
  currentBet: number; // amount the other side must match
  phase: Phase;
  playerChips: number;
  dealerChips: number;
  playerActed: boolean;
  dealerActed: boolean;
  playerAllIn: boolean;
  dealerAllIn: boolean;
  folded: 'player' | 'dealer' | null;
  revealDealer: boolean;
  raises: number;
  log: string[];
  result: GameResult | null;
}

export const fmt = (n: number) => n.toLocaleString('en-US');

export const pushLog = (arr: string[], msg: string) => [...arr.slice(-39), msg];

export function initialState(): GameState {
  return {
    acceptedStake: 0, refundedStake: 0, grossReturn: 0,
    handNumber: 0,
    deck: [],
    playerCards: [],
    dealerCards: [],
    community: [],
    pot: 0,
    playerBet: 0,
    dealerBet: 0,
    currentBet: 0,
    phase: 'handOver',
    playerChips: 0,
    dealerChips: HOUSE_START,
    playerActed: false,
    dealerActed: false,
    playerAllIn: false,
    dealerAllIn: false,
    folded: null,
    revealDealer: false,
    raises: 0,
    log: ['Choose an opening bet, then deal a hand. Minimum bet Rs. 10.'],
    result: null,
  };
}

/* ------------------------------ hand flow ------------------------------ */

export function startNextHand(s: GameState, openingBet = SB, dealt: Card[] = shuffle(createDeck())): GameState {
  let playerChips = s.playerChips;
  let dealerChips = s.dealerChips;
  let logMsgs = s.log;
  if (dealerChips < BB) {
    dealerChips = HOUSE_START;
    logMsgs = pushLog(logMsgs, 'House rebuys for Rs. 100,000.');
  }
  const deck = dealt;
  const playerCards = [deck[0], deck[2]];
  const dealerCards = [deck[1], deck[3]];
  const rest = deck.slice(4);
  const sb = Math.min(openingBet, playerChips);
  const bb = Math.min(Math.max(BB, sb), dealerChips);
  playerChips -= sb;
  dealerChips -= bb;
  const handNumber = s.handNumber + 1;
  return {
    ...s,
    acceptedStake: sb, refundedStake: 0, grossReturn: 0,
    handNumber,
    deck: rest,
    playerCards,
    dealerCards,
    community: [],
    pot: sb + bb,
    playerBet: sb,
    dealerBet: bb,
    currentBet: Math.max(sb, bb),
    phase: 'preflop',
    playerChips,
    dealerChips,
    playerActed: false,
    dealerActed: true, // the big blind counts as the dealer's committed action
    playerAllIn: playerChips === 0,
    dealerAllIn: dealerChips === 0,
    folded: null,
    revealDealer: false,
    raises: 0,
    log: pushLog(logMsgs, `— Hand #${handNumber} — blinds Rs. ${sb} / Rs. ${bb}, pot Rs. ${sb + bb}`),
    result: null,
  };
}

export function dealCommunity(s: GameState, count: number, phase: Phase, label: string): GameState {
  const community = [...s.community, ...s.deck.slice(0, count)];
  return {
    ...s,
    deck: s.deck.slice(count),
    community,
    phase,
    playerBet: 0,
    dealerBet: 0,
    currentBet: 0,
    playerActed: false,
    dealerActed: false,
    raises: 0,
    log: pushLog(s.log, `${label} dealt (${community.map((c) => rankLabel(c.rank) + ' ').join('')}).`),
  };
}

export function showdown(s: GameState): GameState {
  const playerScore = bestHand([...s.playerCards, ...s.community]);
  const dealerScore = bestHand([...s.dealerCards, ...s.community]);
  const cmp = compareScores(playerScore, dealerScore);
  const amount = s.pot;
  const winner: GameResult['winner'] = cmp > 0 ? 'player' : cmp < 0 ? 'dealer' : 'tie';
  const playerDesc = `${describeScore(playerScore)} (${playerScore.ranks.map(rankLabel).join(' ')})`;
  const dealerDesc = `${describeScore(dealerScore)} (${dealerScore.ranks.map(rankLabel).join(' ')})`;
  let playerChips = s.playerChips;
  let dealerChips = s.dealerChips;
  if (winner === 'player') playerChips += amount;
  else if (winner === 'dealer') dealerChips += amount;
  else {
    playerChips += Math.ceil(amount / 2);
    dealerChips += Math.floor(amount / 2);
  }
  const msg =
    winner === 'tie'
      ? `Tie! The pot of Rs. ${fmt(amount)} is split — both hold ${describeScore(playerScore)}.`
      : winner === 'player'
        ? `You win Rs. ${fmt(amount)}! ${playerDesc} beats ${dealerDesc}.`
        : "No win";
  return {
    ...s,
    phase: 'handOver',
    grossReturn: winner === 'player' ? amount : winner === 'tie' ? Math.ceil(amount / 2) : 0,
    revealDealer: true,
    pot: 0,
    playerChips,
    dealerChips,
    result: { winner, amount, playerScore, dealerScore, reason: `${playerDesc}  vs  ${dealerDesc}` },
    log: pushLog(s.log, `Showdown — You: ${playerDesc} | House: ${dealerDesc}. ${msg}`),
  };
}

export function runOut(s: GameState): GameState {
  const needed = 5 - s.community.length;
  const community = [...s.community, ...s.deck.slice(0, needed)];
  return showdown({ ...s, community, deck: s.deck.slice(needed) });
}

/** Called after every action: settles folds, all-ins and round progression. */
export function settleRound(s: GameState): GameState {
  if (s.folded) {
    const winner: GameResult['winner'] = s.folded === 'player' ? 'dealer' : 'player';
    const amount = s.pot;
    const msg =
      winner === 'player'
        ? `House folds — you win Rs. ${fmt(amount)}!`
        : "No win";
    return {
      ...s,
      phase: 'handOver',
      grossReturn: winner === 'player' ? amount : 0,
      revealDealer: s.folded === 'dealer',
      playerChips: winner === 'player' ? s.playerChips + amount : s.playerChips,
      dealerChips: winner === 'dealer' ? s.dealerChips + amount : s.dealerChips,
      pot: 0,
      result: {
        winner,
        amount,
        playerScore: null,
        dealerScore: null,
        reason: s.folded === 'player' ? 'You folded' : 'House folded',
      },
      log: pushLog(s.log, msg),
    };
  }

  let st = s;
  // All-in for less: return the unmatched excess to the bigger bettor.
  if (st.playerAllIn && st.dealerBet > st.playerBet) {
    const diff = st.dealerBet - st.playerBet;
    st = { ...st, dealerBet: st.playerBet, dealerChips: st.dealerChips + diff, pot: st.pot - diff };
  } else if (st.dealerAllIn && st.playerBet > st.dealerBet) {
    const diff = st.playerBet - st.dealerBet;
    st = { ...st, refundedStake: st.refundedStake + diff, playerBet: st.dealerBet, playerChips: st.playerChips + diff, pot: st.pot - diff };
  }

  const roundComplete =
    st.phase !== 'handOver' && st.playerBet === st.dealerBet && st.playerActed && st.dealerActed;

  if (st.playerAllIn || st.dealerAllIn) {
    if (roundComplete || (st.playerAllIn && st.dealerAllIn)) return runOut(st);
    return st; // other side still has to respond to the all-in
  }
  if (!roundComplete) return st;

  if (st.phase === 'preflop') return dealCommunity(st, 3, 'flop', 'Flop');
  if (st.phase === 'flop') return dealCommunity(st, 1, 'turn', 'Turn');
  if (st.phase === 'turn') return dealCommunity(st, 1, 'river', 'River');
  return showdown(st);
}

/* ---------------------------- player actions --------------------------- */

export function playerCall(s: GameState): GameState {
  const amount = Math.min(Math.max(0, s.currentBet - s.playerBet), s.playerChips);
  const playerChips = s.playerChips - amount;
  return settleRound({
    ...s,
    acceptedStake: s.acceptedStake + amount,
    playerChips,
    playerBet: s.playerBet + amount,
    playerAllIn: playerChips === 0,
    pot: s.pot + amount,
    playerActed: true,
    log: pushLog(s.log, amount === 0 ? 'You check.' : `You call Rs. ${fmt(amount)}.`),
  });
}

export function playerFold(s: GameState): GameState {
  return settleRound({
    ...s,
    folded: 'player',
    playerActed: true,
    log: pushLog(s.log, 'You fold.'),
  });
}

export function playerRaiseTo(s: GameState, requested: number): GameState {
  const maxTotal = s.playerBet + s.playerChips;
  const callNeeded = Math.max(0, s.currentBet - s.playerBet);
  const canRaiseMore = s.raises < MAX_RAISES && maxTotal > s.currentBet;
  let finalTotal: number;
  if (!canRaiseMore) {
    finalTotal = Math.min(s.playerBet + callNeeded, maxTotal);
  } else {
    const minTotal = s.currentBet > 0 ? s.currentBet * 2 : BB;
    finalTotal = Math.max(Math.min(requested, maxTotal), Math.min(minTotal, maxTotal));
    finalTotal = Math.max(finalTotal, s.playerBet + callNeeded);
  }
  const extra = finalTotal - s.playerBet;
  const isRaise = finalTotal > s.currentBet;
  return settleRound({
    ...s,
    acceptedStake: s.acceptedStake + extra,
    pot: s.pot + extra,
    playerChips: s.playerChips - extra,
    playerBet: finalTotal,
    currentBet: Math.max(s.currentBet, finalTotal),
    playerAllIn: s.playerChips - extra === 0,
    playerActed: true,
    raises: s.raises + (isRaise ? 1 : 0),
    log: pushLog(
      s.log,
      extra === 0 ? 'You check.' : `You ${isRaise ? 'raise' : 'call'} to Rs. ${fmt(finalTotal)}.`,
    ),
  });
}

/* ----------------------------- dealer (AI) ----------------------------- */

export function estimateStrength(cards: Card[], community: Card[]): number {
  if (community.length < 3) {
    const [a, b] = cards;
    const hi = Math.max(a.rank, b.rank);
    const lo = Math.min(a.rank, b.rank);
    if (a.rank === b.rank) return 0.82 + ((a.rank - 2) / 12) * 0.15;
    let str = ((hi - 2) / 12) * 0.4 + ((lo - 2) / 12) * 0.25;
    if (a.suit === b.suit) str += 0.06;
    if (hi - lo === 1) str += 0.04;
    if (hi >= 13) str += 0.05;
    return Math.min(0.97, str);
  }
  const score = bestHand([...cards, ...community]);
  return Math.min(0.99, (score.cat / 8) * 0.85 + ((score.ranks[0] - 2) / 12) * 0.15);
}

export function dealerBetTo(s: GameState, total: number, verb: string): GameState {
  const extra = total - s.dealerBet;
  const dealerChips = s.dealerChips - extra;
  const isRaise = total > s.currentBet;
  return settleRound({
    ...s,
    dealerChips,
    pot: s.pot + extra,
    dealerBet: total,
    currentBet: Math.max(s.currentBet, total),
    dealerAllIn: dealerChips === 0,
    dealerActed: true,
    raises: s.raises + (isRaise ? 1 : 0),
    log: pushLog(s.log, `House ${verb}.`),
  });
}

/** `neverFold` keeps a house that is assigned to win in the hand until showdown. */
export function dealerAct(s: GameState, rnd = Math.random(), neverFold = false): GameState {
  const strength = estimateStrength(s.dealerCards, s.community);
  const toCall = s.currentBet - s.dealerBet;
  const raisesLeft = s.raises < MAX_RAISES;
  const maxTotal = s.dealerBet + s.dealerChips;

  if (toCall > 0) {
    // facing a bet / raise
    if (strength > 0.68 && raisesLeft && rnd < 0.45) {
      const target = Math.min(s.currentBet * 2, maxTotal);
      return dealerBetTo(s, target, `raises to Rs. ${fmt(target)}`);
    }
    if (strength > 0.45 || (strength > 0.28 && rnd < 0.22)) {
      const amount = Math.min(toCall, s.dealerChips);
      return settleRound({
        ...s,
        dealerChips: s.dealerChips - amount,
        dealerBet: s.dealerBet + amount,
        dealerAllIn: s.dealerChips - amount === 0,
        dealerActed: true,
        pot: s.pot + amount,
        log: pushLog(s.log, `House calls Rs. ${fmt(amount)}.`),
      });
    }
    if (neverFold) {
      const amount = Math.min(toCall, s.dealerChips);
      return settleRound({
        ...s,
        dealerChips: s.dealerChips - amount,
        dealerBet: s.dealerBet + amount,
        dealerAllIn: s.dealerChips - amount === 0,
        dealerActed: true,
        pot: s.pot + amount,
        log: pushLog(s.log, `House calls Rs. ${fmt(amount)}.`),
      });
    }
    return settleRound({
      ...s,
      folded: 'dealer',
      dealerActed: true,
      log: pushLog(s.log, 'House folds.'),
    });
  }

  // dealer acts first post-flop
  const shouldBet = strength > 0.6 || (strength < 0.32 && rnd < 0.1); // occasional bluff
  if (!shouldBet) {
    return settleRound({ ...s, dealerActed: true, log: pushLog(s.log, 'House checks.') });
  }
  const size = Math.max(BB, Math.round((s.pot + BB) * (strength > 0.72 ? 0.8 : 0.55)));
  const target = Math.min(size, maxTotal);
  return dealerBetTo(s, target, `bets Rs. ${fmt(target)}`);
}

/* ------------------------------ turn logic ----------------------------- */

export function computeTurn(s: GameState): 'player' | 'dealer' | 'none' {
  if (s.phase === 'handOver' || s.folded) return 'none';
  if (s.phase === 'preflop' || s.phase === 'flop' || s.phase === 'turn' || s.phase === 'river') {
    if (s.playerBet !== s.dealerBet) return s.playerBet < s.dealerBet ? 'player' : 'dealer';
    if (!s.playerActed && !s.dealerActed) return s.phase === 'preflop' ? 'player' : 'dealer';
    if (!s.playerActed) return 'player';
    if (!s.dealerActed) return 'dealer';
  }
  return 'none';
}
