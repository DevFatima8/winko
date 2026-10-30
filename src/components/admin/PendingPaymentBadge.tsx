export function PendingPaymentBadge({ count, error, label }: { count?: number; error: string | null; label: string }) {
  if (count === 0 && !error) return null;
  const text = error ? `${count ?? ""}!` : count ?? "...";
  return <span
    role="status"
    aria-live="polite"
    aria-label={error ? `${label}: ${error}${count !== undefined ? ` Last known pending count: ${count}.` : ""}` : count === undefined ? `${label}: loading pending requests` : `${label}: ${count} pending requests`}
    title={error ?? `${label}: ${count ?? "Loading"} pending requests`}
    className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black leading-tight tabular-nums ${error ? "bg-amber-400 text-slate-950" : "bg-red-500 text-white"}`}
  >{text}</span>;
}
