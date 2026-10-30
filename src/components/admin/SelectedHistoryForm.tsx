"use client";

import { useState } from "react";
import { deleteSelectedHistoryAction } from "@/lib/actions";
import { HISTORY_CATEGORIES } from "@/lib/historySelection";
import { HistoryActionForm } from "./HistoryActionForm";

const input = "mt-1 w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2.5 text-sm text-white";

export function SelectedHistoryForm({ userId }: { userId?: string }) {
  const [scope, setScope] = useState("selected");
  const [period, setPeriod] = useState("week");
  return <HistoryActionForm action={deleteSelectedHistoryAction} confirmation="DELETE SELECTED HISTORY" label="Delete selected history only">
    {userId && <input type="hidden" name="userId" value={userId} />}
    <p className="text-sm text-[#b8a7e6]">{userId ? "Only this player's history" : "History for all players / referral agents"}. Wallet balance, deposit/withdrawal totals, VIP progress, login accounts and staff data will not change. Pending bets/payments, active games, claimable wins and current login sessions are preserved.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs text-[#b8a7e6]">History selection<select name="scope" value={scope} onChange={(event) => setScope(event.target.value)} className={input}><option value="selected">Selected categories</option><option value="all">All history categories</option></select></label>
      <label className="block text-xs text-[#b8a7e6]">Time period<select name="period" value={period} onChange={(event) => setPeriod(event.target.value)} className={input}><option value="day">Days</option><option value="week">Weeks (7 days each)</option><option value="month">Months (30 days each)</option><option value="year">Years (365 days each)</option><option value="custom">Custom days</option><option value="all">All time</option></select></label>
      {period !== "all" && period !== "custom" && <label className="block text-xs text-[#b8a7e6]">How many {period === "day" ? "days" : period === "week" ? "weeks" : period === "month" ? "months" : "years"}?<input name="count" type="number" min="1" max={Math.floor(36500 / ({ day: 1, week: 7, month: 30, year: 365 }[period] ?? 1))} step="1" defaultValue="1" required className={input} /></label>}
      {period !== "all" && <label className="block text-xs text-[#b8a7e6]">Which records?<select name="direction" defaultValue="last" className={input}><option value="last">Within the last selected period</option><option value="older">Older than the selected period</option></select></label>}
      {period === "custom" && <label className="block text-xs text-[#b8a7e6]">Number of days<input name="days" type="number" min="1" max="36500" step="1" required className={input} /></label>}
    </div>
    {scope === "selected" && <fieldset className="rounded-xl border border-[#3a2470] p-3"><legend className="px-1 text-xs text-[#b8a7e6]">Select one or more categories</legend><div className="grid gap-2 sm:grid-cols-2">{HISTORY_CATEGORIES.map(({ value, label }) => <label key={value} className="flex items-center gap-2 text-sm text-white"><input type="checkbox" name="categories" value={value} />{label}</label>)}</div></fieldset>}
    <p className="text-xs text-amber-200">Back up the database first. Dates use each record&apos;s creation time. Deleting support history removes matching chats and all their messages. This is history-only deletion, not an amount reversal or wallet reset.</p>
    <label className="block text-xs text-[#b8a7e6]">Current Agent password<input name="password" type="password" autoComplete="current-password" required className={input} /></label>
    <label className="block text-xs text-[#b8a7e6]">Type DELETE SELECTED HISTORY<input name="confirmation" autoComplete="off" required className={input} /></label>
  </HistoryActionForm>;
}
