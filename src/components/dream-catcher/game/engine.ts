import {
  ALL_SPOTS,
  LOSS_PROBABILITY,
  MULTIPLIER_SPOTS,
  MULTIPLIER_VALUE,
  NATURAL_WEIGHT,
  NUMBER_SPOTS,
  PAYOUT,
  SEGMENT_COUNT,
  WIN_PROBABILITY,
  WHEEL_SEQUENCE,
  indicesForSpot,
  type SpotId,
} from "./config";

/**
 * whenever the shape of the bet allows it at this RTP; long-shot-only bets get
 * a lower win frequency instead of paying out 40:1 on a third of all rounds.
 */
export const RTP_TARGET = 0.94;

export type Bets = Partial<Record<SpotId, number>>;

export type SpinStep = {
  /** Index of the wheel segment that stops under the pointer. */
  index: number;
  spot: SpotId;
  /** Multiplier applied to the whole table by this step (1 for plain numbers). */
  multiplier: number;
};

export type ResolvedRound = {
  steps: SpinStep[];
  finalSpot: SpotId;
  totalMultiplier: number;
  stake: number;
  payout: number;
  won: boolean;
  controlled: boolean;
};

export const MAX_CHAIN_STEPS = 2;
const FIRST_CHAIN_PROBABILITY = 0.18;
const SECOND_CHAIN_PROBABILITY = 0.12;

function isMultiplierSpot(spot: SpotId) {
  return (MULTIPLIER_SPOTS as string[]).includes(spot);
}

function randomIndex(spot: SpotId) {
  const pool = indicesForSpot(spot);
  return pool[Math.floor(Math.random() * pool.length)] ?? 0;
}

function weightedPick(entries: Array<[SpotId, number]>): SpotId {
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return entries[Math.floor(Math.random() * entries.length)][0];
  let roll = Math.random() * total;
  for (const [spot, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return spot;
  }
  return entries[entries.length - 1][0];
}

function stepFor(spot: SpotId): SpinStep {
  return {
    index: randomIndex(spot),
    spot,
    multiplier: isMultiplierSpot(spot) ? MULTIPLIER_VALUE[spot] : 1,
  };
}

function naturalStep(): SpinStep {
  const index = Math.floor(Math.random() * SEGMENT_COUNT);
  const spot = WHEEL_SEQUENCE[index];
  return { index, spot, multiplier: isMultiplierSpot(spot) ? MULTIPLIER_VALUE[spot] : 1 };
}

/**
 * Builds the (optional) 2x / 7x multiplier chain for a round.
 *
 * The chain is capped so that at least one landing on the wheel can still be a
 * non-winning result. Without that cap a fully covered board plus a 7x chain
 * would pay out on every single spin.
 */
function buildChain(bets: Bets, totalStake: number): SpotId[] {
  const uncovered = NUMBER_SPOTS.filter((spot) => (bets[spot] ?? 0) <= 0);
  let cap = Number.POSITIVE_INFINITY;
  if (uncovered.length === 0) {
    cap = Math.max(
      ...NUMBER_SPOTS.map((spot) => totalStake / ((bets[spot] ?? 0) * (PAYOUT[spot] + 1))),
    );
  }

  const chain: SpotId[] = [];
  let accumulated = 1;

  for (let step = 0; step < MAX_CHAIN_STEPS; step++) {
    const chance = step === 0 ? FIRST_CHAIN_PROBABILITY : SECOND_CHAIN_PROBABILITY;
    if (Math.random() >= chance) break;
    const allowed = MULTIPLIER_SPOTS.filter(
      (spot) => accumulated * MULTIPLIER_VALUE[spot] <= cap,
    );
    if (allowed.length === 0) break;
    const pick = weightedPick(allowed.map((s): [SpotId, number] => [s, NATURAL_WEIGHT[s]]));
    chain.push(pick);
    accumulated *= MULTIPLIER_VALUE[pick];
  }

  return chain;
}

/** Spin with no money on the table — pure natural wheel distribution. */
function freeSpin(): ResolvedRound {
  const steps: SpinStep[] = [naturalStep()];
  let guard = 0;
  while (isMultiplierSpot(steps[steps.length - 1].spot) && guard < 3) {
    steps.push(naturalStep());
    guard += 1;
  }
  const finalSpot = steps[steps.length - 1].spot;
  const totalMultiplier = steps.reduce((m, s) => m * s.multiplier, 1);
  return {
    steps,
    finalSpot,
    totalMultiplier,
    stake: 0,
    payout: 0,
    won: false,
    controlled: false,
  };
}

/**
 * Resolves a betting round.
 *
 * The house targets WIN_PROBABILITY (35%) winning rounds and 65% losing
 * rounds. A winning round lands on one of the numbers the player actually
 * backed (weighted by stake) with a net-positive return; a losing round lands
 * on a number the player did not cover (weighted by the wheel's natural
 * distribution, so results still look organic).
 */
export function resolveRound(rawBets: Bets): ResolvedRound {
  const bets: Bets = {};
  let totalStake = 0;
  for (const spot of ALL_SPOTS) {
    const amount = Number(rawBets[spot] ?? 0);
    if (Number.isFinite(amount) && amount > 0) {
      bets[spot] = amount;
      totalStake += amount;
    }
  }

  if (totalStake <= 0) return freeSpin();

  // ---- optional multiplier chain (2x / 7x) before the deciding number ----
  const chain = buildChain(bets, totalStake);
  const chainMultiplier = chain.reduce((m, s) => m * MULTIPLIER_VALUE[s], 1);

  /**
   * Return multiple of every number spot: how many times the total stake comes
   * back if the wheel stops there. 0 means the spot is not covered.
   */
  const multiple = new Map<SpotId, number>();
  for (const spot of NUMBER_SPOTS) {
    const stake = bets[spot] ?? 0;
    multiple.set(spot, stake > 0 ? (stake * (PAYOUT[spot] + 1) * chainMultiplier) / totalStake : 0);
  }

  const winCandidates = NUMBER_SPOTS.filter((s) => (multiple.get(s) ?? 0) > 1);
  const lossCandidates = NUMBER_SPOTS.filter((s) => (multiple.get(s) ?? 0) <= 1);

  // Expected give-back on a losing round (partial returns from covered low spots).
  const lossWeightSum = lossCandidates.reduce((sum, s) => sum + NATURAL_WEIGHT[s], 0);
  const expectedLossReturn =
    lossWeightSum > 0
      ? lossCandidates.reduce((sum, s) => sum + NATURAL_WEIGHT[s] * (multiple.get(s) ?? 0), 0) /
      lossWeightSum
      : 0;

  let winProbability = 0;
  let winWeights: Array<[SpotId, number]> = [];

  if (winCandidates.length > 0) {
    const multiples = winCandidates.map((s) => multiple.get(s) ?? 0);
    const minMultiple = Math.min(...multiples);
    const maxMultiple = Math.max(...multiples);
    // Average win needed to land on RTP_TARGET while winning WIN_PROBABILITY of rounds.
    const budget = (RTP_TARGET - LOSS_PROBABILITY * expectedLossReturn) / WIN_PROBABILITY;

    if (budget >= maxMultiple) {
      winProbability = WIN_PROBABILITY;
      winWeights = winCandidates.map((s): [SpotId, number] => [s, bets[s] ?? 1]);
    } else if (budget <= minMultiple) {
      // Long-shot board: damp the jackpots and bend the win rate to protect the economy.
      const damped = winCandidates.map((s): [SpotId, number] => [s, (bets[s] ?? 1) / (multiple.get(s) ?? 1)]);
      const weightSum = damped.reduce((sum, [, w]) => sum + w, 0);
      const expectedWinReturn =
        damped.reduce((sum, [s, w]) => sum + w * (multiple.get(s) ?? 0), 0) / Math.max(weightSum, 1e-9);
      const solved = (RTP_TARGET - expectedLossReturn) / Math.max(expectedWinReturn - expectedLossReturn, 1e-6);
      winProbability = Math.min(WIN_PROBABILITY, Math.max(0.0002, solved));
      winWeights = damped;
    } else {
      // Mixed board: blend short and long shots so the average win hits the budget exactly.
      const low = winCandidates.filter((s) => (multiple.get(s) ?? 0) <= budget);
      const high = winCandidates.filter((s) => (multiple.get(s) ?? 0) > budget);
      const stakeOf = (s: SpotId) => bets[s] ?? 1;
      const lowWeight = low.reduce((sum, s) => sum + stakeOf(s), 0);
      const lowReturn = low.reduce((sum, s) => sum + stakeOf(s) * (multiple.get(s) ?? 0), 0);
      const highWeight = high.reduce((sum, s) => sum + stakeOf(s), 0);
      const highReturn = high.reduce((sum, s) => sum + stakeOf(s) * (multiple.get(s) ?? 0), 0);
      const denominator = highReturn - budget * highWeight;
      const alpha = denominator > 1e-9 ? (budget * lowWeight - lowReturn) / denominator : 0;
      winProbability = WIN_PROBABILITY;
      winWeights = [
        ...low.map((s): [SpotId, number] => [s, stakeOf(s)]),
        ...high.map((s): [SpotId, number] => [s, stakeOf(s) * Math.max(alpha, 0)]),
      ];
    }
  }

  const isWin = winProbability > 0 && Math.random() < winProbability;

  let finalSpot: SpotId;
  if (isWin) {
    finalSpot = weightedPick(winWeights);
  } else if (lossCandidates.length > 0) {
    finalSpot = weightedPick(lossCandidates.map((s): [SpotId, number] => [s, NATURAL_WEIGHT[s]]));
  } else if (winCandidates.length > 0) {
    finalSpot = [...winCandidates].sort(
      (a, b) => (multiple.get(a) ?? 0) - (multiple.get(b) ?? 0),
    )[0];
  } else {
    finalSpot = weightedPick(NUMBER_SPOTS.map((s): [SpotId, number] => [s, NATURAL_WEIGHT[s]]));
  }

  const steps: SpinStep[] = chain.map(stepFor);
  steps.push(stepFor(finalSpot));

  const winningStake = bets[finalSpot] ?? 0;
  const payout = isMultiplierSpot(finalSpot)
    ? 0
    : winningStake * (PAYOUT[finalSpot] + 1) * chainMultiplier;

  return {
    steps,
    finalSpot,
    totalMultiplier: chainMultiplier,
    stake: totalStake,
    payout,
    won: payout > totalStake,
    controlled: true,
  };
}

export function sanitizeBets(input: unknown): Bets {
  const source = (input ?? {}) as Record<string, unknown>;
  const bets: Bets = {};
  for (const spot of ALL_SPOTS) {
    const value = Number(source[spot]);
    if (Number.isFinite(value) && value > 0) {
      bets[spot] = Math.floor(value * 100) / 100;
    }
  }
  return bets;
}
