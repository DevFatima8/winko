export function AdminCountBadge({ count, error, label, description = "pending requests" }: { count?: number; error: string | null; label: string; description?: string }) {
  if (count === 0 && !error) return null;
  const text = error ? `${count ?? ""}!` : count ?? "...";
  return <span
    role="status"
    aria-live="polite"
    aria-label={error ? `${label}: ${error}${count !== undefined ? ` Last known count: ${count}.` : ""}` : count === undefined ? `${label}: loading ${description}` : `${label}: ${count} ${description}`}
    title={error ?? `${label}: ${count ?? "Loading"} ${description}`}
    className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black leading-tight tabular-nums ${error ? "bg-amber-400 text-slate-950" : "bg-red-500 text-white"}`}
  >{text}</span>;
}
