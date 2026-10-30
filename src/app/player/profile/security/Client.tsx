"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { UserRound, Smartphone, Mail, KeyRound, CreditCard, ShieldCheck, Share2, ChevronLeft, ChevronRight, Copy, Check, X, ScanQrCode } from "lucide-react";
import { PinForm, PasswordForm } from "@/components/ProfileForms";
import Link from "next/link";
import styles from "./SecurityCenter.module.css";
import { usePage } from "@/lib/useDb";
import type { CurrentUser } from "@/lib/auth";
import Image from "next/image";

type SecurityData = { me: CurrentUser; authenticatorEnabled: boolean; question: string | null; questions: string[] };
type Panel = "phone" | "email" | "authenticator" | "password" | "pin" | "question" | null;
const input = "w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffc933]";

function Row({ icon, label, status, onClick, disabled = false, notice = false, color = "text-[#7592c8]" }: { icon: ReactNode; label: string; status?: string; onClick?: () => void; disabled?: boolean; notice?: boolean; color?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={styles.row}>
      <span className={`${styles.icon} ${color}`}>{icon}</span>
      <span className={styles.label}>{label}{notice && <span aria-hidden="true" className={styles.notice} />}</span>
      {status && <span className={styles.status}>{status}</span>}
      <ChevronRight className={styles.chevron} />
    </button>
  );
}

function SecurityView({ data }: { data: SecurityData }) {
  const [me, setMe] = useState(data.me);
  const [enabled, setEnabled] = useState(data.authenticatorEnabled);
  const [question, setQuestion] = useState(data.question);
  const [panel, setPanel] = useState<Panel>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(data.questions[0]);
  const [verifyMode, setVerifyMode] = useState(false);
  const [value, setValue] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const pinSaved = useCallback(() => setMe((previous) => ({ ...previous, hasPin: true })), []);
  useEffect(() => {
    let live = true;
    if (!setup) return;
    void import("qrcode").then((m) => m.toDataURL(setup.uri, { margin: 2, width: 240 })).then((src) => { if (live) setQr(src); }).catch(() => { if (live) setError("QR generate nahi hua. Neeche di hui setup key manually enter karein."); });
    return () => { live = false; };
  }, [setup]);
  const open = (next: Panel) => {
    setPanel(next); setPassword(""); setCode(""); setAnswer(""); setCurrentAnswer(""); setSetup(null); setQr("");
    setError(""); setSuccess(""); setVerifyMode(false); setCopied(false);
    setValue(next === "phone" ? me.phone : me.email ?? "");
    if (next === "question") setSelectedQuestion(question ?? data.questions[0]);
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setError("Copy nahi ho saka. Text manually copy karein."); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const action = panel === "authenticator" ? enabled ? "totp-disable" : setup ? "totp-enable" : "totp-start"
      : panel === "question" ? verifyMode ? "question-verify" : "question-save" : "contact-save";
    try {
      const response = await fetch("/api/player/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, code, answer, currentAnswer, question: selectedQuestion, field: panel, value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Security settings save nahi ho sakin.");
      if (action === "totp-start") { setSetup({ secret: result.secret, uri: result.uri }); setCode(""); }
      else {
        setSuccess(result.success);
        if (action === "totp-enable" || action === "totp-disable") { setEnabled(action === "totp-enable"); setSetup(null); setQr(""); }
        if (action === "question-save") setQuestion(selectedQuestion);
        if (action === "contact-save") {
          if (panel === "phone") setMe((prev) => ({ ...prev, phone: value.trim() }));
          if (panel === "email") setMe((prev) => ({ ...prev, email: value.trim().toLowerCase() }));
        }
        setPassword(""); setCode(""); setAnswer(""); setCurrentAnswer("");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  };
  const title = panel === "phone" ? "Mobile Phone" : panel === "email" ? "Email" : panel === "authenticator" ? "Google Authenticator" : panel === "password" ? "Login Password" : panel === "pin" ? "Withdrawal Password" : "Security Question";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/player/profile" aria-label="Back" className={styles.back}><ChevronLeft size={22} /></Link>
        <h1>Security Center</h1>
      </header>
      <div className={styles.group}>
        <button type="button" onClick={() => copy(me.username ?? me.name)} className={styles.row}>
          <span className={`${styles.icon} text-[#7592c8]`}><UserRound /></span><span className={styles.label}>Member account</span>
          <span className={styles.status}>{me.username ?? me.name}</span>{copied ? <Check size={17} className="shrink-0 text-emerald-400" /> : <Copy size={17} className="shrink-0 text-[#528bff]" />}
        </button>
        <Row icon={<Smartphone />} color="text-[#528bff]" label="Mobile Phone" status={me.phone ? "Added (Unverified)" : "Not added"} onClick={() => open("phone")} />
        <Row icon={<Mail />} label="Email" status={me.email ? "Added (Unverified)" : "Not added"} notice={!me.email} onClick={() => open("email")} />
        <Row icon={<ScanQrCode />} color="text-[#34a853]" label="Google Authenticator" status={enabled ? "Linked" : "Unlinked"} notice={!enabled} onClick={() => open("authenticator")} />
      </div>
      <div className={styles.group}>
        <Row icon={<KeyRound />} color="text-[#05c52e]" label="Login Password" onClick={() => open("password")} />
        <Row icon={<CreditCard />} color="text-[#ef5345]" label="Withdrawal Password" status={me.hasPin ? "Already Set" : "Unset"} onClick={() => open("pin")} />
        <Row icon={<ShieldCheck />} color="text-[#05c52e]" label="Security Question" status={question ? "Already Set" : "Unset"} notice={!question} onClick={() => open("question")} />
      </div>
      <div className={styles.group}><Row icon={<Share2 />} color="text-[#528bff]" label="Third-Party Accounts" status="Unavailable" disabled /></div>
      {!panel && error && <p role="alert" className="text-xs text-red-300">{error}</p>}

      {panel && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/80 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="security-title" className="my-auto max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-[#ffc933]/30 bg-[#140c2a] p-4">
          <div className="flex items-center justify-between gap-2"><h2 id="security-title" className="text-base font-semibold text-white">{title}</h2><button type="button" disabled={busy} onClick={() => open(null)} aria-label="Close security settings" className="text-slate-300"><X size={20} /></button></div>
          {panel === "password" ? <PasswordForm /> : panel === "pin" ? <><p className="text-xs text-slate-400">Apna 4-digit withdrawal PIN set/change karein.</p><PinForm hasPin={me.hasPin} onSuccess={pinSaved} /></> : <form onSubmit={submit} className="space-y-3">
            {(panel === "phone" || panel === "email") && <>
              <label className="block space-y-1 text-xs text-slate-300"><span>{title}</span><input type={panel === "email" ? "email" : "tel"} required value={value} maxLength={panel === "phone" ? 11 : 254} onChange={(e) => setValue(e.target.value)} className={input} /></label>
              <p className="text-xs text-slate-400">Saved contact. OTP verification abhi available nahi hai.</p>
            </>}
            {panel === "authenticator" && <>
              <p className="text-xs leading-relaxed text-slate-300">{enabled ? "Authenticator linked hai. Security settings update/unlink karne ke liye password aur fresh code enter karein. Login par code required nahi hai." : "Google Authenticator mein account add karein. Enable hone ke baad security settings update karne ke liye 6-digit code zaroori hoga, login ke liye nahi. Phone/setup key safe rakhein; access kho jane par support se rabta karna hoga."}</p>
              {setup && <>
                {qr && <Image src={qr} alt="Google Authenticator setup QR" width={240} height={240} unoptimized className="mx-auto max-w-full rounded-lg bg-white" />}
                <p className="text-xs text-slate-400">Ya manually ye setup key enter karein (Time-based):</p>
                <div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-black/25 p-2 text-xs text-[#ffc933]">{setup.secret}</code><button type="button" onClick={() => copy(setup.secret)} className="text-xs text-[#ffc933]">{copied ? "Copied" : "Copy"}</button></div>
                <p className="text-xs text-amber-200">Key kisi ko share na karein. Setup 10 minutes mein expire hoga.</p>
              </>}
            </>}
            {panel === "question" && <>
              {question && <><p className="text-sm text-white">{question}</p><div className="flex gap-2">{["Change question", "Verify answer"].map((label, i) => <button key={label} type="button" onClick={() => { setVerifyMode(i === 1); setError(""); setSuccess(""); }} className={`rounded-lg border px-2 py-2 text-xs ${verifyMode === (i === 1) ? "border-[#ffc933] text-[#ffc933]" : "border-white/20 text-slate-300"}`}>{label}</button>)}</div></>}
              {!verifyMode && <>
                {question && <label className="block space-y-1 text-xs text-slate-300"><span>Current answer</span><input type="password" required maxLength={200} value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} className={input} /></label>}
                <label className="block space-y-1 text-xs text-slate-300"><span>Security question</span><select value={selectedQuestion} onChange={(e) => setSelectedQuestion(e.target.value)} className={input}>{data.questions.map((q) => <option key={q} className="bg-[#140c2a]">{q}</option>)}</select></label>
              </>}
              <label className="block space-y-1 text-xs text-slate-300"><span>{verifyMode ? "Your answer" : "New answer"}</span><input type="password" required minLength={3} maxLength={200} value={answer} onChange={(e) => setAnswer(e.target.value)} className={input} /></label>
              <p className="text-xs text-slate-400">Answer salted hash ke taur par save hota hai. Ye password reset ya Authenticator bypass nahi karta.</p>
            </>}
            <label className="block space-y-1 text-xs text-slate-300"><span>Current login password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></label>
            {(enabled || setup) && <label className="block space-y-1 text-xs text-slate-300"><span>Authenticator code</span><input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={input} /></label>}
            <button type="submit" disabled={busy} className="btn-gold w-full rounded-lg py-3 text-sm font-bold disabled:opacity-60">{busy ? "Please wait..." : panel === "authenticator" ? enabled ? "Unlink Authenticator" : setup ? "Enable Authenticator" : "Start setup" : verifyMode ? "Verify answer" : "Save"}</button>
          </form>}
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
          {success && <p role="status" className="text-xs text-emerald-300">{success}</p>}
        </section>
      </div>}
    </div>
  );
}

export default function SecurityPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async () => {
    const response = await fetch("/api/player/security", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Security settings load nahi ho sakin.");
    return <SecurityView data={data} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
