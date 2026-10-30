"use client";

import { localApi } from "@/lib/client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { ZapIcon } from "@/components/Icons";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-[#d946ef]";
type Account = { provider: "jazzcash" | "easypaisa"; accountTitle: string; accountNumber: string };

export function InstantPayForm({ kind, min, max, label, hasPin, accounts = [], initialAmount }: { kind: "deposit" | "withdraw"; min: number; max: number; label: string; hasPin: boolean; accounts?: Account[]; initialAmount?: number }) {
  const { isUr } = useI18n();
  const router = useRouter();
  const [provider, setProvider] = useState<"jazzcash" | "easypaisa">("jazzcash");
  const [amount, setAmount] = useState(initialAmount ?? (kind === "deposit" ? 1000 : 500));
  const [acc, setAcc] = useState("");
  const [holder, setHolder] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await localApi("/api/gateway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", kind, provider, amount, accountNumber: acc, holderName: holder, pin, referenceId, proofImage }) });
    const j = await r.json();
    setBusy(false);
    if (j.error) { setErr(j.error); return; }
    router.push(`/pay/${j.id}`);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl bg-[#ffb800]/10 p-3 text-xs text-[#ffe0a3] ring-1 ring-[#ffb800]/40">
        <ZapIcon size={16} className="mt-0.5 shrink-0" />
        <span>{isUr ? "ٹیسٹ موڈ: یہ ایک نقلی پیمنٹ گیٹ وے ہے — کوئی اصلی پیسہ نہیں کٹتا۔ OTP ڈالتے ہی بیلنس فوراً ایڈ ہو جائے گا تاکہ آپ گیمز ٹیسٹ کر سکیں۔" : "Test mode: this is a simulated payment gateway — no real money moves. Enter the test OTP and your balance is credited instantly so you can play the games."}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["jazzcash", "easypaisa"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setProvider(p)} className={`rounded-xl border p-3 text-left transition ${provider === p ? "border-[#ffb800] bg-[#ffb800]/10" : "border-[#3a2470] bg-black/20"}`}>
            <span className={`inline-flex items-center gap-2 text-sm font-black text-white`}><span className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-black text-white ${p === "jazzcash" ? "bg-[#c8102e]" : "bg-[#00a651]"}`}>{p === "jazzcash" ? "JC" : "EP"}</span>{p === "jazzcash" ? "JazzCash" : "Easypaisa"}</span>
            <span className="mt-1 block text-[11px] text-[#b8a7e6]">{isUr ? "فوری" : "Instant"} · Test</span>
          </button>
        ))}
      </div>
      {kind === "deposit" && (() => {
        const target = accounts.find((a) => a.provider === provider);
        return target ? <div className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-100 ring-1 ring-emerald-500/30">Send Rs. {amount.toLocaleString()} to <b>{target.accountTitle}</b><div className="font-mono text-white">{target.accountNumber}</div><div className="mt-1 text-xs text-emerald-200/80">Payment ke baad neeche TID ya screenshot zaroor attach karein.</div></div> : <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-200">Is provider ka receiving account abhi available nahi.</p>;
      })()}
      <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">{isUr ? "رقم (روپے)" : "Amount (Rs.)"} — {min.toLocaleString()} to {max.toLocaleString()}</span><input type="number" min={min} max={max} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={input} /></label>
      <div className="grid grid-cols-4 gap-1.5">{[500, 1000, 5000, 10000].map((v) => <button key={v} type="button" onClick={() => setAmount(v)} className={`rounded-lg py-1.5 text-xs font-bold ${amount === v ? "btn-gold" : "bg-black/30 text-[#e9ddff] ring-1 ring-[#3a2470]"}`}>{v.toLocaleString()}</button>)}</div>
      {kind === "withdraw" && <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">Account holder name</span><input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="e.g. Ahmed Ali" className={input} /></label>}
      <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">{kind === "deposit" ? (isUr ? "آپ کا JazzCash/Easypaisa نمبر" : "Your JazzCash / Easypaisa number") : (isUr ? "رقم وصول کرنے والا نمبر" : "Receiving account number")}</span><input value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="03XXXXXXXXX" className={input} /></label>
      {kind === "deposit" && <>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">Transaction ID (TID) <span className="text-xs text-slate-500">or screenshot below</span></span><input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="e.g. 1234567890" className={input} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">Payment screenshot <span className="text-xs text-slate-500">(TID ya screenshot mein se ek lazmi)</span></span><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setErr("Screenshot 2MB se chhota hona chahiye."); return; } const reader = new FileReader(); reader.onload = () => setProofImage(String(reader.result ?? "")); reader.readAsDataURL(file); }} className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ffb800] file:px-3 file:py-2 file:font-bold file:text-black" /></label>
      </>}
      {kind === "withdraw" && (hasPin ? <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">Withdrawal PIN</span><input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={4} placeholder="••••" className={input} /></label> : <p className="rounded-xl bg-[#ffb800]/10 p-3 text-xs text-[#ffe0a3]">Pehle <a href="/player/profile" className="font-bold underline">Profile</a> se Withdrawal PIN set karein.</p>)}
      {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
      <button disabled={busy} onClick={go} className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 font-black disabled:opacity-60"><ZapIcon size={16} /> {busy ? "..." : label}</button>
    </div>
  );
}
