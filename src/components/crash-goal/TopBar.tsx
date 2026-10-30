import { useEffect, useState } from "react";
import { formatMoney, formatMultiplier } from "./lib/crash";

const TONE: Record<"low" | "mid" | "high", string> = {
  low: "text-emerald-400",
  mid: "text-fuchsia-300",
  high: "text-rose-400",
};

function toneFor(v: number) {
  return v < 2 ? "low" : v < 10 ? "mid" : "high";
}

export function CrashGoalLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex select-none items-center gap-1.5">
      <svg
        width={compact ? 20 : 24}
        height={compact ? 20 : 24}
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#1b2431" strokeWidth="6" />
        <polygon points="50,30 63,41 58,57 42,57 37,41" fill="#1b2431" />
        <g fill="#1b2431">
          <polygon points="50,6 59,15 55,26 45,26 41,15" />
          <polygon points="83,27 91,38 85,49 75,46 75,34" />
          <polygon points="76,73 84,84 73,92 63,85 66,73" />
          <polygon points="24,73 16,84 27,92 37,85 34,73" />
          <polygon points="17,27 9,38 15,49 25,46 25,34" />
        </g>
      </svg>
      <div
        className="font-black italic leading-none tracking-tight"
        style={{ fontSize: compact ? 15 : 18 }}
      >
        <span className="text-white">CRASH</span> <span className="text-amber-300">GOAL</span>
      </div>
    </div>
  );
}

interface TopBarProps {
  history: number[];
  balance: number;
  roundTimer: number | null;
  recent: { multiplier: number; amount: number }[];
}

export function TopBar({ history, balance, roundTimer, recent }: TopBarProps) {
  const [clock, setClock] = useState("00:00:00");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="relative z-30 flex h-[46px] shrink-0 items-center gap-2 border-b border-[#0d2547] bg-[#08172e] px-2 sm:px-3">
      <CrashGoalLogo />

      {/* live cash-outs list — mirrors the reference top-centre panel */}
      <div className="mx-auto flex min-w-0 max-w-[200px] flex-1 flex-col items-stretch gap-[2px] overflow-hidden sm:max-w-[230px]">
        {recent.slice(0, 3).map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded bg-[#0e2444] px-2 py-[1px] text-[10px] leading-[13px]"
          >
            <span className={`font-black tabular-nums ${TONE[toneFor(r.multiplier)]}`}>
              {formatMultiplier(r.multiplier)}x
            </span>
            <span className="font-bold tabular-nums text-sky-100/90">{formatMoney(r.amount)}</span>
          </div>
        ))}
      </div>

      {/* past multipliers strip */}
      <div className="hidden items-center gap-1 lg:flex">
        {history.slice(0, 7).map((value, i) => (
          <span
            key={`${i}-${value}`}
            className={`shrink-0 rounded bg-[#0e2444] px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              TONE[toneFor(value)]
            }`}
          >
            {formatMultiplier(value)}x
          </span>
        ))}
      </div>

      {/* balance + clock */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-full border border-[#2b4a8f] bg-[#123a86] text-[10px] font-bold text-sky-200">
          {roundTimer === null ? "↻" : Math.ceil(roundTimer)}
        </div>
        <div className="text-right">
          <div className="text-[15px] font-extrabold leading-none tabular-nums text-white">
            {formatMoney(balance)}
          </div>
          <div className="text-[9px] font-semibold leading-none tabular-nums text-sky-200/60">
            {clock}
          </div>
        </div>
      </div>
    </header>
  );
}
