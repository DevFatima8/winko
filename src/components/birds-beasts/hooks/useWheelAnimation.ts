"use client";

import { useEffect, useRef, useState } from "react";
import { visibleAnimationFrame } from "@/lib/visibleAnimationFrame";
import type { MultiplayerRound } from "@/lib/multiplayer-types";
import type { BirdsBeastsOutcome } from "@/lib/multiplayer-rules";
import { SLOT_COUNT, TIMES_UP_MS } from "../lib/game-config";

export function wheelStepAt(now: number, startsAt: number, endsAt: number, target: number) {
  if (![now, startsAt, endsAt].every(Number.isFinite) || endsAt <= startsAt ||
      !Number.isInteger(target) || target < 0 || target >= SLOT_COUNT) {
    throw new Error("Invalid Birds & Beasts wheel timeline.");
  }
  const progress = Math.max(0, Math.min(1, (now - startsAt) / (endsAt - startsAt)));
  // Keep some speed through the final approach instead of stalling one light early.
  const eased = 0.5 * progress + 0.5 * (1 - Math.pow(1 - progress, 3));
  return Math.floor((2 * SLOT_COUNT + target) * eased);
}

export function useWheelAnimation(round: MultiplayerRound<BirdsBeastsOutcome> | undefined, now: number) {
  const [position, setPosition] = useState<{ roundNo: number; step: number; started: boolean } | null>(null);
  const clock = useRef({ round, now, sampledAt: 0 });
  const roundNo = round?.roundNo;
  const startsAt = round ? round.bettingEndsAt + TIMES_UP_MS : undefined;
  const endsAt = round?.resultAt;
  const target = round?.result?.slot;
  const animating = !!round && round.phase !== "betting";

  useEffect(() => {
    clock.current = { round, now, sampledAt: performance.now() };
  }, [round, now]);

  useEffect(() => {
    if (!animating || roundNo === undefined || startsAt === undefined || endsAt === undefined || target === undefined) return;
    let presentedNow = clock.current.now;
    let lastFrame = clock.current.sampledAt;
    let presentedStep = wheelStepAt(presentedNow, startsAt, endsAt, target);
    return visibleAnimationFrame(time => {
      const sample = clock.current;
      if (sample.round?.roundNo !== roundNo || sample.round.phase === "betting") return false;
      const elapsed = Math.max(0, time - lastFrame);
      lastFrame = time;
      const predicted = presentedNow + elapsed;
      const observed = sample.now + Math.max(0, time - sample.sampledAt);
      const corrected = predicted + (observed - predicted) * (1 - Math.exp(-8 * Math.min(elapsed, 50) / 1000));
      presentedNow = Math.min(presentedNow + elapsed * 1.5, Math.max(presentedNow + elapsed * 0.5, corrected));
      const done = sample.round.phase === "result";
      const started = done || presentedNow >= startsAt;
      const desiredStep = wheelStepAt(presentedNow, startsAt, endsAt, target);
      const step = done ? 2 * SLOT_COUNT + target : Math.max(presentedStep, Math.min(desiredStep, presentedStep + 1));
      presentedStep = step;
      setPosition(previous => previous?.roundNo === roundNo && previous.step === step && previous.started === started
        ? previous : { roundNo, step, started });
      return !done && step < 2 * SLOT_COUNT + target;
    });
  }, [animating, roundNo, startsAt, endsAt, target]);

  if (!animating || startsAt === undefined || endsAt === undefined || target === undefined) {
    return { activeSlot: null, started: animating && startsAt !== undefined && now >= startsAt };
  }
  if (round?.phase === "result") return { activeSlot: target, started: true };
  const current = position && position.roundNo === roundNo ? position : {
    step: wheelStepAt(now, startsAt, endsAt, target), started: now >= startsAt,
  };
  return { activeSlot: current.started ? current.step % SLOT_COUNT : null, started: current.started };
}
