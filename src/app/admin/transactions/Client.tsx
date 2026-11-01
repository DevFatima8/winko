"use client";
import Link from "next/link";
import { Card, ProviderBadge, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { processTransactionAction } from "@/lib/clientActions";
import { useDb } from "@/lib/useDb";
import { compressImage } from "@/lib/imageFile";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { refreshAdminData } from "@/lib/adminLiveUpdates";

type TransactionType = "deposit" | "withdraw";

function PendingActions({ id, type }: { id: string; type: TransactionType }) {
  const [slip, setSlip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setError("");
    try {
      const r = await processTransactionAction(id, decision, decision === "rejected" ? "Rejected by admin" : undefined, decision === "approved" && slip ? slip : undefined);
      if (r?.error) setError(r.error);
      else refreshAdminData();
    } catch (reason) {
      console.error("[Process transaction]", reason);
      setError(reason instanceof Error ? reason.message : "Transaction process nahi ho saki. Dobara try karein.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex min-w-[9rem] flex-col gap-1.5">
      {type === "withdraw" && (
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-yellow-400">
          <span className="shrink-0 font-semibold text-yellow-300">{slip ? "Slip ✓" : "Attach slip"}</span>
          <span className="truncate text-slate-500">(optional)</span>
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return setSlip(null);
            try { setSlip(await compressImage(f, 900, 0.8)); } catch (err) { alert(err instanceof Error ? err.message : "Slip load nahi ho saki."); }
          }} />
        </label>
      )}
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={() => run("approved")} className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50">Approve</button>
        <button disabled={busy} onClick={() => run("rejected")} className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-50">Reject</button>
      </div>
      {error && <p role="alert" className="max-w-60 whitespace-normal text-xs text-red-300">{error}</p>}
    </div>
  );
}

const startOfDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getWeekRange = (value: string) => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), week = Number(match[2]);
  const januaryFourth = new Date(year, 0, 4);
  const monday = new Date(januaryFourth);
  monday.setDate(januaryFourth.getDate() - ((januaryFourth.getDay() + 6) % 7) + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  const next = new Date(monday);
  next.setDate(next.getDate() + 7);
  return { start: monday, end: next };
};

export default function TransactionsPageClient({ type, params, searchParams }: { type: TransactionType; params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params;
  return <TransactionsView key={`${type}:${JSON.stringify(searchParams ?? {})}`} type={type} searchParams={searchParams} />;
}

type TransactionRow = {
  _id: string; userId: { name: string; phone: string } | null; paymentAccountId: { accountTitle: string; accountNumber: string } | null;
  provider: string; amount: number; type: TransactionType; senderNumber: string | null; referenceId: string | null; proofImage?: string | null; slipImage?: string | null;
  status: string; method: string; adminNote: string | null; createdAt: Date | string; holderName?: string | null;
};

function TransactionsView({ type, searchParams }: { type: TransactionType; searchParams?: Record<string, string> }) {
    const router = useRouter();
    const [status, setStatus] = useState(searchParams?.status ?? "");
    const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
    const { q, days, date, week, year, order } = searchParams ?? {};
    const { data, error, reload } = useDb(async (signal) => {
    const query = new URLSearchParams({ type });
    for (const [key, value] of Object.entries({ status, q, days, date, week, year, order })) if (value) query.set(key, value);
    const response = await fetch(`/api/admin/transactions?${query}`, { cache: "no-store", signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Transactions load nahi ho sake.");
    return { status, rows: result.rows as TransactionRow[] };
    }, [type, status, q, days, date, week, year, order]);
    const updating = data === null || data.status !== status;
    const rows = (data?.rows ?? []).filter(row => !status || row.status === status);

    const tabs = [["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]];
    const basePath = type === "deposit" ? "/admin/deposits" : "/admin/withdrawals";
    const makeHref = (nextStatus = status ?? "") => {
      const values = new URLSearchParams();
      if (nextStatus) values.set("status", nextStatus);
      if (q) values.set("q", q); if (days) values.set("days", days); if (date) values.set("date", date); if (week) values.set("week", week); if (year) values.set("year", year); if (order) values.set("order", order);
      const query = values.toString();
      return query ? `${basePath}?${query}` : basePath;
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">{type === "deposit" ? "Deposits" : "Withdrawals"}</h1><p className="mt-1 text-sm text-slate-400">{type === "deposit" ? "Deposit requests ki history aur approval." : "Withdrawal requests ki history aur approval."}</p></div><div className="flex gap-2"><Link href="/admin/deposits" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${type === "deposit" ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-300"}`}>Deposits</Link><Link href="/admin/withdrawals" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${type === "withdraw" ? "bg-red-400 text-slate-950" : "bg-slate-800 text-slate-300"}`}>Withdrawals</Link></div></div>
        <form className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3 sm:grid-cols-2 lg:grid-cols-6" method="get" onSubmit={event => {
          event.preventDefault();
          const values = new URLSearchParams();
          for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === "string" && value) values.set(key, value);
          if (status) values.set("status", status);
          router.push(`${basePath}?${values}`);
        }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search user, phone, TID..." className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400 lg:col-span-2" />
          <select name="order" defaultValue={order === "asc" ? "asc" : "desc"} aria-label="Transaction sort order" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="asc">Ascending (oldest first)</option><option value="desc">Descending (newest first)</option></select>
          <input name="days" type="number" min="1" defaultValue={days ?? ""} placeholder="Last N days" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400" />
          <input name="date" type="date" defaultValue={date ?? ""} title="Specific day" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400" />
          <input name="week" type="week" defaultValue={week ?? ""} title="Specific week" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400" />
          <div className="flex gap-2"><input name="year" type="number" min="2000" max="2100" defaultValue={year ?? ""} placeholder="Year" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400" /><button className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-slate-950">Search</button></div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400 sm:col-span-2 lg:col-span-6">Specific day, week, year ya last N days mein se ek filter select karein. <Link href={basePath} onClick={() => setStatus("")} className="text-yellow-400">Clear filters</Link></div>
        </form>
        <div className="flex flex-wrap gap-2">
          {tabs.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => {
              setStatus(v);
              window.history.replaceState(null, "", makeHref(v));
            }} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === v ? "bg-yellow-400 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{l}</button>
          ))}
        </div>
        {error && <div role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error} <button type="button" onClick={reload} className="underline">Try again</button></div>}
        {updating && !error && <p role="status" className="text-xs text-slate-400">Loading transactions...</p>}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm [&_td]:px-3 [&_td]:align-middle [&_th]:px-3 [&_th]:whitespace-nowrap [&_td:nth-child(2)]:whitespace-nowrap [&_td:nth-child(3)]:whitespace-nowrap [&_td:nth-child(4)]:whitespace-nowrap [&_td:nth-child(7)]:whitespace-nowrap">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="pb-2">User</th><th className="pb-2">Type</th><th className="pb-2">Provider</th><th className="pb-2">Amount</th><th className="pb-2">Account / Holder / TID</th><th className="pb-2">Status</th><th className="pb-2">Time</th><th className="pb-2">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((t) => {
                  const id = String(t._id);
                  const { proofImage, slipImage } = t;
                  return (
                    <tr key={id}>
                      <td className="py-2.5"><div className="font-medium text-white">{t.userId?.name}</div><div className="text-xs text-slate-500">{t.userId?.phone}</div></td>
                      <td className={`py-2.5 font-bold uppercase ${type === "deposit" ? "text-emerald-400" : "text-red-400"}`}>{type}</td>
                      <td className="py-2.5"><ProviderBadge provider={t.provider} /></td>
                      <td className="py-2.5 font-semibold text-white">{fmt(t.amount)}</td>
                      <td className="py-2.5 min-w-[200px] text-xs text-slate-300">
                        {t.type === "deposit" ? (
                          <>
                            <div>To: <b className="text-white">{t.paymentAccountId?.accountTitle ?? "-"}</b> ({t.paymentAccountId?.accountNumber ?? "-"})</div>
                            <div>From: {t.senderNumber}</div>
                            <div className="font-mono text-yellow-400">TID: {t.referenceId}</div>
                            {proofImage && <button type="button" onClick={() => setPreview({ src: proofImage, title: "Payment screenshot" })} className="mt-1 inline-block text-yellow-400 underline">Open payment screenshot</button>}
                          </>
                        ) : (
                          <div>
                            Send to: <span className="font-mono text-yellow-400">{t.senderNumber}</span>
                            {t.holderName && <div className="mt-0.5 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-300">Holder: {t.holderName}</div>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5"><StatusBadge status={t.status} />{t.method === "gateway" && <span className="ml-1 rounded bg-[#ffb800]/20 px-1.5 py-0.5 text-[9px] font-black text-[#ffb800]">TEST GW</span>}{t.adminNote && <div className="mt-1 max-w-[220px] break-words text-xs text-slate-500">{t.adminNote}</div>}</td>
                      <td className="py-2.5 text-slate-400">{fmtDate(t.createdAt)}</td>
                      <td className="py-2.5">
                        {t.status === "pending" && <PendingActions id={id} type={type} />}
                        {t.status !== "pending" && slipImage && <button type="button" onClick={() => setPreview({ src: slipImage, title: "Payment slip" })} className="text-xs text-yellow-400 underline">View slip</button>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !updating && !error && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Is filter ke liye koi {type} nahi.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        {preview && <PaymentPreview key={preview.src} src={preview.src} title={preview.title} onClose={() => setPreview(null)} />}
      </div>
    );
}

function PaymentPreview({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-xl bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-bold text-white">{title}</h2><button type="button" autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 text-white">Close</button></div>
        {failed ? <p role="alert" className="text-red-300">Screenshot load nahi ho saka. Image missing ya unavailable hai.</p> :
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} onError={() => setFailed(true)} className="mx-auto max-h-[75dvh] max-w-full object-contain" />}
      </section>
    </div>,
    document.body,
  );
}
