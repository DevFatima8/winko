"use client";

import { ANIMALS, BET_SECONDS, GROUP_MULTIPLIER, SLOT_COUNT, WHEEL, formatMoney } from "./lib/game-config";
import type { Phase, RoundRecord } from "./types";
import { useDailyPoolMode } from "@/lib/walletSync";

interface WheelProps {
  phase: Phase;
  secondsLeft: number;
  round: number;
  activeSlot: number | null;
  resultSlot: number | null;
  result: RoundRecord | null;
  showStartBanner: boolean;
  coveredSlots: Set<number>;
}

const RING_R = 46;
const RING_LEN = 2 * Math.PI * RING_R;

export default function Wheel({
  phase,
  secondsLeft,
  round,
  activeSlot,
  resultSlot,
  result,
  showStartBanner,
  coveredSlots,
}: WheelProps) {
  const poolEnabled = useDailyPoolMode();
  const activeAnimal = activeSlot !== null ? ANIMALS[WHEEL[activeSlot]] : null;
  const resultAnimal = result ? ANIMALS[result.animal] : null;
  const progress = Math.max(0, Math.min(1, secondsLeft / BET_SECONDS));
  const urgent = phase === "betting" && secondsLeft <= 3;

  return (
    <div className="wheel relative mx-auto aspect-square h-full max-h-full max-w-full select-none" style={{ aspectRatio: "1 / 1" }}>
      {/* machine body */}
      <div className="wheel-body absolute inset-0 rounded-full" />
      <div className="wheel-inner-ring absolute rounded-full" style={{ inset: "17cqw" }} />

      {/* bulbs between the lights */}
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const angle = i * 15 - 90 + 7.5;
        return (
          <span
            key={`bulb-${i}`}
            className={`bulb ${phase === "spinning" ? "bulb-fast" : ""} ${phase === "result" ? "bulb-win" : ""}`}
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translate(48.8cqw)`,
              animationDelay: `${(i % 2) * 0.45}s`,
            }}
          />
        );
      })}

      {/* the 24 lights */}
      {WHEEL.map((id, i) => {
        const animal = ANIMALS[id];
        const angle = i * 15 - 90;
        const dist = activeSlot === null ? 99 : (activeSlot - i + SLOT_COUNT) % SLOT_COUNT;
        const cls = [
          "slot",
          animal.group === "birds" ? "slot-birds" : animal.group === "beasts" ? "slot-beasts" : "slot-shark",
          dist === 0 ? "slot-active" : dist === 1 ? "slot-trail1" : dist === 2 ? "slot-trail2" : "",
          resultSlot === i ? "slot-result" : "",
          coveredSlots.has(i) && phase !== "result" ? "slot-covered" : "",
        ].join(" ");
        return (
          <div
            key={`slot-${i}`}
            className="absolute left-1/2 top-1/2"
            style={{
              width: "10.6cqw",
              height: "10.6cqw",
              transform: `translate(-50%, -50%) rotate(${angle}deg) translate(40.6cqw) rotate(${-angle}deg)`,
            }}
          >
            <div className={cls}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={animal.image} alt={animal.name} draggable={false} className="slot-img" />
              <span className="slot-mult">x{animal.multiplier}</span>
            </div>
          </div>
        );
      })}

      {/* center display */}
      <div
        className="wheel-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: "60cqw", height: "60cqw" }}
      >
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
          {phase === "betting" && (
            <circle
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke={urgent ? "#ef4444" : "#f7c948"}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN * (1 - progress)}
              style={{
                transition: secondsLeft === BET_SECONDS ? "none" : "stroke-dashoffset 1s linear, stroke 0.3s",
                filter: "drop-shadow(0 0 4px rgba(247,201,72,0.8))",
              }}
            />
          )}
        </svg>

        <div className="absolute inset-[7%] flex flex-col items-center justify-center rounded-full text-center">
          {phase === "betting" && showStartBanner && (
            <div className="center-pop flex flex-col items-center">
              <span className="text-gold font-display text-[7cqw] font-bold leading-none tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                START BET
              </span>
              <span className="mt-[1.5cqw] text-[3cqw] font-semibold uppercase tracking-[0.25em] text-emerald-200/80">
                Round #{round}
              </span>
            </div>
          )}

          {phase === "betting" && !showStartBanner && (
            <div className="flex flex-col items-center">
              <span className="text-[2.7cqw] font-semibold uppercase tracking-[0.3em] text-emerald-200/70">
                Place your bets
              </span>
              <span
                className={`font-display text-[17cqw] font-bold leading-none tabular-nums ${
                  urgent ? "text-red-400 timer-urgent" : "text-white"
                }`}
                style={{ textShadow: "0 3px 12px rgba(0,0,0,0.6)" }}
              >
                {secondsLeft}
              </span>
              <span className="text-[2.6cqw] font-medium uppercase tracking-[0.25em] text-white/50">
                Round #{round}
              </span>
            </div>
          )}

          {phase === "closed" && (
            <div className="center-pop flex flex-col items-center">
              <span className="font-display text-[7.5cqw] font-bold leading-none text-red-400 timer-urgent drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                TIME&apos;S UP
              </span>
              <span className="mt-[1.8cqw] text-[2.8cqw] font-semibold uppercase tracking-[0.25em] text-white/60">
                No more bets
              </span>
            </div>
          )}

          {phase === "spinning" && activeAnimal && (
            <div className="flex flex-col items-center">
              <div className="center-avatar" style={{ width: "24cqw", height: "24cqw" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeAnimal.image} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />
              </div>
              <span className="mt-[1.5cqw] font-display text-[4.6cqw] font-bold leading-none text-white">
                {activeAnimal.name}
              </span>
              <span className="text-gold text-[3.4cqw] font-bold">x{activeAnimal.multiplier}</span>
            </div>
          )}

          {phase === "result" && resultAnimal && result && (
            <div className="center-pop flex flex-col items-center">
              <div className="center-avatar center-avatar-win" style={{ width: "23cqw", height: "23cqw" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultAnimal.image} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />
              </div>
              <span className="mt-[1.2cqw] font-display text-[4.4cqw] font-bold leading-none text-white">
                {resultAnimal.name}{" "}
                <span className="text-gold">x{resultAnimal.multiplier}</span>
              </span>
              {resultAnimal.group !== "shark" && (
                <span className="text-[2.5cqw] font-semibold uppercase tracking-[0.2em] text-white/60">
                  {resultAnimal.group} win x{GROUP_MULTIPLIER}
                </span>
              )}
              {result.totalBet === 0 ? (
                <span className="mt-[1cqw] text-[2.8cqw] font-semibold text-white/50">No bet placed</span>
              ) : result.net > 0 ? (
                <span className="win-text mt-[1cqw] font-display text-[4.6cqw] font-bold leading-none text-emerald-300">
                  {poolEnabled ? `Daily payout pending · provisional claim ${formatMoney(result.payout)}` : `WIN +${formatMoney(result.payout)}`}
                </span>
              ) : poolEnabled ? (
                <span className="mt-[1cqw] font-display text-[4.2cqw] font-bold leading-none text-red-400">
                  {`Daily payout pending · provisional claim ${formatMoney(result.payout)}`}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
