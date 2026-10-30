"use client";

import { localApi } from "@/lib/client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, XIcon, ShieldIcon } from "@/components/Icons";

type S = { id: string; kind: "deposit" | "withdraw"; provider: "jazzcash" | "easypaisa"; amount: number; accountNumber: string; status: string; txnRef: string | null; expiresAt: number; testOtp: string; attemptsLeft: number };

const BRAND = {
  jazzcash: { name: "JazzCash", bg: "from-[#c8102e] to-[#8a0b20]", accent: "#c8102e", light: "#fde8ec", mark: "JC", tagline: "Pakistan's #1 Mobile Wallet" },
  easypaisa: { name: "Easypaisa", bg: "from-[#00a651] to-[#00703a]", accent: "#00a651", light: "#e6f7ee", mark: "EP", tagline: "Asaan · Mehfooz · Tez" },
};

export function GatewayCheckout({ id }: { id: string }) {
  const [s, setS] = useState<S | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<{ txnRef: string; balance: number } | null>(null);
  const [step, setStep] = useState<"confirm" | "otp" | "processing" | "pending" | "done" | "failed">("confirm");
  const otpRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await localApi(`/api/gateway?id=${id}`, { cache: "no-store" });
    if (!r.ok) { setErr("Session nahi mili."); return; }
    const j: S = await r.json();
    setS(j);
    if (j.status === "otp") setStep("otp");
    if (j.status === "paid") setStep("done");
    if (j.status === "pending") setStep("pending");
    if (["failed", "expired", "cancelled"].includes(j.status)) setStep("failed");
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((s.expiresAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [s]);
  useEffect(() => { if (step === "otp") setTimeout(() => otpRef.current?.focus(), 100); }, [step]);

  const post = async (body: unknown) => { const r = await localApi("/api/gateway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); };

  const confirm = async () => {
    setBusy(true); setErr(null);
    const j = await post({ action: "sendOtp", id });
    setBusy(false);
    if (j.error) { setErr(j.error); return; }
    setStep("otp"); load();
  };
  const verify = async () => {
    if (otp.length < 4) return;
    setBusy(true); setErr(null); setStep("processing");
    await new Promise((r) => setTimeout(r, 1400)); // realistic processing delay
    const j = await post({ action: "verify", id, otp });
    setBusy(false);
    if (j.error) { setErr(j.error); setStep(j.failed ? "failed" : "otp"); setOtp(""); return; }
    setResult({ txnRef: j.txnRef, balance: j.balance }); setStep(j.pending ? "pending" : "done");
  };
  const cancel = async () => { await post({ action: "cancel", id }); setStep("failed"); setErr("Payment cancel kar di gayi."); };

  if (!s) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400">{err ?? "Loading secure checkout…"}</div>;
  const b = BRAND[s.provider];
  const isDep = s.kind === "deposit";
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-3 flex items-center justify-center gap-2 rounded-full bg-[#ffb800]/15 px-3 py-1.5 text-xs font-bold text-[#ffe0a3] ring-1 ring-[#ffb800]/40">
        TEST MODE — koi asli paisa nahi katta. Test OTP: <span className="font-mono text-white">{s.testOtp}</span>
      </div>
      <div className="overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl" dir="ltr">
        {/* brand header */}
        <div className={`bg-gradient-to-r ${b.bg} px-5 py-4 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-lg font-black" style={{ color: b.accent }}>{b.mark}</span>
              <div><div className="text-lg font-black leading-tight">{b.name}</div><div className="text-[11px] opacity-90">{b.tagline}</div></div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-bold"><ShieldIcon size={12} /> Secure</div>
          </div>
        </div>

        {/* amount summary */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Merchant</span><span className="font-bold text-slate-800">winkox</span></div>
          <div className="mt-1 flex items-center justify-between text-sm text-slate-500"><span>{isDep ? "Payment amount" : "Withdrawal amount"}</span><span className="text-2xl font-black text-slate-900">Rs. {s.amount.toLocaleString()}</span></div>
          <div className="mt-1 flex items-center justify-between text-sm text-slate-500"><span>{isDep ? "From account" : "To account"}</span><span className="font-mono font-bold text-slate-800">{s.accountNumber}</span></div>
          {step !== "done" && step !== "failed" && <div className="mt-2 text-right text-[11px] text-slate-400">Session expires in <span className="font-mono font-bold" style={{ color: left < 60 ? "#dc2626" : b.accent }}>{mm}:{ss}</span></div>}
        </div>

        <div className="px-5 py-5">
          {step === "confirm" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{isDep ? `Aapke ${b.name} account se Rs. ${s.amount.toLocaleString()} winkox wallet mein transfer honge. Continue dabane par aapke number par OTP bheja jayega.` : `winkox wallet se Rs. ${s.amount.toLocaleString()} aapke ${b.name} account mein bheje jayenge. Confirm karne ke liye OTP verify karein.`}</p>
              <button disabled={busy} onClick={confirm} className="w-full rounded-xl py-3 text-base font-black text-white shadow-lg disabled:opacity-60" style={{ background: b.accent }}>{busy ? "Please wait…" : "Continue & Send OTP"}</button>
              <button onClick={cancel} className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Cancel</button>
            </div>
          )}
          {step === "otp" && (
            <div className="space-y-3">
              <div className="rounded-xl p-3 text-sm" style={{ background: b.light }}>OTP bheja gaya <b>{s.accountNumber}</b> par. <span className="text-slate-500">(Test mode: OTP = <b className="font-mono">{s.testOtp}</b>)</span></div>
              <input ref={otpRef} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} onKeyDown={(e) => e.key === "Enter" && verify()} inputMode="numeric" placeholder="Enter OTP" className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-2xl font-black tracking-[0.5em] text-slate-900 outline-none focus:border-current" style={{ color: b.accent }} />
              {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{err}</p>}
              <button disabled={busy || otp.length < 4} onClick={verify} className="w-full rounded-xl py-3 text-base font-black text-white shadow-lg disabled:opacity-50" style={{ background: b.accent }}>Verify & {isDep ? "Pay" : "Withdraw"} Rs. {s.amount.toLocaleString()}</button>
              <div className="flex items-center justify-between text-xs text-slate-500"><button onClick={() => setOtp(s.testOtp)} className="font-bold underline" style={{ color: b.accent }}>Auto-fill test OTP</button><button onClick={cancel} className="underline">Cancel</button></div>
            </div>
          )}
          {step === "processing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: b.accent }} />
              <div className="text-sm font-bold text-slate-700">Processing with {b.name}…</div>
              <div className="text-xs text-slate-400">Please do not close this page</div>
            </div>
          )}
          {step === "done" && (
            <div className="space-y-3 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckIcon size={34} /></span>
              <div className="text-xl font-black text-slate-900">{isDep ? "Payment Successful" : "Withdrawal Successful"}</div>
              <div className="rounded-xl bg-slate-50 p-3 text-left text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><b>Rs. {s.amount.toLocaleString()}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Transaction ID</span><b className="font-mono">{result?.txnRef ?? s.txnRef}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Provider</span><b>{b.name} (Test)</b></div>
                {result && <div className="flex justify-between"><span className="text-slate-500">New wallet balance</span><b className="text-emerald-600">Rs. {result.balance.toLocaleString()}</b></div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/player" className="rounded-xl py-3 text-sm font-black text-white" style={{ background: b.accent }}>Play games</Link>
                <Link href="/player/wallet" className="rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700">Back to wallet</Link>
              </div>
            </div>
          )}
          {step === "pending" && (
            <div className="space-y-3 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">!</span>
              <div className="text-xl font-black text-slate-900">Request submitted for review</div>
              <p className="text-sm text-slate-600">Admin proof verify karega. Approval ke baad deposit balance mein add hoga ya withdrawal process hogi.</p>
              <div className="rounded-xl bg-slate-50 p-3 text-left text-sm"><div className="flex justify-between"><span className="text-slate-500">Amount</span><b>Rs. {s.amount.toLocaleString()}</b></div><div className="flex justify-between"><span className="text-slate-500">Reference</span><b className="font-mono">{result?.txnRef ?? s.txnRef}</b></div><div className="flex justify-between"><span className="text-slate-500">Status</span><b className="text-amber-600">Pending admin approval</b></div></div>
              <Link href="/player/wallet" className="block rounded-xl py-3 text-sm font-black text-white" style={{ background: b.accent }}>Back to wallet</Link>
            </div>
          )}
          {step === "failed" && (
            <div className="space-y-3 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600"><XIcon size={34} /></span>
              <div className="text-xl font-black text-slate-900">Payment {s.status === "cancelled" ? "Cancelled" : s.status === "expired" ? "Expired" : "Failed"}</div>
              {err && <p className="text-sm text-slate-600">{err}</p>}
              <Link href="/player/wallet" className="block rounded-xl py-3 text-sm font-black text-white" style={{ background: b.accent }}>Try again</Link>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-center text-[10px] text-slate-400">Sandbox gateway · simulated {b.name} checkout · no real funds are moved</div>
      </div>
    </div>
  );
}
