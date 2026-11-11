export const AVIATOR_PREVIOUS_MODEL = "aviator-80-capped-v1";
export const AVIATOR_MODEL = "aviator-80-pre2-v2";
export const AVIATOR_MODELS = [AVIATOR_PREVIOUS_MODEL, AVIATOR_MODEL] as const;
export type AviatorModel = typeof AVIATOR_MODELS[number];
export function isAviatorModel(value: unknown): value is AviatorModel {
  return value === AVIATOR_MODEL || value === AVIATOR_PREVIOUS_MODEL;
}
export const AVIATOR_RTP = 0.8;
export const AVIATOR_MAX_CRASH = 99.99;
export const AVIATOR_LEGACY_MAX_CRASH = 10_000;
export const AVIATOR_MIN_CASHOUT = 1.01;
export const AVIATOR_MAX_CASHOUT = 99.98;
export const AVIATOR_CLIENT_SEED = "winkox-aviator-public-v1";
export const AVIATOR_SAMPLE_SPACE = 2 ** 52;

export function aviatorReachAt(startsAt: number, multiplier: number, growth: number) {
  if (!Number.isFinite(startsAt) || !Number.isFinite(multiplier) || multiplier < 1 ||
      !Number.isFinite(growth) || growth <= 0) throw new Error("Invalid Aviator flight clock.");
  return startsAt + Math.ceil(Math.log(multiplier) / growth * 1000);
}

export function aviatorCents(amount: number) {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents < 0 || cents / 100 !== amount) {
    throw new Error("Invalid Aviator monetary precision.");
  }
  return cents;
}

export function crashCentsFromSample(sample: number, model: AviatorModel = AVIATOR_MODEL) {
  if (!Number.isSafeInteger(sample) || sample < 0 || sample >= AVIATOR_SAMPLE_SPACE || !isAviatorModel(model)) {
    throw new Error("Invalid Aviator random sample.");
  }
  const numerator = BigInt(80) * BigInt(AVIATOR_SAMPLE_SPACE);
  const denominator = BigInt(sample) + BigInt(1);
  const cents = (numerator + denominator - BigInt(1)) / denominator;
  const capped = Number(cents < BigInt(100) ? BigInt(100) : cents > BigInt(9999) ? BigInt(9999) : cents);
  // Move the 2.00x mass below 2x; only the 1.99x cashout probability changes.
  return model === AVIATOR_MODEL && capped === 200 ? 199 : capped;
}

export function validAutoCashout(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= AVIATOR_MIN_CASHOUT && value <= AVIATOR_MAX_CASHOUT &&
    Math.round(value * 100) / 100 === value;
}

export function aviatorPayout(stake: number, multiplier: number) {
  const cents = aviatorCents(stake);
  const target = Math.round(multiplier * 100);
  if (!Number.isFinite(multiplier) || !Number.isSafeInteger(target) || target < 100 ||
      multiplier > AVIATOR_MAX_CASHOUT || target / 100 !== multiplier) {
    throw new Error("Invalid Aviator settlement amount.");
  }
  const payout = BigInt(cents) * BigInt(target) / BigInt(100);
  if (payout > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Aviator payout exceeds wallet precision.");
  const amount = Number(payout) / 100;
  if (BigInt(aviatorCents(amount)) !== payout) throw new Error("Aviator payout exceeds wallet precision.");
  return amount;
}

export function aviatorAccounting(bets: readonly { betAmount: number; winAmount: number; outcome: string }[]) {
  const settled = bets.filter(bet => bet.outcome === "win" || bet.outcome === "lose");
  let stakeCents = BigInt(0), payoutCents = BigInt(0);
  for (const bet of settled) {
    const stake = aviatorCents(bet.betAmount), payout = aviatorCents(bet.winAmount);
    if (stake <= 0 || bet.outcome === "lose" && payout !== 0 || bet.outcome === "win" && payout <= 0) {
      throw new Error("Invalid Aviator settled wager.");
    }
    stakeCents += BigInt(stake);
    payoutCents += BigInt(payout);
  }
  if (stakeCents > BigInt(Number.MAX_SAFE_INTEGER) || payoutCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Aviator accounting exceeds safe precision.");
  }
  const totalBets = Number(stakeCents) / 100, totalPayouts = Number(payoutCents) / 100;
  if (BigInt(aviatorCents(totalBets)) !== stakeCents || BigInt(aviatorCents(totalPayouts)) !== payoutCents) {
    throw new Error("Aviator accounting exceeds safe precision.");
  }
  const difference = stakeCents - payoutCents;
  const ggr = Number(difference) / 100;
  if (BigInt(aviatorCents(Math.abs(ggr))) !== (difference < BigInt(0) ? -difference : difference)) {
    throw new Error("Aviator accounting exceeds safe precision.");
  }
  return {
    settledBets: settled.length, pendingBets: bets.filter(bet => bet.outcome === "pending").length,
    totalBets, totalPayouts, ggr,
    actualRtp: stakeCents > BigInt(0) ? Number(payoutCents) / Number(stakeCents) * 100 : null,
  };
}
