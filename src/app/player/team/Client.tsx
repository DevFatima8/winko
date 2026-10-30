"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt, fmtDate } from "@/components/Shell";
import { Chevron } from "@/components/PlayerUi";
import { FacebookIcon, TelegramIcon, WhatsAppIcon, ShareIcon, ArrowLeftIcon } from "@/components/Icons";
import { usePage } from "@/lib/useDb";
import { referralLink } from "@/lib/siteUrl";

type Member = { _id: string; name: string; totalDeposited: number; createdAt: string };
type Comm = { _id: string; kind: string; fromUserId: { name: string } | null; pct: number; createdAt: string; amount: number };

const TABS = ["Home", "Promotion Sharing", "My Data", "Performance", "Commission"] as const;
type Tab = (typeof TABS)[number];
const money = (n: number) => Number(n ?? 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRAD = "bg-gradient-to-br from-[#e11d48] via-[#7c1d6f] to-[#1d4ed8]";

function Copy({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span role="button" tabIndex={0} aria-label="Copy" onClick={() => { try { void navigator.clipboard?.writeText(value); } catch { } setOk(true); setTimeout(() => setOk(false), 1200); }} className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-[#ffb800]">
      {ok ? <span className="text-[9px]">Copied</span> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>}
    </span>
  );
}

function Qr({ link }: { link: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void import("qrcode").then((m) => m.toDataURL(link, { margin: 1, width: 240 })).then((u) => { if (live) setSrc(u); }).catch(() => { });
    return () => { live = false; };
  }, [link]);
  const save = () => { if (!src) return; const a = document.createElement("a"); a.href = src; a.download = "invitation.png"; a.click(); };
  return (
    <div role="button" tabIndex={0} onClick={save} className="flex w-[84px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg bg-white">
      <div className="flex aspect-square items-center justify-center p-1">{src ? <img src={src} alt="QR" className="h-full w-full" draggable={false} /> : null}</div>
      <div className={`px-1 py-1 text-center text-[10px] font-bold leading-tight text-white ${GRAD}`}>Save invitation...</div>
    </div>
  );
}

function InviteBox({ code, link, pct }: { code: string; link: string; pct: number }) {
  const [note, setNote] = useState("");
  const msg = "winkox par join karo aur bonus lo! " + link;
  const flash = (s: string) => { setNote(s); setTimeout(() => setNote(""), 1800); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); }
    catch { const ta = document.createElement("textarea"); ta.value = link; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch { } ta.remove(); }
    flash("Link copied");
  };
  const open = (url: string) => { const w = window.open(url, "_blank", "noopener,noreferrer"); if (!w) window.location.href = url; };
  const share = async () => {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: "winkox", text: "winkox par join karo aur bonus lo!", url: link }); return; } catch (e) { if ((e as Error)?.name === "AbortError") return; }
    }
    await copyLink();
  };
  const targets = {
    wa: `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent("winkox par join karo aur bonus lo!")}`,
    tg: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("winkox par join karo aur bonus lo!")}`,
  };  const item = "flex flex-col items-center gap-1 text-[11px] text-slate-300";
  return (
    <div className="wx-card rounded-xl p-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[14px] text-white">
        <span>Invite friends</span>
        <span className="flex items-center gap-1.5 text-[12px] text-slate-400">My invitation code <b className="font-medium text-white">{code}</b><Copy value={code} /></span>
      </div>
      <div className="flex items-start gap-3 pt-3">
        <Qr link={link} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/20 px-2.5 py-2 text-[12px] text-slate-300">
            <span className="min-w-0 flex-1 truncate">{link}</span><Copy value={link} />
          </div>
          <div className="grid grid-cols-4 gap-1">
            <div role="button" tabIndex={0} onClick={() => void share()} className={`${item} cursor-pointer`}><span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-[#ffb800]"><ShareIcon size={18} /></span>Share</div>
            <div role="button" tabIndex={0} onClick={() => open(targets.wa)} className={`${item} cursor-pointer`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white"><WhatsAppIcon size={22} /></span>WhatsApp</div>
            <div role="button" tabIndex={0} onClick={() => open(targets.fb)} className={`${item} cursor-pointer`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877f2] text-white"><FacebookIcon size={22} /></span>Facebook</div>
            <div role="button" tabIndex={0} onClick={() => open(targets.tg)} className={`${item} cursor-pointer`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#229ed9] text-white"><TelegramIcon size={22} /></span>Telegram</div>          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-tight text-slate-500">{note ? <b className="text-[#ffb800]">{note}</b> : null}{note ? " · " : ""}Earn {pct}% commission on every deposit made by your invited friends.</p>
    </div>
  );
}

const PERIODS = ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Last Month"] as const;
type Period = (typeof PERIODS)[number];
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function range(p: Period): [number, number] {
  const t = dayStart(new Date());
  const DAY = 86400000;
  const mondayOff = (t.getDay() + 6) % 7;
  const weekStart = t.getTime() - mondayOff * DAY;
  switch (p) {
    case "Today": return [t.getTime(), t.getTime() + DAY];
    case "Yesterday": return [t.getTime() - DAY, t.getTime()];
    case "This Week": return [weekStart, weekStart + 7 * DAY];
    case "Last Week": return [weekStart - 7 * DAY, weekStart];
    case "This Month": return [new Date(t.getFullYear(), t.getMonth(), 1).getTime(), new Date(t.getFullYear(), t.getMonth() + 1, 1).getTime()];
    default: return [new Date(t.getFullYear(), t.getMonth() - 1, 1).getTime(), new Date(t.getFullYear(), t.getMonth(), 1).getTime()];
  }
}

function Stat({ title, sub, value, count }: { title: string; sub?: string; value: string; count?: number }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-1.5">
        <div className="text-[13px] text-white">{title}{sub && <span className="text-slate-400"> {sub}</span>}</div>
        <div className="shrink-0 text-[15px] font-bold text-white">{value}{count !== undefined && <span className="font-normal text-slate-400"> ({count})</span>}</div>
      </div>
      {["Subordinate Stats", "Other Stats"].map((l, i) => (
        <div key={l} className="mt-1.5 flex justify-between text-[12px] text-slate-400"><span>{l}</span><span className="text-slate-200">{i === 0 ? value : count !== undefined ? "0.00" : "0"}{count !== undefined && <span className="text-slate-400"> ({i === 0 ? count : 0})</span>}</span></div>
      ))}
    </div>
  );
}
const Row = ({ l, v, gold }: { l: string; v: string; gold?: boolean }) => (
  <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-[13px] ${gold ? "bg-[#ffc933]/[0.08]" : "bg-white/[0.05]"}`}><span className="text-white">{l}</span><span className={`font-bold ${gold ? "text-[#ffb800]" : "text-white"}`}>{v}</span></div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MyData({ data }: { data: any }) {
  const [period, setPeriod] = useState<Period>("Today");
  const team = data.team as Member[];
  const comm = data.commissions as Comm[];
  const txns = (data.txns ?? []) as { u: string; k: string; a: number; d: string }[];
  const bets = (data.bets ?? []) as { u: string; b: number; w: number; d: string }[];
  const [from, to] = range(period);
  const inR = (d: string | Date) => { const t = new Date(d).getTime(); return t >= from && t < to; };
  const sum = (a: number[]) => a.reduce((s, n) => s + Number(n || 0), 0);

  const newUsers = team.filter((m) => inR(m.createdAt)).length;
  const deps = txns.filter((t) => t.k === "deposit" && inR(t.d));
  const wds = txns.filter((t) => t.k === "withdraw" && inR(t.d));
  const firstOf = new Map<string, { a: number; d: string }>();
  txns.filter((t) => t.k === "deposit").forEach((t) => { if (!firstOf.has(t.u)) firstOf.set(t.u, { a: t.a, d: t.d }); });
  const firsts = [...firstOf.entries()].filter(([, f]) => inR(f.d));
  const sameDay = firsts.filter(([u, f]) => { const m = team.find((x) => String(x._id) === u); return m && dayStart(new Date(m.createdAt)).getTime() === dayStart(new Date(f.d)).getTime(); });
  const pBets = bets.filter((b) => inR(b.d));
  const perf = sum(pBets.map((b) => b.b));
  const wl = sum(pBets.map((b) => b.w - b.b));
  const claimedRewards = comm.filter((c) => (c.kind === "signup" || c.kind === "referral") && inR(c.createdAt));
  const pc = comm.filter((c) => inR(c.createdAt));
  const direct = sum(pc.filter((c) => c.kind === "deposit" || c.kind === "bet").map((c) => c.amount));
  const promo = sum(claimedRewards.map((c) => c.amount));
  const totalComm = Number(data.commission ?? 0);
  const allPerf = sum(bets.map((b) => b.b));
  const allWl = sum(bets.map((b) => b.w - b.b));
  const allPromo = sum(comm.filter((c) => c.kind === "signup" || c.kind === "referral").map((c) => c.amount));
  const allDirect = sum(comm.filter((c) => c.kind === "deposit" || c.kind === "bet").map((c) => c.amount));
  const users = (a: { u: string }[]) => new Set(a.map((x) => x.u)).size;

  return (
    <>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 text-[12px] [scrollbar-width:none]">
        {PERIODS.map((p) => (
          <span key={p} role="button" tabIndex={0} onClick={() => setPeriod(p)} className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 ${period === p ? `${GRAD} font-semibold text-white ring-1 ring-[#ffc933]/70` : "border border-white/20 text-slate-300"}`}>{p}</span>
        ))}
      </div>

      <div className="wx-card rounded-xl p-3">
        <div className="flex items-start justify-between"><div className="text-[16px] text-white">{period} Commission</div><div className="text-right"><div className="text-[20px] font-bold text-[#ffb800]">{money(pc.length ? sum(pc.map((c) => c.amount)) : 0)}</div><div className="text-[12px] text-slate-400">(Total commission {money(totalComm)})</div></div></div>
        <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2 text-[13px]">
          <div className="flex justify-between"><span className="text-slate-300">Direct commission</span><span className="font-bold text-[#ffb800]">{money(direct)}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">Other commission</span><span className="font-bold text-[#ffb800]">{money(0)}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">Promotional event rewards</span><span className="font-bold text-white">{money(promo)}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">Agent activity rewards</span><span className="font-bold text-white">{money(0)}</span></div>
        </div>
      </div>

      <div className="wx-card space-y-2 rounded-xl p-3">
        <div className="pb-1 text-center text-[16px] text-white">All Data</div>
        <Stat title="Total new users" value={String(newUsers)} />
        <Stat title="Total deposit" sub="(Users)" value={money(sum(deps.map((t) => t.a)))} count={users(deps)} />
        <Stat title="Total first charge" sub="(Number of people)" value={money(sum(firsts.map(([, f]) => f.a)))} count={firsts.length} />
        <Stat title="Same-day reg. first-deposit" sub="(Number of people)" value={money(sum(sameDay.map(([, f]) => f.a)))} count={sameDay.length} />
        <Stat title="Total withdrawal" sub="(Times)" value={money(sum(wds.map((t) => t.a)))} count={wds.length} />
        <Stat title="Total rewards claimed" sub="(Users)" value={money(promo)} count={claimedRewards.length} />
        <Stat title="Total valid bets" sub="(Users)" value={money(perf)} count={users(pBets)} />
        <Stat title="Total Perf." sub="(Users)" value={money(perf)} count={users(pBets)} />
        <Stat title="Total W/L" sub="(Users)" value={money(wl)} count={users(pBets)} />
      </div>

      <div className="wx-card space-y-2 rounded-xl p-3">
        <div className="pb-1 text-center text-[16px] text-white">Total data (including subordinate)</div>
        <Row l="Total subordinates" v={String(team.length)} />
        <Row l="Direct subordinates" v={String(team.length)} />
        <Row l="Other subordinates" v="0" />
        <Row l="Total Perf." v={money(allPerf)} />
        <Row l="Sub's Perf." v={money(allPerf)} />
        <Row l="Others' Perf." v={money(0)} />
        <Row l="Total direct sub's win/loss" v={money(allWl)} />
        <div className="border-t border-white/10 pt-2 text-center text-[16px] text-white">My total earnings</div>
        <Row gold l="Total commission" v={money(totalComm)} />
        <Row gold l="Direct commission" v={money(allDirect)} />
        <Row gold l="Other commission" v={money(0)} />
        <Row gold l="Total commission sent" v={money(totalComm)} />
        <Row gold l="Unclaimed" v={money(0)} />
        <Row gold l="Claimed" v={money(totalComm)} />
        <Row l="Cumulative rewards for promotional activities" v={money(allPromo)} />
        <Row l="Cumulative rewards for agency activities" v={money(0)} />
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TeamView({ data }: { data: any }) {
  const [tab, setTab] = useState<Tab>("Home");
  {
    const team = data.team as Member[];
    const comm = data.commissions as Comm[];
    const commission = Number(data.commission ?? 0);
    const code = (data.referralCode as string | null) ?? "";
    const pct = Number(data.depositCommissionPct ?? 1.5);
    const link = referralLink(code);
    const teamDeposits = team.reduce((s, m) => s + (m.totalDeposited ?? 0), 0);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = comm.filter((c) => new Date(c.createdAt).toDateString() === y.toDateString()).reduce((s, c) => s + c.amount, 0);
    const today = comm.length ? new Date(comm[0].createdAt).toLocaleDateString("en-GB") : "--";
    const label = "text-[12px] text-slate-400";

    const home = (
      <>
        <div className={`relative overflow-hidden rounded-xl ${GRAD} p-4`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Invitation Bonus</div>
          <div className="text-lg font-black leading-tight text-white">Recommendation bonus</div>
          <div className="text-xl font-black text-[#ffc933]">{pct}% commission</div>
        </div>

        <div className="wx-card rounded-xl p-3">
          <div className="flex items-start gap-3">
            <img src="/Website-Icons/Website-Icons/03-VIP/png/VIP-128.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 object-contain" draggable={false} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-[#ffb800] underline underline-offset-2">{code || "-"}</div>
              <span className="mt-1.5 inline-block rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">Infinite range</span>
            </div>
            <div className="w-[42%] shrink-0 text-[12px] leading-tight">
              <div className={label}>Number of audits</div><div className="text-white">{money(0)}</div>
              <div className={`${label} mt-1.5`}>Settlement date</div><div className="text-white">{today}</div>
            </div>
          </div>
          <div className="mt-2.5">
            <span className="inline-block rounded-full bg-[#e5393f] px-2 py-0.5 text-[11px] text-white">Max commission {pct}%, earn big monthly</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[14px] text-white"><span>Commission</span><Chevron /></div>
          <div className="grid grid-cols-2 gap-y-2.5 pt-1 text-[13px]">
            <div><div className={label}>Claimed</div><div className="text-white">{money(commission)}</div></div>
            <div className="flex items-start justify-between">
              <div><div className={label}>Unclaimed</div><div className="text-[#ffb800]">{money(0)}</div></div>
              <Link href="/player/withdraw" className="rounded-md bg-white/20 px-3 py-1.5 text-[12px] font-medium text-white">Claim</Link>
            </div>
            <div><div className={label}>Yesterday&apos;s direct results</div><div className="text-white">{money(yesterday)}</div></div>
            <div><div className={label}>Total Commission</div><div className="text-white">{money(commission)}</div></div>
          </div>
        </div>
        <InviteBox code={code} link={link} pct={pct} />
      </>
    );

    const body = tab === "Home" ? home : tab === "Promotion Sharing" ? <InviteBox code={code} link={link} pct={pct} /> : tab === "My Data" ? <MyData data={data} /> : (
      <div className="wx-card overflow-hidden rounded-xl">
        {tab === "Performance" && (
          <div className="grid grid-cols-2 gap-3 p-3 text-[13px]">
            <div><div className={label}>Direct subordinates</div><div className="text-[17px] text-white">{team.length}</div></div>
            <div><div className={label}>Direct performance</div><div className="text-[17px] text-white">{money(teamDeposits)}</div></div>
          </div>
        )}
        {tab === "Commission" && (
          <ul className="divide-y divide-white/5 text-[13px]">
            {comm.map((c) => <li key={String(c._id)} className="flex items-center justify-between px-3 py-2.5"><span className="text-slate-200">{c.kind === "deposit" ? "Deposit" : c.kind === "bet" ? "Bet" : c.kind === "referral" ? "Referral bonus" : "Signup"} · {c.fromUserId?.name ?? "-"} · {c.pct}% <span className="text-[11px] text-slate-500">{fmtDate(c.createdAt)}</span></span><span className="font-bold text-emerald-300">+{fmt(c.amount)}</span></li>)}
            {comm.length === 0 && <li className="py-6 text-center text-slate-500">Abhi koi commission nahi.</li>}
          </ul>
        )}
      </div>
    );

    return (
      <div className="mx-auto w-full max-w-2xl space-y-2.5 pb-6">
        <div className="relative flex h-9 items-center justify-center">
          <Link href="/player/profile" aria-label="Back" className="absolute left-0 flex h-8 w-8 items-center justify-center text-white"><ArrowLeftIcon size={18} /></Link>
          <h1 className="text-[17px] font-medium text-white">Invite</h1>
        </div>
        <div className="-mx-1 flex gap-5 overflow-x-auto border-b border-white/10 px-1 text-[13px] [scrollbar-width:none]">
          {TABS.map((tb) => (
            <span key={tb} role="button" tabIndex={0} onClick={() => setTab(tb)} className={`shrink-0 cursor-pointer whitespace-nowrap pb-2 ${tab === tb ? "border-b-2 border-[#ffc933] text-[#ffc933]" : "text-slate-300"}`}>{tb}</span>
          ))}
        </div>
        {body}
      </div>
    );
  }
}

export default function TeamPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async () => {
    const response = await fetch("/api/player/team", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Team data load nahi ho saka.");
    return <TeamView data={data} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
