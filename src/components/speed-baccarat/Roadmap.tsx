import { useMemo, useState } from "react";
import type { HistoryEntry } from "./lib/game";
import { buildBigRoad, buildPatternRoad, type BigCell } from "./lib/game";

const TABS = [
  { id: "bead", label: "Bead Road" },
  { id: "big", label: "Big Road" },
  { id: "eye", label: "Big Eye Boy" },
  { id: "small", label: "Small Road" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SIDE_BG: Record<string, string> = {
  player: "linear-gradient(160deg,#4d97ff,#12479f)",
  banker: "linear-gradient(160deg,#ff6a6a,#a1111c)",
  tie: "linear-gradient(160deg,#3ce29a,#0a7d4b)",
};

function PairDots({ cell }: { cell: BigCell }) {
  if (cell.pair === "none") return null;
  return (
    <span className="absolute -right-1 -top-1 flex gap-[1px]">
      {(cell.pair === "player" || cell.pair === "both") && (
        <span className="block h-[5px] w-[5px] rounded-full bg-[#5aa2ff] ring-1 ring-black/60" />
      )}
      {(cell.pair === "banker" || cell.pair === "both") && (
        <span className="block h-[5px] w-[5px] rounded-full bg-[#ff5a5f] ring-1 ring-black/60" />
      )}
    </span>
  );
}

export default function Roadmap({ history }: { history: HistoryEntry[] }) {
  const [tab, setTab] = useState<TabId>("big");

  const { columns, orphanTies } = useMemo(() => buildBigRoad(history), [history]);
  const eye = useMemo(() => buildPatternRoad(columns, 1), [columns]);
  const small = useMemo(() => buildPatternRoad(columns, 2), [columns]);

  const visibleCols = Math.max(12, columns.length);
  const bead = history.slice(-72);

  return (
    <section className="gold-rim relative flex min-h-0 flex-col rounded-xl p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-[#e7c877]">Scoreboard</h2>
        <span className="font-num text-[10px] uppercase tracking-[0.14em] text-white/40">{history.length} hands</span>
      </header>

      <nav className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`font-num rounded-[4px] border px-2 py-[3px] text-[9.5px] uppercase tracking-[0.14em] transition ${
              tab === t.id
                ? "border-[rgba(231,200,119,.7)] bg-[rgba(231,200,119,.14)] text-[#ffe9a8]"
                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="thin-scroll relative min-h-[168px] overflow-auto rounded-md bg-[rgba(0,0,0,.34)] p-2 ring-1 ring-white/5">
        {tab === "bead" && (
          <div className="flex gap-[3px]">
            {Array.from({ length: Math.ceil(bead.length / 6) || 1 }, (_, col) => (
              <div key={col} className="flex flex-col gap-[3px]">
                {Array.from({ length: 6 }, (_, row) => {
                  const entry = bead[col * 6 + row];
                  if (!entry)
                    return <div key={row} className="h-[26px] w-[26px] rounded-[3px] border border-white/5 bg-white/[.02]" />;
                  return (
                    <div
                      key={row}
                      className="relative flex h-[26px] w-[26px] items-center justify-center rounded-[3px] text-[11px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)]"
                      style={{ background: SIDE_BG[entry.winner] }}
                    >
                      <span className="font-num uppercase">{entry.winner === "player" ? "P" : entry.winner === "banker" ? "B" : "T"}</span>
                      <span className="absolute bottom-[1px] right-[2px] font-num text-[7px] text-white/75">
                        {entry.winner === "tie" ? "" : `${entry.pTotal}-${entry.bTotal}`}
                      </span>
                      {(entry.playerPair || entry.bankerPair) && (
                        <span className="absolute left-[1px] top-[1px] h-[5px] w-[5px] rounded-full bg-[#ffe9a8] ring-1 ring-black/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {tab === "big" && (
          <div className="flex gap-[2px]">
            {Array.from({ length: visibleCols }, (_, c) => {
              const col = columns[c];
              return (
                <div key={c} className="relative flex h-[156px] w-[26px] flex-col border-l border-white/[.06]">
                  {Array.from({ length: 6 }, (_, r) => (
                    <div key={r} className="h-[26px] w-full border-b border-white/[.05]" />
                  ))}
                  {col?.map((cell, r) => (
                    <div
                      key={`c${c}${r}`}
                      className="absolute left-[1px] flex h-[26px] w-[24px] items-center justify-center"
                      style={{ top: r * 26 }}
                    >
                      <span
                        className="relative block h-[19px] w-[19px] rounded-full"
                        style={{
                          border: `2.4px solid ${cell.side === "banker" ? "#ff4d54" : "#3d8bff"}`,
                          boxShadow: `0 0 8px ${cell.side === "banker" ? "rgba(255,77,84,.35)" : "rgba(61,139,255,.35)"}`,
                        }}
                      >
                        {cell.ties > 0 && (
                          <span
                            className="absolute left-1/2 top-1/2 block h-[2.4px] w-[26px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] rounded-full bg-[#19d17e]"
                            title={`${cell.ties} tie${cell.ties > 1 ? "s" : ""}`}
                          />
                        )}
                        <PairDots cell={cell} />
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {orphanTies > 0 && (
              <div className="ml-1 flex h-[156px] w-[34px] flex-col items-center justify-start pt-1">
                <span className="font-num text-[9px] text-[#19d17e]">T×{orphanTies}</span>
              </div>
            )}
          </div>
        )}

        {(tab === "eye" || tab === "small") && (
          <div className="relative flex h-[156px] gap-[2px]">
            {Array.from({ length: visibleCols }, (_, c) => (
              <div key={c} className="relative h-[156px] w-[22px] border-l border-white/[.06]">
                {Array.from({ length: 6 }, (_, r) => (
                  <div key={r} className="h-[26px] w-full border-b border-white/[.05]" />
                ))}
                {(tab === "eye" ? eye : small)
                  .filter((d) => d.col === c)
                  .map((d, i) => (
                    <span
                      key={i}
                      className="absolute block h-[13px] w-[13px] rounded-[2px]"
                      style={{
                        top: d.row * 26 + 6,
                        left: 4,
                        background: d.red
                          ? "linear-gradient(150deg,#ff6b70,#b81a25)"
                          : "linear-gradient(150deg,#5fa1ff,#1352b8)",
                        boxShadow: "0 1px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.35)",
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 border-t border-white/5 pt-2">
        {(["player", "banker", "tie"] as const).map((side) => {
          const n = history.filter((h) => h.winner === side).length;
          const pct = history.length ? Math.round((n / history.length) * 100) : 0;
          return (
            <div key={side} className="flex flex-1 items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: side === "player" ? "#3d8bff" : side === "banker" ? "#ff4d54" : "#19d17e" }}
              />
              <span className="font-num text-[10px] uppercase tracking-[0.1em] text-white/55">
                {side.slice(0, 3)} {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
