export const BLAST_OFF_PREVIOUS_MODEL = "blast-off-30-v1";
export const BLAST_OFF_MODEL = "blast-off-30-capped-v2";
export type BlastOffModel = typeof BLAST_OFF_MODEL | typeof BLAST_OFF_PREVIOUS_MODEL;
export const BLAST_OFF_RTP = 0.3;
export const BLAST_OFF_SAMPLE_SPACE = 2 ** 32;
export const BLAST_OFF_MAX_CASHOUT = 99.98;
export const BLAST_OFF_MAX_CRASH = 99.99;

export function isBlastOffModel(value: unknown): value is BlastOffModel {
  return value === BLAST_OFF_MODEL || value === BLAST_OFF_PREVIOUS_MODEL;
}

export function blastOffMaxCrash(model: BlastOffModel = BLAST_OFF_MODEL) {
  return model === BLAST_OFF_PREVIOUS_MODEL ? 250.01 : BLAST_OFF_MAX_CRASH;
}

export function blastOffMaxCashout(model: BlastOffModel = BLAST_OFF_MODEL) {
  return model === BLAST_OFF_PREVIOUS_MODEL ? 250 : BLAST_OFF_MAX_CASHOUT;
}

export function blastOffCrashFromSample(sample: number, model: BlastOffModel = BLAST_OFF_MODEL) {
  if (!Number.isSafeInteger(sample) || sample < 0 || sample >= BLAST_OFF_SAMPLE_SPACE || !isBlastOffModel(model)) {
    throw new Error("Invalid Blast Off random sample.");
  }
  const numerator = BigInt(30) * BigInt(BLAST_OFF_SAMPLE_SPACE);
  const denominator = BigInt(sample) + BigInt(1);
  // Cashout must be strictly below the crash: P(crash > x) = 0.30 / x.
  const crashCents = (numerator + denominator - BigInt(1)) / denominator;
  const cap = BigInt(Math.round(blastOffMaxCrash(model) * 100));
  return Number(crashCents < BigInt(100) ? BigInt(100) : crashCents > cap ? cap : crashCents) / 100;
}

export function blastOffPayout(stake: number, multiplier: number, model: BlastOffModel = BLAST_OFF_MODEL) {
  const stakeCents = Math.round(stake * 100), targetCents = Math.round(multiplier * 100);
  if (!Number.isFinite(stake) || !Number.isSafeInteger(stakeCents) || stakeCents <= 0 || stakeCents / 100 !== stake ||
      !Number.isFinite(multiplier) || !Number.isSafeInteger(targetCents) || targetCents < 100 ||
      multiplier > blastOffMaxCashout(model) || targetCents / 100 !== multiplier || !isBlastOffModel(model)) {
    throw new Error("Invalid Blast Off payout.");
  }
  const payoutCents = BigInt(stakeCents) * BigInt(targetCents) / BigInt(100);
  if (payoutCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Blast Off payout exceeds wallet precision.");
  return Number(payoutCents) / 100;
}
