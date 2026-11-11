import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

export function verifyAviatorRound(table, nonce, seed, commitment, publishedCrash, model = "aviator-80-capped-v1") {
  if (!["aviator", "aviator-x"].includes(table) || !Number.isSafeInteger(nonce) || nonce < 0 ||
      !/^[a-f0-9]{64}$/.test(seed) || !/^[a-f0-9]{64}$/.test(commitment) ||
      !["aviator-80-capped-v1", "aviator-80-pre2-v2"].includes(model)) {
    throw new Error("Expected table, integer nonce, revealed 64-character seed and 64-character commitment.");
  }
  const hash = createHash("sha256").update(seed, "utf8").digest("hex");
  const digest = createHmac("sha256", seed)
    .update(`${model}:${table}:winkox-aviator-public-v1:${nonce}`, "utf8").digest("hex");
  const denominator = BigInt(`0x${digest.slice(0, 13)}`) + 1n;
  const cents = (80n * (2n ** 52n) + denominator - 1n) / denominator;
  const capped = cents < 100n ? 100n : cents > 9999n ? 9999n : cents;
  const crashPoint = Number(model === "aviator-80-pre2-v2" && capped === 200n ? 199n : capped) / 100;
  if (publishedCrash !== undefined && (!Number.isFinite(publishedCrash) || publishedCrash < 1 ||
      publishedCrash > 99.99 || Math.round(publishedCrash * 100) / 100 !== publishedCrash)) {
    throw new Error("Published crash must be 1.00x through 99.99x in hundredths.");
  }
  const validCommitment = hash === commitment;
  const validCrashPoint = publishedCrash === undefined ? undefined : publishedCrash === crashPoint;
  return { model, validCommitment, validCrashPoint, verified: validCommitment && validCrashPoint !== false, hash, digest, crashPoint };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [table, nonce, seed, hash, crash, model] = process.argv.slice(2);
    const result = verifyAviatorRound(table, Number(nonce), seed, hash, crash === undefined ? undefined : Number(crash), model);
    console.log(JSON.stringify(result, null, 2));
    if (!result.verified) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    console.error("Usage: node scripts\\verify-aviator-round.mjs <aviator|aviator-x> <nonce> <revealed-seed> <published-hash> [published-crash] [model] (omitted model uses legacy aviator-80-capped-v1)");
    process.exitCode = 1;
  }
}
