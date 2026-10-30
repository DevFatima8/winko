"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Gamepad2, LockKeyhole, Phone, Search, ShieldAlert, Sparkles, UnlockKeyhole, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { setUserGameBlockAction } from "@/lib/actions";
import { usePage, NOT_FOUND } from "@/lib/useDb";
import { GameGridSkeleton } from "@/components/lobby/GameGridSkeleton";

type RestrictionData = {
  user: { id: string; name: string; username: string | null; phone: string };
  games: { slug: string; name: string; icon: string; imageUrl: string }[];
  blockedGames: string[];
  canOperate: boolean;
};
type GameFilter = "all" | "available" | "restricted";

export default function GameRestrictionsClient({ params }: { params?: Record<string, string> }) {
  const { id } = params ?? {};
  return usePage(async () => {
    if (!id) return NOT_FOUND;
    const response = await fetch(`/api/admin/data?view=user-game-restrictions&id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.status === 404) return NOT_FOUND;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Game restrictions load nahi ho sakin.");
    return <RestrictionsManager data={data as RestrictionData} />;
  }, [JSON.stringify(params ?? {})], <GameGridSkeleton />);
}

function RestrictionsManager({ data }: { data: RestrictionData }) {
  const [blockedGames, setBlockedGames] = useState(() => new Set(data.blockedGames));
  const [filter, setFilter] = useState<GameFilter>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(60);
  const [selected, setSelected] = useState<RestrictionData["games"][number] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredGames = useMemo(() => data.games.filter((game) => {
    const isRestricted = blockedGames.has(game.slug);
    if (filter === "available" && isRestricted) return false;
    if (filter === "restricted" && !isRestricted) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || game.name.toLocaleLowerCase().includes(term) || game.slug.includes(term);
  }), [blockedGames, data.games, filter, search]);

  const restrictedCount = blockedGames.size;
  const availableCount = data.games.length - restrictedCount;
  const selectedIsRestricted = selected ? blockedGames.has(selected.slug) : false;

  async function confirmChange() {
    if (!selected || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await setUserGameBlockAction(data.user.id, selected.slug, !selectedIsRestricted);
      setBlockedGames((current) => {
        const updated = new Set(current);
        if (selectedIsRestricted) updated.delete(selected.slug);
        else updated.add(selected.slug);
        return updated;
      });
      setNotice(`${selected.name} ${selectedIsRestricted ? "access restored for" : "restricted for"} ${data.user.name}.`);
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Game restriction update nahi ho saki. Dobara try karein.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <Link href={`/admin/users/${data.user.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-violet-200 transition-colors hover:text-white">
        <ArrowLeft size={17} /> Back to user profile
      </Link>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative isolate overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#211047] via-[#120b28] to-[#091922] p-5 shadow-[0_24px_90px_rgba(20,10,50,0.42)] sm:p-8"
      >
        <div className="pointer-events-none absolute -right-12 -top-24 -z-10 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
              <ShieldAlert size={14} /> Player access controls
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">Game restrictions</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-violet-100/70 sm:text-base">
              Choose which games this player can access. Every game appears once, with its original cover art.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-violet-100/80">
              <span className="inline-flex items-center gap-2"><UserRound size={15} className="text-cyan-300" />{data.user.name}{data.user.username ? ` · @${data.user.username}` : ""}</span>
              <span className="inline-flex items-center gap-2"><Phone size={15} className="text-cyan-300" />{data.user.phone}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[390px]">
            <SummaryCard label="All games" value={data.games.length} tone="violet" />
            <SummaryCard label="Available" value={availableCount} tone="cyan" />
            <SummaryCard label="Restricted" value={restrictedCount} tone="rose" />
          </div>
        </div>
      </motion.section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#110b22]/90 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter games">
            {([
              ["all", "All games", data.games.length],
              ["available", "Available", availableCount],
              ["restricted", "Restricted", restrictedCount],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => { setFilter(value); setLimit(60); }}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:text-sm ${filter === value ? "bg-violet-500 text-white shadow-lg shadow-violet-950/40" : "bg-white/[0.05] text-violet-100/65 hover:bg-white/10 hover:text-white"}`}
              >
                {label} <span className="ml-1 opacity-70">{count}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-200/50" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setLimit(60); }}
              placeholder="Search games..."
              aria-label="Search games"
              className="w-full rounded-xl border border-white/10 bg-black/25 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-violet-100/35 focus:border-violet-400/60"
            />
          </label>
        </div>

        {notice && <p className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200" role="status">{notice}</p>}
        {!data.canOperate && <p className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">You do not have permission to manage this player.</p>}

        {filteredGames.length ? (
          <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <AnimatePresence mode="popLayout">
              {filteredGames.slice(0, limit).map((game, index) => (
                <GameCard
                  key={game.slug}
                  game={game}
                  restricted={blockedGames.has(game.slug)}
                  index={index}
                  disabled={!data.canOperate}
                  onSelect={() => { setError(""); setSelected(game); }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-dashed border-violet-200/15 bg-white/[0.025] px-5 py-14 text-center">
            <Gamepad2 className="mx-auto text-violet-200/35" size={34} />
            <p className="mt-3 font-bold text-white">No games found</p>
            <p className="mt-1 text-sm text-violet-100/55">Try another search or filter.</p>
          </div>
        )}
        {filteredGames.length > limit && <button type="button" onClick={() => setLimit(value => value + 60)} className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Load more games ({filteredGames.length - limit})</button>}
      </section>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05030b]/80 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setSelected(null); }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="restriction-dialog-title"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 27 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#151027] shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
            >
              <div className="relative aspect-[16/8] overflow-hidden bg-black/40">
                <Image src={selected.imageUrl} unoptimized alt="" fill sizes="(max-width: 640px) 100vw, 448px" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#151027] via-[#151027]/20 to-black/10" />
                <button type="button" disabled={pending} onClick={() => setSelected(null)} aria-label="Close dialog" className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 p-2 text-white transition hover:bg-black/70 disabled:opacity-50"><X size={18} /></button>
                <div className="absolute bottom-3 left-5 flex items-center gap-2 text-lg font-black text-white"><span>{selected.icon}</span>{selected.name}</div>
              </div>
              <div className="px-5 pb-5 pt-1 sm:px-6">
                <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${selectedIsRestricted ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                  {selectedIsRestricted ? <UnlockKeyhole size={21} /> : <LockKeyhole size={21} />}
                </div>
                <h2 id="restriction-dialog-title" className="text-xl font-black text-white">
                  {selectedIsRestricted ? "Restore game access?" : "Confirm game restriction"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-violet-100/70">
                  {selectedIsRestricted
                    ? `Are you sure you want to restore ${selected.name} for ${data.user.name}?`
                    : "Are you sure you want to restrict this game for the user?"}
                </p>
                {!selectedIsRestricted && <p className="mt-2 text-xs leading-5 text-violet-100/45">The player will no longer be able to open or play this game until access is restored.</p>}
                {error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={pending} onClick={() => setSelected(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-violet-100/75 transition hover:bg-white/[0.06] disabled:opacity-50">Cancel</button>
                  <button
                    type="button"
                    disabled={pending || !data.canOperate}
                    onClick={() => void confirmChange()}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 ${selectedIsRestricted ? "bg-emerald-600 shadow-emerald-950/40 hover:bg-emerald-500" : "bg-rose-600 shadow-rose-950/40 hover:bg-rose-500"}`}
                  >
                    {pending ? <Sparkles size={16} className="animate-spin" /> : selectedIsRestricted ? <UnlockKeyhole size={16} /> : <LockKeyhole size={16} />}
                    {pending ? "Updating..." : selectedIsRestricted ? "Restore access" : "Yes, restrict game"}
                  </button>
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "violet" | "cyan" | "rose" }) {
  const colors = {
    violet: "border-violet-300/15 bg-violet-400/[0.08] text-violet-200",
    cyan: "border-cyan-300/15 bg-cyan-400/[0.07] text-cyan-200",
    rose: "border-rose-300/15 bg-rose-400/[0.07] text-rose-200",
  };
  return <div className={`rounded-2xl border p-3 text-center sm:p-4 ${colors[tone]}`}><div className="text-2xl font-black tabular-nums sm:text-3xl">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-70 sm:text-xs">{label}</div></div>;
}

function GameCard({ game, restricted, index, disabled, onSelect }: {
  game: RestrictionData["games"][number];
  restricted: boolean;
  index: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.018, 0.18) }}
      className={`group overflow-hidden rounded-2xl border bg-[#120d23] shadow-lg transition-colors ${restricted ? "border-rose-300/25 shadow-rose-950/10" : "border-white/[0.08] hover:border-violet-300/30"}`}
    >
      <div className="relative aspect-[1.46] overflow-hidden bg-gradient-to-br from-violet-900/50 to-[#09121b]">
        {!imageFailed ? (
          <Image
            src={game.imageUrl}
            unoptimized
            alt={`${game.name} game`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className={`object-cover transition duration-500 group-hover:scale-105 ${restricted ? "brightness-[0.58] grayscale-[0.45]" : ""}`}
            onError={() => setImageFailed(true)}
          />
        ) : <Gamepad2 size={34} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-violet-200/45" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/10" />
        <span className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md sm:left-3 sm:top-3 sm:text-[10px] ${restricted ? "bg-rose-500/90 text-white" : "bg-emerald-500/85 text-white"}`}>
          {restricted ? <><LockKeyhole size={11} /> Restricted</> : <><Check size={11} /> Available</>}
        </span>
        {restricted && <div className="absolute inset-0 grid place-items-center"><LockKeyhole className="text-white/75 drop-shadow-lg" size={30} /></div>}
      </div>
      <div className="p-2.5 sm:p-3.5">
        <div className="mb-3 flex min-h-9 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-base">{game.icon}</span>
          <h2 className="line-clamp-2 text-xs font-extrabold leading-4 text-white sm:text-sm sm:leading-5">{game.name}</h2>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onSelect}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-black transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs ${restricted ? "border border-emerald-300/15 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" : "bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white shadow-md shadow-rose-950/25 hover:from-rose-500 hover:to-fuchsia-500"}`}
        >
          {restricted ? <><UnlockKeyhole size={14} /> Restore access</> : <><LockKeyhole size={14} /> Restrict game</>}
        </button>
      </div>
    </motion.article>
  );
}
