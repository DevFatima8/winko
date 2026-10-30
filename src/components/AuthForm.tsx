"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { loginAction, signupAction } from "@/lib/clientActions";
import type { ActionState } from "@/lib/actions";
import { useI18n } from "@/lib/i18n/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const { t } = useI18n();
  const [ref, setRef] = useState("");
  const [login, setLogin] = useState("");
  const [pw, setPw] = useState("");
  const [registrationIp, setRegistrationIp] = useState("");
  const [loginIp, setLoginIp] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const s = state as any;
    if (s?.success) {
      setToast({ type: "success", message: s.success });
      if (s.redirect) {
        const timer = setTimeout(() => window.location.assign(s.redirect), 1500);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
      }
    } else if (s?.error) {
      setToast({ type: "error", message: s.error });
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) {
      setRef(r.toUpperCase()); document.cookie = `ref=${r.toUpperCase()}; path=/; max-age=${60 * 60 * 24 * 30}`;
      try { localStorage.setItem("wx_ref", r.toUpperCase()); } catch { }
      // Referral link → open the install-app prompt right away so the friend installs the PWA.
      if (mode === "signup") setTimeout(() => window.dispatchEvent(new CustomEvent("wx:open-install")), 500);
    }
    else { const m = document.cookie.match(/(?:^|; )ref=([^;]+)/); if (m) setRef(m[1]); else { try { const l = localStorage.getItem("wx_ref"); if (l) setRef(l); } catch { } } }
  }, [mode]);
  useEffect(() => {
    if (mode !== "signup") return;
    fetch("/api/ip").then((r) => r.ok ? r.json() : null).then((data) => { if (data?.ip) { setRegistrationIp(String(data.ip)); setLoginIp(String(data.ip)); } }).catch(() => { });
  }, [mode]);

  return (
    <main className="wx-bg flex min-h-screen items-center justify-center px-4 py-12">
      {toast && (
        <div className={`fixed left-1/2 top-4 z-[100] -translate-x-1/2 animate-[pop_.3s_ease-out] rounded-full px-6 py-3 text-sm font-bold shadow-2xl transition-all ${toast.type === "success" ? "bg-green-500 text-white" : "bg-[#e50539] text-white"}`}>
          {toast.message}
        </div>
      )}
      <div className="wx-card w-full max-w-md rounded-3xl p-8 shadow-[0_20px_60px_rgba(139,92,246,.35)]">
        <div className="mb-4 flex items-center justify-between"><Link href="/" className="inline-flex items-center gap-1 text-xs text-[#b8a7e6] hover:text-white">{t("backHome")}</Link><div className="flex items-center gap-2"><LanguageSwitch compact /><ThemeToggle compact /></div></div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex items-center justify-center gap-2"><BrandLogo className="h-14 w-14 drop-shadow-[0_0_14px_rgba(255,184,0,.6)]" /><span className="text-3xl font-black"><span className="text-gold-grad">Winko</span><span className="text-white">X</span><span className="text-violet-grad"></span></span></div>
          <h1 className="text-2xl font-black text-white">{mode === "login" ? t("loginTitle") : t("signupTitle")}</h1>
          <p className="text-sm text-[#b8a7e6]">
            {mode === "login" ? t("loginSub") : t("signupSub")}
          </p>
        </div>
        <form action={formAction} className="space-y-4">
          {mode === "signup" && <input type="hidden" name="registrationIp" value={registrationIp} />}
          {mode === "login" && <input type="hidden" name="loginIp" value={loginIp} />}
          {mode === "signup" && (
            <Field label="User name" name="name" placeholder="AliKhan" autoComplete="username" onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); }} onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\s/g, ""); }} required />
          )}
          <Field label={mode === "login" ? t("phoneOrUsername") : t("phoneNumber")} name="phone" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={mode === "login" ? "03XXXXXXXXX / username / WX-ADM-0001" : "03XXXXXXXXX"} required />
          <Field label={t("password")} name="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required />
          {mode === "signup" && <Field label="Confirm password" name="confirmPassword" type="password" placeholder="••••••••" required />}
          {mode === "signup" && <Field label={t("refOptional")} name="ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="e.g. ALIK7X2P" />}
          <button
            disabled={pending}
            className="btn-gold w-full rounded-full py-3 font-black transition disabled:opacity-60"
          >
            {pending ? t("pleaseWait") : mode === "login" ? t("login") : t("register")}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-400">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <Link href="/signup" className="font-bold text-[#ffb800]">{t("register")}</Link>
            </>
          ) : (
            <>
              {t("haveAccount")}{" "}
              <Link href="/login" className="font-bold text-[#ffb800]">{t("login")}</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#e9ddff]">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-[#3a2470] bg-black/40 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-[#d946ef]"
      />
    </label>
  );
}
