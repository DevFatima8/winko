import type { AviatorRoundDoc } from "@/models";

/** Read-only animation state. Never publish an unreached crash point or alter a wager. */
export function flightAnimationSnapshot(round: AviatorRoundDoc, now: number, growth: number, maxMult: number) {
  const startsAt = new Date(round.startsAt).getTime();
  const crashAt = startsAt + Math.log(round.crashPoint) / growth * 1000 + 1;
  const status = now >= crashAt ? "crashed" : now >= startsAt ? "running" : "waiting";
  return {
    serverNow: now,
    round: {
      id: round.roundNo, key: round._id, startsAt, status,
      endedAt: status === "crashed" ? crashAt : null,
      crashPoint: status === "crashed" ? round.crashPoint : null,
      multiplier: status === "crashed" ? round.crashPoint
        : Math.min(round.crashPoint, maxMult, Math.exp(growth * Math.max(0, (now - startsAt) / 1000))),
    },
  };
}
