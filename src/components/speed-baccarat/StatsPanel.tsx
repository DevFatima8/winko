import { money, type Stats } from "./lib/game";

type Props = {
  stats: Stats;
  balance: number;
  initialBalance: number;
  onReset: () => void;
};

function Cell({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[rgba(255,255,255,.03)] px-2 py-1.5 ring-1 ring-white/5">
      <div className="font-num text-[8.5px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className={`font-num mt-0.5 text-[13px] font-bold [overflow-wrap:anywhere] ${tone || "text-[#f4ead2]"}`}>{value}</div>
    </div>
  );
}

export default function StatsPanel({ stats, balance, onReset }: Props) {
  return (
    <section className="baccarat-wallet gold-rim flex min-w-0 shrink-0 flex-col gap-3 rounded-xl p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-[#e7c877]">Player wallet</h2>
        <button
          type="button"
          onClick={onReset}
          className="baccarat-sidebar-button rounded-[4px] border border-white/12 px-2 py-[3px] uppercase text-white/50 transition hover:border-[rgba(231,200,119,.6)] hover:text-[#ffe9a8]"
        >
          reset stats
        </button>
      </header>

      <div className="relative min-w-0 rounded-lg bg-[linear-gradient(150deg,rgba(231,200,119,.14),rgba(0,0,0,.35))] px-3 py-2.5 ring-1 ring-[rgba(231,200,119,.2)]">
        <div className="font-num text-[8.5px] uppercase tracking-[0.22em] text-white/45">Balance</div>
        <div className="baccarat-wallet-balance font-display mt-0.5 text-[22px] font-black leading-tight tabular-nums text-[#ffe9a8] [overflow-wrap:anywhere]">
          {money(balance)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Cell label="Hands" value={String(stats.rounds)} />
        <Cell label="Pushes" value={String(stats.pushes)} />
        <Cell label="Wagered" value={money(stats.wagered).replace("Rs. ", "")} />
        <Cell label="Best hand" value={money(stats.best)} tone={stats.best > 0 ? "text-[#8ff0b6]" : ""} />
        <Cell
          label="Streak"
          value={stats.streak > 0 ? `W${stats.streak}` : "—"}
          tone={stats.streak > 0 ? "text-[#8ff0b6]" : "text-white/60"}
        />
      </div>

      <div className="rounded-lg border border-[rgba(231,200,119,.18)] bg-[rgba(0,0,0,.35)] p-2">
        <div className="font-num mb-1 text-[8.5px] uppercase tracking-[0.18em] text-[#e7c877]">Your settled bets</div>
        <p className="font-num mt-1.5 text-[8.5px] leading-[1.5] text-white/35">
          Results and wallet credits are settled by the server. Watching without a bet does not affect your statistics.
          P / B / T counts: {stats.players} / {stats.bankers} / {stats.ties} · pairs {stats.pairs}
        </p>
      </div>
    </section>
  );
}
