import type { AviatorRoundDoc } from "@/models";
import { AVIATOR_LEGACY_MAX_CRASH, aviatorReachAt } from "./aviatorRules";

/** Read-only animation state. Never publish an unreached crash point or alter a wager. */
export function flightAnimationSnapshot(round: AviatorRoundDoc, now: number, growth: number, maxMult: number) {
  const startsAt = new Date(round.startsAt).getTime();
  const crashAt = round.status === "crashed" && round.endedAt != null ? new Date(round.endedAt).getTime()
    : round.fairness ? aviatorReachAt(startsAt, round.crashPoint, growth)
    : startsAt + Math.log(round.crashPoint) / growth * 1000 + 1;
  const status = round.status === "crashed" || now >= crashAt ? "crashed" : now >= startsAt ? "running" : "waiting";
  return {
    serverNow: now,
    round: {
      id: round.roundNo, key: round._id, startsAt, status,
      endedAt: status === "crashed" ? crashAt : null,
      crashPoint: status === "crashed" ? round.crashPoint : null,
      multiplier: status === "crashed" ? round.crashPoint
        : Math.min(round.crashPoint, round.fairness ? maxMult : AVIATOR_LEGACY_MAX_CRASH, Math.exp(growth * Math.max(0, (now - startsAt) / 1000))),
    },
  };
}
