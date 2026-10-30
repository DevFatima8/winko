import { formatMoney, formatMultiplier } from "./lib/crash";
import type { BotPlayer } from "./lib/players";

export type SidebarTab = "all" | "mine" | "top";

export interface MyRow {
  id: string;
  name: string;
  tone: string;
  bet: number;
  cashoutMultiplier: number | null;
  payout: number;
}

interface SidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  bots: BotPlayer[];
  totalBets: number;
  totalStaked: number;
  myRows: MyRow[];
  ladderValue: number;
  onLadderPick: (value: number) => void;
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "all", label: "All Bets" },
  { id: "mine", label: "My Bets" },
  { id: "top", label: "Top" },
];

const LADDER = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 400];

export function Sidebar({
  tab,
  onTabChange,
  bots,
  totalBets,
  totalStaked,
  myRows,
  ladderValue,
  onLadderPick,
}: SidebarProps) {
  const botRows: MyRow[] = bots.map((b) => ({
    id: b.id,
    name: b.name,
    tone: b.tone,
    bet: b.bet,
    cashoutMultiplier: b.cashoutMultiplier,
    payout: b.payout,
  }));

  const rows: MyRow[] =
    tab === "mine"
      ? myRows
      : tab === "top"
        ? [...botRows, ...myRows]
          .filter((r) => r.payout > 0)
          .sort((a, b) => b.payout - a.payout)
          .slice(0, 12)
        : [...myRows, ...botRows];

  return (
    <aside className="hidden w-[212px] shrink-0 flex-col border-r border-[#0d2547] bg-[#0a1c33] md:flex">
      {/* bet ladder — mirrors the reference left rail */}
      <div className="border-b border-[#0d2547] px-2 pb-2 pt-2">
        <div className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-sky-200/50">
          Bet ladder
        </div>
        <div className="h-[166px] overflow-y-auto rounded bg-[#071426] py-1">
          {LADDER.map((v) => {
            const active = Math.abs(v - ladderValue) < 0.001;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onLadderPick(v)}
                className={`flex w-full items-center justify-between px-2 py-[3px] text-[11px] font-bold tabular-nums transition-colors ${active ? "bg-[#f2c14b] text-[#2b2003]" : "text-sky-100/70 hover:bg-[#123056]"
                  }`}
              >
                <span>{formatMoney(v)}</span>
                {active && <span className="text-[9px] font-black">PICK</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-3 px-2 pt-2 text-[11px] font-bold">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`relative pb-1.5 transition-colors ${tab === t.id ? "text-amber-300" : "text-slate-400 hover:text-slate-200"
              }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-amber-300" />
            )}
          </button>
        ))}
      </div>

      {/* totals */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[9px] font-black text-[#2b2003]">
          {totalBets}
        </div>
        <div className="leading-tight">
          <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-sky-200/50">
            Total bets
          </div>
          <div className="text-[12px] font-extrabold tabular-nums text-white">
            {formatMoney(totalStaked)}
          </div>
        </div>
      </div>

      {/* table head */}
      <div className="grid grid-cols-[1fr_36px_36px_42px] gap-1 border-b border-[#0d2547] px-2 pb-1 text-[8px] font-bold uppercase tracking-[0.08em] text-sky-200/45">
        <span>Player</span>
        <span className="text-right">Bet</span>
        <span className="text-right">Mult.</span>
        <span className="text-right">Cash out</span>
      </div>

      {/* rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_36px_36px_42px] items-center gap-1 px-2 py-[3px] text-[10px]"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full bg-gradient-to-br ${row.tone} text-[7px] font-black text-white`}
              >
                {row.name.slice(0, 2)}
              </span>
              <span className="truncate font-semibold text-slate-200">{row.name}</span>
            </div>
            <span className="text-right tabular-nums text-slate-300">
              {row.bet < 1 ? row.bet.toFixed(1) : row.bet.toFixed(2)}
            </span>
            <span className="text-right tabular-nums text-slate-300">
              {row.cashoutMultiplier ? formatMultiplier(row.cashoutMultiplier) : "-"}
            </span>
            <span
              className={`text-right font-bold tabular-nums ${row.payout > 0 ? "text-emerald-400" : "text-slate-500"
                }`}
            >
              {row.payout > 0 ? row.payout.toFixed(2) : "-"}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-2 py-6 text-center text-[10px] text-slate-500">
            No bets in this round yet.
          </div>
        )}
      </div>
    </aside>
  );
}
