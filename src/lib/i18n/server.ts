import { cookies } from "next/headers";
import { DICTS, fmtT, type Dict, type Locale } from "./dict";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("lang")?.value;
  return c === "ur" ? "ur" : "en";
}

export async function getT() {
  const locale = await getLocale();
  const d = DICTS[locale];
  const t = <K extends keyof Dict>(k: K, vars?: Record<string, string | number>): Dict[K] => {
    const v = d[k];
    return (typeof v === "string" ? fmtT(v, vars) : v) as Dict[K];
  };
  return { locale, t, dir: locale === "ur" ? "rtl" : "ltr", d };
}
