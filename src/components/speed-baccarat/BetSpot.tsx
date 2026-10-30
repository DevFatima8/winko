import type { BetMeta } from "./lib/game";
import { money } from "./lib/game";
import { ChipStack } from "./Chip";

const TONES: Record<BetMeta["tone"], { face: string; edge: string; ink: string }> = {
  blue: {
    face: "radial-gradient(circle at 50% 30%, #2f86ff 0%, #1350b4 52%, #06224d 100%)",
    edge: "rgba(120,190,255,.75)",
    ink: "#eaf3ff",
  },
  red: {
    face: "radial-gradient(circle at 50% 30%, #ff4a52 0%, #b71c26 52%, #4d060c 100%)",
    edge: "rgba(255,160,160,.7)",
    ink: "#fff0f0",
  },
  green: {
    face: "radial-gradient(circle at 50% 30%, #23d98a 0%, #0a8b53 52%, #04301f 100%)",
    edge: "rgba(150,255,205,.65)",
    ink: "#e9fff4",
  },
  gold: {
    face: "radial-gradient(circle at 50% 30%, #ffe9a8 0%, #c99a34 52%, #4c3608 100%)",
    edge: "rgba(255,240,194,.8)",
    ink: "#241a02",
  },
};

type Props = {
  meta: BetMeta;
  amount: number;
  disabled?: boolean;
  /** Still clickable while disabled so the click can queue a bet for the next round. */
  queueable?: boolean;
  size?: "lg" | "sm";
  state?: "win" | "lose" | "push" | null;
  onClick?: () => void;
  onClear?: () => void;
};

export default function BetSpot({ meta, amount, disabled, queueable, size = "lg", state = null, onClick, onClear }: Props) {
  const tone = TONES[meta.tone];
  const dims = size === "lg" ? "h-[82px] w-[82px] sm:h-[105px] sm:w-[105px]" : "h-[62px] w-[62px] sm:h-[74px] sm:w-[74px]";
  const payout = meta.payout === 0.95 ? "1.95×" : `${meta.payout}×`;

  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled && !queueable}
        aria-label={disabled && queueable ? `Queue ${meta.label} for next round` : `Bet ${meta.label}`}
        className={`spot group ${dims} ${state === "win" ? "spot-live winner-glow" : ""} flex flex-col items-center justify-center rounded-full`}
        style={{
          background: tone.face,
          boxShadow: `inset 0 2px 10px rgba(255,255,255,.22), inset 0 -14px 22px rgba(0,0,0,.45), 0 0 0 2px ${tone.edge}, 0 0 0 6px rgba(0,0,0,.35), 0 16px 26px -14px rgba(0,0,0,.8)`,
          outline: state === "win" ? "2px solid rgba(255,240,194,.95)" : "none",
          outlineOffset: 4,
        }}
      >
        <span
          className="absolute inset-[9px] rounded-full border border-dashed"
          style={{ borderColor: "rgba(255,255,255,.22)" }}
        />
        <span
          className={`font-display font-bold uppercase leading-none ${size === "lg" ? "text-[15px] sm:text-[17px]" : "text-[10px] sm:text-[11px]"}`}
          style={{ color: tone.ink, letterSpacing: "0.1em", textShadow: "0 2px 6px rgba(0,0,0,.6)" }}
        >
          {meta.label.split(" ").map((word) => (
            <span key={word} className="block">
              {word}
            </span>
          ))}
        </span>
        <span
          className={`font-num ${size === "lg" ? "mt-1 text-[11px]" : "mt-0.5 text-[9px]"}`}
          style={{ color: tone.ink, opacity: 0.82, letterSpacing: "0.14em" }}
        >
          {payout}
        </span>

        {amount > 0 && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="absolute -top-2 right-1 rounded-full border border-[rgba(231,200,119,.5)] bg-black/80 px-2 py-[2px] font-num text-[10px] font-bold text-[#ffe9a8] shadow-lg">
              {money(amount)}
            </span>
            <span className="chip-drop absolute -top-1 left-1/2 -translate-x-1/2">
              <ChipStack amount={amount} size={size === "lg" ? 34 : 26} />
            </span>
          </span>
        )}
      </button>

      {amount > 0 && !disabled && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="font-num rounded-full border border-white/15 bg-black/60 px-2 py-[1px] text-[9px] uppercase tracking-[0.18em] text-white/60 transition hover:border-[rgba(231,200,119,.6)] hover:text-[#ffe9a8]"
        >
          remove
        </button>
      )}
      {!(amount > 0 && !disabled && onClear) && (
        <span
          className={`font-num text-[9px] uppercase tracking-[0.18em] ${
            state === "win" ? "text-[#8ff0b6]" : state === "lose" ? "text-[#ff9a94]" : state === "push" ? "text-white/50" : "text-transparent"
          }`}
        >
          {state === "win" ? "won" : state === "lose" ? "No win" : state === "push" ? "push" : "·"}
        </span>
      )}
    </div>
  );
}
