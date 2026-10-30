export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | ClassValue[];

/** Minimal classnames helper (no dependency). */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v && v !== 0) return;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [key, on] of Object.entries(v)) {
      if (on) out.push(key);
    }
  };
  values.forEach(walk);
  return out.join(" ");
}
