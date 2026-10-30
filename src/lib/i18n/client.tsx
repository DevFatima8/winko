"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DICTS, fmtT, type Dict, type Locale } from "./dict";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const locale = useContext(Ctx);
  const d = DICTS[locale];
  const t = <K extends keyof Dict>(k: K, vars?: Record<string, string | number>): Dict[K] => {
    const v = d[k];
    return (typeof v === "string" ? fmtT(v, vars) : v) as Dict[K];
  };
  return { locale, t, isUr: locale === "ur", dir: locale === "ur" ? "rtl" : "ltr" };
}

/** Renders "text |highlight| text" with highlighted middle part */
export function Hi({ s, cls = "text-gold-grad glow-gold" }: { s: string; cls?: string }) {
  return <>{s.split("|").map((p, i) => (i === 1 ? <span key={i} className={cls}>{p}</span> : <span key={i}>{p}</span>))}</>;
}
