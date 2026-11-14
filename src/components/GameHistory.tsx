"use client";

import { useEffect, useState } from "react";

type Play = {
  id: string; round: number | null; bet: number; payout: number;
  outcome: string; at: string; poolPending: boolean; claim: number;
};

export function GameHistory({ game }: { game: string }) {
  const [open, setOpen] = useState(false);
  const [plays, setPlays] = useState<Play[]>([]);
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/player/history?game=${encodeURIComponent(game)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "History unavailable.");
        if (!Array.isArray(data.plays)) throw new Error("Invalid history response.");
        if (controller.signal.aborted) return;
        setPlays(data.plays);
        setLimit(data.limit);
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("[game history]", cause);
          setError(cause instanceof Error ? cause.message : "History unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [game, open, retry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => { setLoading(true); setError(""); setOpen(true); }} aria-label="View previous games"
        className="rounded-lg border border-slate-500 bg-slate-950 px-3 py-1 text-xs font-bold text-white">
        History
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3" onClick={() => setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="game-history-title" tabIndex={-1}
            ref={element => { element?.focus(); }} onClick={event => event.stopPropagation()}
            className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100">
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 id="game-history-title" className="font-bold">Previous games (last {limit})</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close history" className="rounded border border-slate-600 px-3 py-2">Close</button>
            </header>
            {loading ? <p role="status">Loading history...</p> : error ? (
              <div role="alert">{error} <button type="button" onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }} className="underline">Retry</button></div>
            ) : plays.length === 0 ? <p>No completed games yet. Your real results will appear here.</p> : (
              <div className="min-h-0 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-slate-400"><th className="py-2">Round / time</th><th>Bet</th><th>Return</th><th>Status</th></tr></thead>
                  <tbody>{plays.map(play => (
                    <tr key={play.id} className="border-t border-slate-800">
                      <td className="py-3">{play.round ? `#${play.round}` : new Date(play.at).toLocaleString()}</td>
                      <td>Rs. {play.bet.toLocaleString()}</td>
                      <td>Rs. {(play.poolPending ? play.claim : play.payout).toLocaleString()}</td>
                      <td>{play.poolPending ? "Claim pending" : play.outcome}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
