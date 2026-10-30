import { money, type Stats } from "./lib/game";

type Props = {
  stats: Stats;
  balance: number;
  initialBalance: number;
  onReset: () => void;
};

function Cell({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md bg-[rgba(255,255,255,.03)] px-2 py-1.5 ring-1 ring-white/5">
      <div className="font-num text-[8.5px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className={`font-num mt-0.5 text-[13px] font-bold ${tone || "text-[#f4ead2]"}`}>{value}</div>
    </div>
  );
}

export default function StatsPanel({ stats, balance, onReset }: Props) {
  return (
    <section className="gold-rim flex flex-col gap-3 rounded-xl p-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-[#e7c877]">Player wallet</h2>
        <button
          type="button"
          onClick={onReset}
          className="font-num rounded-[4px] border border-white/12 px-2 py-[3px] text-[9px] uppercase tracking-[0.16em] text-white/50 transition hover:border-[rgba(231,200,119,.6)] hover:text-[#ffe9a8]"
        >
          reset stats
        </button>
      </header>

      <div className="relative overflow-hidden rounded-lg bg-[linear-gradient(150deg,rgba(231,200,119,.14),rgba(0,0,0,.35))] px-3 py-2.5 ring-1 ring-[rgba(231,200,119,.2)]">
        <div className="font-num text-[8.5px] uppercase tracking-[0.22em] text-white/45">Balance</div>
        <div className="font-display mt-0.5 text-[30px] font-black leading-none text-[#ffe9a8]">
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
