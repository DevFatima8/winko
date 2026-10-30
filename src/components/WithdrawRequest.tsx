"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, Headphones, Landmark, Bitcoin, RefreshCw, WalletCards, X } from "lucide-react";
import { PaymentLogo } from "./PaymentLogo";
import { withdrawAction } from "@/lib/clientActions";
import { getCurrentUser } from "@/lib/auth";
import { usePage } from "@/lib/useDb";
import type { Provider, WithdrawalAccount } from "@/models";

type Limits = { name: string; daily: number; perMax: number; usedToday: number; min: number; withdrawalsToday?: number; withdrawalsPerDay?: number };
type Accounts = Partial<Record<Provider, WithdrawalAccount>>;
type Tab = "Request withdrawal" | "Receiving account" | "Withdrawal records";
const TABS: Tab[] = ["Request withdrawal", "Receiving account", "Withdrawal records"];
const money = (n: number) => `Rs. ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = "w-full min-w-0 rounded-lg border border-white/25 bg-black/20 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#ffc933] disabled:opacity-60";
const name = (p: Provider) => p === "jazzcash" ? "JazzCash" : "Easypaisa";

function Records() {
  return usePage(async () => {
    const response = await fetch("/api/player/withdraw", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Withdrawal records load nahi ho sake.");
    const rows: { _id: string; provider: Provider; amount: number; status: string; createdAt: string; adminNote?: string }[] = data.transactions;
    return (
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-medium text-white">Withdrawal records (latest 100)</h2>
        {rows.length === 0 && <p className="rounded-xl bg-black/20 p-6 text-center text-sm text-slate-400">Abhi koi withdrawal nahi.</p>}
        {rows.map((r) => <div key={r._id} className="space-y-1 rounded-xl border border-white/15 bg-black/20 p-3 text-xs">
          <div className="flex justify-between gap-2"><span className="text-white">{name(r.provider)}</span><b className="text-[#ffc933]">{money(r.amount)}</b></div>
          <div className="flex justify-between gap-2 text-slate-400"><span>{new Date(r.createdAt).toLocaleString("en-GB")}</span><span className={r.status === "approved" ? "text-emerald-300" : r.status === "rejected" ? "text-red-300" : "text-amber-300"}>{r.status}</span></div>
          {r.adminNote && <p className="break-words text-slate-300">{r.adminNote}</p>}
        </div>)}
      </div>
    );
  }, []);
}

export function WithdrawRequest({ balance, hasPin, limits, initialAccounts = {} }: { balance: number; hasPin: boolean; limits?: Limits; initialAccounts?: Accounts }) {
  const [tab, setTab] = useState<Tab>("Request withdrawal");
  const [accounts, setAccounts] = useState<Accounts>(initialAccounts);
  const [selected, setSelected] = useState<Provider | null>(initialAccounts.jazzcash ? "jazzcash" : initialAccounts.easypaisa ? "easypaisa" : null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [bal, setBal] = useState(balance);
  const [used, setUsed] = useState(limits?.usedToday ?? 0);
  const [count, setCount] = useState(limits?.withdrawalsToday ?? 0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const account = selected ? accounts[selected] : undefined;
  const min = limits?.min ?? 1000;
  const maximum = Math.max(0, Math.min(bal, limits?.perMax || Infinity, limits?.daily ? Math.max(0, limits.daily - used) : Infinity));
  const limitReached = !!limits?.withdrawalsPerDay && count >= limits.withdrawalsPerDay;

  const refresh = async () => {
    setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/player/wallet", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account refresh nahi ho saka.");
      setAccounts(data.withdrawalAccounts);
      setBal(data.me.balance);
      setUsed(data.limits.usedToday);
      setCount(data.limits.withdrawalsToday);
    } catch (e) { setError(e instanceof Error ? e.message : "Account refresh nahi ho saka."); }
    finally { setRefreshing(false); }
  };
  const edit = (p: Provider) => {
    setHolder(accounts[p]?.holderName ?? "");
    setNumber(accounts[p]?.accountNumber ?? "");
    setError(""); setSuccess(""); setEditing(p);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    if (holder.trim().length < 3) return setError("Account holder ka poora naam likhein.");
    if (!/^03\d{9}$/.test(number)) return setError("Account number 03XXXXXXXXX format mein likhein.");
    setBusy(true);
    try {
      const response = await fetch("/api/player/receiving-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: editing, holderName: holder, accountNumber: number }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account save nahi ho saka.");
      setAccounts((prev) => ({ ...prev, [editing]: data.account }));
      setSelected(editing); setEditing(null); setTab("Request withdrawal"); setSuccess("");
    } catch (e) { setError(e instanceof Error ? e.message : "Account save nahi ho saka."); }
    finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setSuccess("");
    const value = Number(amount);
    if (!account) return setError("Pehle withdrawal account add karein.");
    if (!Number.isInteger(value) || value < min) return setError(`Minimum withdrawal ${money(min)} hai. Poore rupees enter karein.`);
    if (value > maximum || limitReached) return setError("Balance ya aaj ki withdrawal limit se zyada amount hai.");
    if (!/^\d{4}$/.test(pin)) return setError("4-digit Withdrawal PIN enter karein.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("provider", account.provider); form.set("holderName", account.holderName); form.set("accountNumber", account.accountNumber); form.set("amount", String(value)); form.set("pin", pin);
      const result = await withdrawAction(undefined, form);
      if (result?.error) throw new Error(result.error);
      setSuccess(result?.success ?? "Withdrawal request submit ho gayi.");
      setBal((prev) => prev - value); setUsed((prev) => prev + value); setCount((prev) => prev + 1); setAmount(""); setPin("");
      void getCurrentUser(true).catch((e) => console.error("[withdraw balance refresh]", e));
    } catch (e) { setError(e instanceof Error ? e.message : "Withdrawal request submit nahi ho saki."); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-[65dvh] text-white">
      <header className="flex items-center gap-1 border-b border-white/15">
        <Link href="/player" aria-label="Back" className="shrink-0 p-2 text-slate-300"><ArrowLeft size={18} /></Link>
        <div role="tablist" aria-label="Withdrawal" className="flex min-w-0 flex-1 gap-5 overflow-x-auto [scrollbar-width:none]">
          {TABS.map((t) => <button type="button" key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setEditing(null); setError(""); }} className={`shrink-0 whitespace-nowrap border-b-2 py-3 text-[13px] ${tab === t ? "border-[#ffc933] text-[#ffc933]" : "border-transparent text-slate-200"}`}>{t}</button>)}
        </div>
        <button type="button" aria-label="Support" onClick={() => window.dispatchEvent(new CustomEvent("wx:open-support"))} className="shrink-0 p-2 text-[#ffc933]"><Headphones size={21} /></button>
      </header>

      {tab === "Request withdrawal" && <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-white/15 px-1 py-3 text-sm"><span className="mr-1 text-slate-400">Balance</span><b className="text-[#ffc933]">{money(bal)}</b><button type="button" disabled={refreshing || busy} onClick={refresh} aria-label="Refresh balance" className="px-1 text-[#ffc933]"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button></div>
        <div className="grid grid-cols-3 gap-2 border-b border-white/15 pb-3">
          <button type="button" disabled className="flex min-h-12 flex-col items-center justify-center rounded-lg border border-white/15 px-1 text-xs text-slate-500">NO Wallet<span className="text-[9px]">Unavailable</span></button>
          <button type="button" aria-pressed className="rounded-lg border border-[#ffc933] bg-[#ffc933]/5 px-1 text-xs text-[#ffc933]">Normal withdrawal</button>
          <button type="button" disabled className="flex flex-col items-center justify-center rounded-lg border border-white/15 px-1 text-xs text-slate-500">Convert to crypto<span className="text-[9px]">Unavailable</span></button>
        </div>
        <button type="button" onClick={() => { setTab("Receiving account"); setError(""); }} className="flex w-full items-center gap-3 rounded-lg border border-white/30 px-3 py-3 text-left">
          <WalletCards size={25} className="shrink-0 text-[#ffc933]" />
          <span className="min-w-0 flex-1 text-sm text-slate-300">{account ? <><span className="block text-white">{name(account.provider)} · {account.accountNumber}</span><span className="block truncate text-xs text-slate-400">{account.holderName}</span></> : "Add withdrawal account"}</span><ChevronRight size={18} className="text-slate-500" />
        </button>
        <form onSubmit={submit} className="space-y-4">
          <div><label htmlFor="wd-amount" className="mb-2 block text-base">Withdrawal Amount</label><input id="wd-amount" type="number" inputMode="numeric" min={min} max={maximum} step={1} disabled={!account || busy} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={account ? `Rs  Min ${min.toLocaleString()} - Max ${Math.floor(maximum).toLocaleString()}` : "Rs  Add a withdrawal account before withdrawing"} className={input} /></div>
          {account && <div>
            {hasPin ? <><label htmlFor="wd-pin" className="mb-2 block text-sm">Withdrawal PIN</label><input id="wd-pin" type="password" autoComplete="off" disabled={busy} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit PIN" className={input} /></> : <p className="text-xs text-amber-200">Pehle <Link href="/player/profile/security" className="underline">Security Center</Link> se Withdrawal PIN set karein.</p>}
            <p className="mt-2 text-[11px] text-slate-400">Min {money(min)} · Max {money(maximum)}{limitReached && " · Aaj ki withdrawal count limit complete ho gayi."}</p>
          </div>}
          <button type="submit" disabled={busy || !account || !hasPin || !amount || !/^\d{4}$/.test(pin) || maximum < min || limitReached} className="btn-gold mt-2 min-h-12 w-full rounded-lg px-3 py-3 text-sm font-semibold disabled:!bg-none disabled:!bg-slate-600 disabled:!text-slate-300 disabled:!shadow-none disabled:opacity-60">{busy ? "Submitting..." : "Confirm withdrawal"}</button>
        </form>
        {account && <p className="text-[11px] leading-relaxed text-slate-400">Instant withdrawal available nahi hai. Admin approval ke baad payment agle din raat 12:00 AM tak bheji jayegi.</p>}
      </div>}

      {tab === "Receiving account" && <div className="space-y-3 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-black/25 p-3 text-sm">Receiving account <span className="text-slate-400">({Object.keys(accounts).length})</span><button type="button" disabled={refreshing || busy} onClick={refresh} aria-label="Refresh receiving accounts" className="text-[#ffc933]"><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button></div>
        {(["jazzcash", "easypaisa"] as const).map((p) => <div key={p} className="rounded-lg border border-white/25 bg-black/15">
          <button type="button" onClick={() => edit(p)} className="flex w-full items-center gap-3 px-3 py-3 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white"><PaymentLogo provider={p} height={30} /></span><span className="min-w-0 flex-1 text-sm">{name(p)}{accounts[p] && <span className="block truncate text-xs text-slate-400">{accounts[p]?.accountNumber}</span>}</span><span className="text-sm text-[#ffc933]">{accounts[p] ? "Edit" : "Add"}</span><ChevronRight size={18} className="text-slate-500" /></button>
          {accounts[p] && <button type="button" onClick={() => { setSelected(p); setTab("Request withdrawal"); }} className="w-full border-t border-white/10 py-2 text-xs text-[#ffc933]">Use this account</button>}
        </div>)}
        {[{ label: "NO Wallet", icon: <WalletCards size={24} /> }, { label: "Bank Transfer", icon: <Landmark size={24} /> }, { label: "Crypto", icon: <Bitcoin size={24} /> }].map((m) => <button type="button" key={m.label} disabled className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-black/15 px-3 py-3 text-left text-slate-500"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5">{m.icon}</span><span className="flex-1 text-sm">{m.label}</span><span className="text-xs">Unavailable</span><ChevronRight size={18} /></button>)}
      </div>}
      {tab === "Withdrawal records" && <Records />}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
      {success && <p role="status" className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{success}</p>}

      {editing && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
        <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="receiving-title" className="w-full max-w-sm space-y-4 rounded-xl border border-[#ffc933]/30 bg-[#140c2a] p-4">
          <div className="flex items-center justify-between"><h2 id="receiving-title" className="text-sm font-semibold">{name(editing)} receiving account</h2><button type="button" aria-label="Close account editor" disabled={busy} onClick={() => { setEditing(null); setError(""); }}><X size={19} /></button></div>
          <div><label htmlFor="wd-holder" className="mb-1 block text-xs text-slate-300">Account holder name</label><input autoFocus id="wd-holder" maxLength={100} disabled={busy} value={holder} onChange={(e) => setHolder(e.target.value)} className={input} /></div>
          <div><label htmlFor="wd-number" className="mb-1 block text-xs text-slate-300">Account number</label><input id="wd-number" disabled={busy} inputMode="numeric" maxLength={11} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="03XXXXXXXXX" className={input} /></div>
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
          <button type="submit" disabled={busy} className="btn-gold w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60">{busy ? "Saving..." : "Save account"}</button>
        </form>
      </div>}
    </div>
  );
}
