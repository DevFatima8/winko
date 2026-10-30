import type { RoundResult } from "./lib/game";

type Props = {
  round: RoundResult | null;
  phaseLabel: string;
  betting: boolean;
};

export default function DealerFeed({ round, phaseLabel, betting }: Props) {
  const winner = round?.winner;
  return (
    <section className="gold-rim vignette scan relative overflow-hidden rounded-xl">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/media/dealer.jpg"
          alt="Live dealer at the baccarat table"
          className="h-full w-full scale-[1.06] object-cover object-center brightness-[.82] saturate-[.9]"
          style={{ filter: "contrast(1.06)" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,13,11,.75)_0%,rgba(3,13,11,.05)_38%,rgba(2,9,8,.92)_100%)]" />
        <div
          className="absolute inset-0 opacity-70 transition-[background] duration-300"
          style={{
            background:
              winner && round && round.graded !== "watched"
                ? winner === "player"
                  ? "radial-gradient(60% 50% at 30% 65%, rgba(61,139,255,.35), transparent 70%)"
                  : winner === "banker"
                    ? "radial-gradient(60% 50% at 70% 65%, rgba(255,77,84,.32), transparent 70%)"
                    : "radial-gradient(60% 50% at 50% 65%, rgba(25,209,126,.3), transparent 70%)"
                : betting
                  ? "radial-gradient(70% 60% at 50% 80%, rgba(231,200,119,.12), transparent 70%)"
                  : "transparent",
          }}
        />

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-[rgba(255,90,79,.5)] bg-black/70 px-2 py-[3px] backdrop-blur">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ff5a4f]" />
          <span className="font-num text-[8.5px] font-bold uppercase tracking-[0.22em] text-white/85">live</span>
        </div>
        <div className="absolute right-2.5 top-2.5 rounded-full border border-white/12 bg-black/65 px-2 py-[3px] backdrop-blur">
          <span className="font-num text-[8.5px] uppercase tracking-[0.16em] text-white/60">studio 04 · 8 decks</span>
        </div>

        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
          <div>
            <div className="font-num text-[8px] uppercase tracking-[0.22em] text-[#e7c877]">Dealer</div>
            <div className="font-display text-[15px] font-bold uppercase tracking-[0.1em] text-white/90">Amelia R.</div>
          </div>
          <div className="text-right">
            <div className="font-num text-[8px] uppercase tracking-[0.22em] text-[#e7c877]">Shoe 1 / 4</div>
            <div className="font-num text-[11px] uppercase tracking-[0.1em] text-white/70">{phaseLabel}</div>
          </div>
        </div>
      </div>

      {round && (
        <div className="flex items-stretch justify-between gap-2 border-t border-[rgba(231,200,119,.2)] bg-[rgba(0,0,0,.55)] px-2.5 py-2">
          {(
            [
              { side: "player", label: "PLAYER", total: round.pTotal, on: winner === "player" },
              { side: "banker", label: "BANKER", total: round.bTotal, on: winner === "banker" },
            ] as const
          ).map((row) => (
            <div
              key={row.side}
              className="flex flex-1 items-center justify-between rounded-md px-2 py-1 transition"
              style={{
                background: row.on
                  ? row.side === "player"
                    ? "linear-gradient(120deg,rgba(61,139,255,.35),rgba(61,139,255,.06))"
                    : "linear-gradient(120deg,rgba(255,77,84,.32),rgba(255,77,84,.06))"
                  : "rgba(255,255,255,.03)",
                boxShadow: row.on ? `inset 0 0 0 1px ${row.side === "player" ? "rgba(120,190,255,.6)" : "rgba(255,150,150,.55)"}` : "none",
              }}
            >
              <span
                className="font-display text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: row.on ? "#fff6d0" : "rgba(255,255,255,.5)" }}
              >
                {row.label}
              </span>
              <span className="font-num text-[16px] font-bold" style={{ color: row.on ? "#fff6d0" : "rgba(255,255,255,.7)" }}>
                {round.winner === "tie" && !row.on ? "-" : row.total}
              </span>
            </div>
          ))}
          <div
            className="flex items-center rounded-md px-2.5"
            style={{ background: winner === "tie" ? "rgba(25,209,126,.22)" : "rgba(255,255,255,.03)" }}
          >
            <span className="font-num text-[9px] uppercase tracking-[0.18em] text-white/55">tie</span>
          </div>
        </div>
      )}
    </section>
  );
}
