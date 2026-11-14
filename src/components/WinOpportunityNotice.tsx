"use client";

import { useState, type ReactNode } from "react";
import { DAILY_POOL_SETTLEMENT_RULES, type DailyPoolGame } from "@/lib/dailyPoolRules";
import { acceptDailyPool } from "@/lib/dailyPoolConsent";

export function WinOpportunityNotice({ game, loaded, enabled, children }: { game: DailyPoolGame; loaded: boolean; enabled: boolean; children: ReactNode }) {
  const [acceptedMode, setAcceptedMode] = useState<boolean | null>(null);
  const rules = DAILY_POOL_SETTLEMENT_RULES;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!loaded || !enabled || acceptedMode === enabled ? (
        <>
          {loaded && enabled && <details className="shrink-0 border-b border-amber-400/40 bg-amber-950 p-2 text-xs text-amber-100">
            <summary className="cursor-pointer font-bold">Daily pool: claims are provisional. Settlement rules</summary>
            <ul className="max-h-48 space-y-2 overflow-y-auto p-2">{rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
          </details>}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </>
      ) : (
        <section aria-label="Game settlement status" className="m-auto max-h-full max-w-3xl overflow-y-auto rounded-xl border border-amber-400/40 bg-slate-950 p-5 text-sm text-slate-200">
          <h2 className="mb-3 text-lg font-bold text-amber-200">Daily pool settlement</h2>
          <ul className="list-disc space-y-3 pl-5">{rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
          <button type="button" className="mt-4 rounded-lg bg-amber-400 px-4 py-2 font-bold text-black" onClick={() => {
            acceptDailyPool(game);
            setAcceptedMode(enabled);
          }}>I understand these rules - continue</button>
        </section>
      )}
    </div>
  );
}
