"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Upload, XCircle, Gift, Smartphone, ChevronDown } from "lucide-react";
import Image from "next/image";
import styles from "./DepositFlow.module.css";
import { depositAction } from "@/lib/clientActions";
import { compressImage } from "@/lib/imageFile";
import type { DepositProvider } from "@/models";

type Provider = DepositProvider;
type Account = { id: string; provider: Provider; accountTitle: string; accountNumber: string; qrImage?: string | null };

const MIN_DEPOSIT = 10;
const PRESETS = [150, 500, 1000, 3000, 5000, 10000, 30000, 50000];
const META: Record<Provider, { name: string; icon: string }> = {
  easypaisa: { name: "Easypaisa", icon: "EasyPaisa.jpeg" },
  jazzcash: { name: "JazzCash", icon: "Jazzcash.jpeg" },
  raast: { name: "Raast", icon: "Raast.jpeg" },
};
const input = "w-full border border-white/25 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-[#ffc933] focus:ring-2 focus:ring-[#ffc933]/20";
const slide = { initial: { opacity: 0, x: 28 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -28 }, transition: { duration: 0.28 } };

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Amount", "Scan & Pay", "Done"];
  return (
    <div className="flex items-center gap-2" aria-label="Deposit steps">
      {items.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <motion.span
              animate={{ scale: active ? 1.1 : 1 }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? "bg-[#ffc933] text-black" : active ? "bg-[#ffb800] text-black shadow-[0_0_14px_rgba(255,184,0,.6)]" : "bg-white/10 text-slate-400"}`}
            >
              {done ? "✓" : n}
            </motion.span>
            <span className={`hidden truncate text-[11px] font-bold min-[400px]:inline ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
            {i < items.length - 1 && <span className={`h-0.5 flex-1 rounded-full ${done ? "bg-[#ffc933]" : "bg-white/10"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export function DepositFlow({ accounts = [], initialAmount, minDeposit = MIN_DEPOSIT, firstDepositBonusEligible = false }: { accounts?: Account[]; initialAmount?: number; minDeposit?: number; firstDepositBonusEligible?: boolean }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<Provider>(accounts.find((a) => a.provider === "jazzcash") ? "jazzcash" : accounts[0]?.provider ?? "easypaisa");
  const [amount, setAmount] = useState<number | string>(initialAmount ?? 500);
  const [qrMode, setQrMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [senderNumber, setSenderNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const account = accounts.find((a) => a.provider === provider) ?? null;
  const numAmount = Number(amount);
  const validAmount = Number.isFinite(numAmount) && numAmount > 0 ? numAmount : 0;
  const providers = (["easypaisa", "jazzcash", "raast"] as const).map((p) => ({ p, has: accounts.some((a) => a.provider === p) }));
  const qrAccounts = accounts.filter((a) => a.qrImage);
  const bonusFor = (value: number) => firstDepositBonusEligible ? Math.round(value * 5) / 100 : 0;
  const bonus = bonusFor(validAmount);
  const formatted = (value: number) => value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const goPay = () => {
    setError(null);
    if (!account) return setError(`${META[provider].name} ka payment account abhi available nahi hai. Doosra method chunein ya support se rabta karein.`);
    if (!Number.isFinite(numAmount) || numAmount < minDeposit) return setError(`Minimum deposit Rs. ${minDeposit} hai.`);
    if (qrMode && !account.qrImage) return setError("Is account ka QR admin ne abhi upload nahi kiya. Online deposit chunein ya support se rabta karein.");
    setStep(2);
  };

  const copyAccount = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
    } catch {
      setError("Account number copy nahi ho saka. Number manually copy karein.");
    }
  };

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Sirf image (screenshot) upload karein.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!account) return;
    if (!file) return setError("Payment ka screenshot upload karna zaroori hai.");
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("amount", String(numAmount));
      form.set("paymentAccountId", account.id);
      form.set("senderNumber", senderNumber.trim() || "Not provided");
      const dataUrl = await compressImage(file, 1100, 0.8);
      form.set("proofImage", await (await fetch(dataUrl)).blob(), "proof.jpg");
      const res = await depositAction(undefined, form);
      if (res?.error) setError(res.error);
      else setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screenshot upload nahi ho saka. Dobara koshish karein.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep(1); setFile(null); setPreview(null); setSenderNumber(""); setError(null);
  };

  return (
    <div className={`${styles.flow} space-y-5`}>
      {step !== 1 && <Steps step={step} />}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" {...slide} className="space-y-4">
            <div className="border-b border-white/25 pt-3">
              <div className="relative flex items-center gap-2 border-b-2 border-[#ffc933] pb-3 text-base font-bold text-[#ffc933]"><Smartphone size={24} />Online deposit{firstDepositBonusEligible && <span className="absolute -top-4 right-3 bg-[#ed5545] px-1 text-[10px] leading-4 text-white">🎁+5%</span>}</div>
            </div>
            <div>
              <div className="mb-4 text-base font-bold text-white">Payment method</div>
              <div className="grid grid-cols-2 gap-2.5">
                {providers.map(({ p, has }) => {
                  const m = META[p];
                  const on = provider === p && !qrMode;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!has}
                      aria-pressed={on}
                      onClick={() => { setProvider(p); setQrMode(false); setError(null); setCopied(false); }}
                      className={`relative flex min-h-[48px] items-center gap-2 border p-1.5 text-center transition ${on ? "border-[#ffc933] bg-[var(--wx-card-2)] text-[#ffc933]" : "border-white/25 text-white"} ${has ? "" : "cursor-not-allowed opacity-40"}`}
                    >
                      <Image src={`/bank-icons/${m.icon}`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
                      <span className="flex-1 text-[13px] font-medium sm:text-base">{m.name}{!has && <small className="block text-[9px]">Unavailable</small>}</span>
                    </button>
                  );
                })}
                <button type="button" disabled={!qrAccounts.length} aria-pressed={qrMode} onClick={() => { const target = account?.qrImage ? account : qrAccounts[0]; if (target) { setProvider(target.provider); setQrMode(true); setError(null); setCopied(false); } }} className={`flex min-h-[48px] items-center gap-2 border p-1.5 disabled:opacity-40 ${qrMode ? "border-[#ffc933] bg-[var(--wx-card-2)] text-[#ffc933]" : "border-white/25 text-white"}`}><Image src="/bank-icons/Qr.jpeg" alt="" width={32} height={32} className="h-8 w-8 object-contain" /><span className="flex-1 text-[13px] sm:text-base">QR{!qrAccounts.length && <small className="block text-[9px]">Unavailable</small>}</span></button>
              </div>
            </div>

            {qrMode && <div className="border-y border-white/15 py-3">
              <div className="grid grid-cols-3 gap-2">
                {qrAccounts.map((a) => <button key={a.id} type="button" aria-pressed={provider === a.provider} onClick={() => { setProvider(a.provider); setError(null); setCopied(false); }} className={`min-h-12 border px-1 py-2 text-[12px] ${provider === a.provider ? "border-[#ffc933] text-[#ffc933]" : "border-white/25 text-white"}`}>{META[a.provider].name} QR</button>)}
              </div>
                <div className="mt-3 text-center">
                  {account?.qrImage
                    ? <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge admin payment QR" className="mx-auto block bg-white p-2"><Image unoptimized src={account.qrImage} alt={`${META[provider].name} admin payment QR`} width={160} height={160} className="h-40 w-40 object-contain" /></button>
                    : <p role="status" className="rounded-lg border border-dashed border-white/20 p-4 text-xs text-slate-400">Admin ne is account ka QR abhi upload nahi kiya.</p>}
                </div>
            </div>}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="dep-amount" className="text-base font-bold text-white">Deposit amount</label>
              </div>
              <div className="flex items-center gap-2 border border-[#ffc933] bg-[var(--wx-card)] px-3 py-2.5">
                <span className="text-sm">Rs</span>
                <input id="dep-amount" type="number" inputMode="decimal" min={minDeposit} value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={`Min ${minDeposit}`} className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-white outline-none" />
                <button type="button" aria-label="Clear deposit amount" onClick={() => setAmount("")} className="shrink-0 text-[#929292]"><XCircle size={22} /></button>
              </div>
              <div className="border-x border-b border-[#76551c] bg-[#241f16] px-2 py-1.5 text-[11px] leading-relaxed sm:text-sm">
                You can receive up to <b className="underline">{formatted(validAmount + bonus)}</b> <span className="text-[#ffc933]">(after approval)</span>, First deposit bonus <b className="text-[#ffb323] underline">+{formatted(bonus)}</b>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {PRESETS.map((v) => (
                  <button type="button" key={v} disabled={v < minDeposit} onClick={() => setAmount(v)} className={`overflow-hidden border text-center font-bold disabled:opacity-40 ${numAmount === v ? "border-[#ffc933]" : "border-transparent"}`}>
                    <span className="block bg-[var(--wx-card)] px-0.5 py-1 text-[15px] leading-tight text-white sm:text-xl">{v.toLocaleString()}</span>
                    <span className="block bg-[#382b0e] px-0.5 py-0.5 text-[11px] leading-tight text-[#ffb323] sm:text-sm">+{formatted(bonusFor(v))}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 inline-flex items-center gap-1 bg-[#47330e] px-2 py-1 text-sm font-semibold"><Gift size={20} className="text-[#ffa82b]" />Deposit promotion</div>
              <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between border border-[#76551c] bg-[#241f16] p-3 text-left text-sm">
                <span>{firstDepositBonusEligible ? "First deposit bonus: 5%" : "No eligible first-deposit promotion"}</span><ChevronDown size={20} className={`shrink-0 text-[#ffc933] ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && <p className="border-x border-b border-[#76551c] bg-[#241f16] px-3 pb-3 text-xs leading-relaxed text-slate-300">Extra 5% applies only to your first approved deposit. Pending or rejected payments earn no bonus. {firstDepositBonusEligible ? `Rs. ${validAmount.toLocaleString()} + Rs. ${formatted(bonus)} bonus after approval.` : "This account has already used or is not eligible for this offer."}</p>}
            </div>
            {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}
            <button type="button" onClick={goPay} className="btn-gold flex min-h-[48px] w-full items-center justify-center px-4 text-sm font-black uppercase tracking-wider">
              Continue to Pay →
            </button>
          </motion.div>
        )}

        {step === 2 && account && (
          <motion.div key="s2" {...slide} className="space-y-4">
            <div className="flex items-center justify-between gap-3 border border-[#ffc933] bg-[var(--wx-card)] p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Image src={`/bank-icons/${META[provider].icon}`} alt={META[provider].name} width={36} height={36} className="h-9 w-9 object-contain" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-300">Pay via {META[provider].name}</div>
                  <div className="truncate text-lg font-black text-[#ffb800]">Rs. {numAmount.toLocaleString()}</div>
                </div>
              </div>
              <button type="button" onClick={() => { setStep(1); setError(null); }} className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">Change</button>
            </div>

            <div className="relative overflow-hidden border border-white/25 bg-[var(--wx-card)] p-4 text-center">
              <div className="mb-3 text-sm font-bold text-white">Pay exactly Rs. {numAmount.toLocaleString()}</div>
              <div className="mb-4 space-y-2 rounded-xl bg-black/30 p-3 text-left text-sm text-white">
                <div className="text-xs text-slate-400">Account title</div>
                <div className="break-words font-semibold">{account.accountTitle}</div>
                <div className="text-xs text-slate-400">Account number</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-[#ffc933]">{account.accountNumber}</span>
                  <button type="button" onClick={copyAccount} aria-label="Copy account number" className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs"><Copy size={14} />{copied ? "Copied" : "Copy"}</button>
                </div>
              </div>
              {account.qrImage ? (
                <motion.button type="button" onClick={() => setZoom(true)} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 160 }} className="relative mx-auto block rounded-2xl bg-white p-3 shadow-[0_0_34px_rgba(255,184,0,.3)]" aria-label="Enlarge QR code">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={account.qrImage} alt={`${META[provider].name} payment QR`} className="mx-auto h-auto w-full max-w-[240px] object-contain" />
                  <motion.span aria-hidden className="pointer-events-none absolute inset-x-3 h-0.5 rounded bg-[#ffc933]/80 shadow-[0_0_10px_#ffc933]" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
                </motion.button>
              ) : (
                <div className="mx-auto flex h-40 max-w-[240px] items-center justify-center rounded-2xl border border-dashed border-white/20 px-4 text-xs text-slate-400">QR abhi upload nahi hua. Support se rabta karein.</div>
              )}
              <div className="mt-1 text-[11px] text-slate-400">Tap QR to enlarge</div>
            </div>

            <div className="border border-white/25 bg-black/30 p-4">
              <div className="mb-1 text-sm font-black text-white">Payment ho jaye to screenshot upload karein</div>
              <p className="mb-3 text-xs text-slate-300">Payment karne ke baad receipt ka screenshot yahan upload karein.</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              {preview ? (
                <div className="relative mb-3 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Payment screenshot preview" className="h-32 w-auto rounded-xl border border-[#ffc933]/50 object-cover" />
                  <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white" aria-label="Remove screenshot">✕</button>
                </div>
              ) : null}
              <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => fileRef.current?.click()} className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#ffb800]/60 bg-[#ffb800]/10 px-3 text-sm font-black text-[#ffb800] hover:bg-[#ffb800]/20">
                <Upload size={16} /> {file ? "Change Screenshot" : "Upload Screenshot"}
              </motion.button>
              <input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} inputMode="tel" placeholder="Aapka sender number (optional) 03XXXXXXXXX" className={`${input} mt-3 text-sm`} />
            </div>

            {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}
            <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={busy || !file} onClick={submit} className="btn-gold flex min-h-[48px] w-full items-center justify-center px-4 text-sm font-black uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Submitting..." : "Submit Payment"}
            </motion.button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s3" {...slide} className="flex flex-col items-center gap-4 py-6 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#ffc933] text-5xl text-black shadow-[0_0_40px_rgba(255,201,51,.4)]">
              <motion.span aria-hidden className="absolute inset-0 rounded-full border-2 border-[#ffc933]" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
              ✓
            </motion.div>
            <div>
              <div className="text-xl font-black text-white">Done! Payment submit ho gayi</div>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[#b8a7e6]">Rs. {numAmount.toLocaleString()} ki request admin ko bhej di gayi hai. Admin approve karte hi paisay aapke wallet mein add ho jayenge.</p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={reset} className="btn-gold min-h-[44px] rounded-full px-6 text-sm font-black">Make Another Deposit</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoom && account?.qrImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(false)} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
            <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} src={account.qrImage} alt="Payment QR enlarged" className="max-h-[85dvh] w-auto max-w-full rounded-2xl bg-white p-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
