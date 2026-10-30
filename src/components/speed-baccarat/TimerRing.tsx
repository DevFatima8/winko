export default function TimerRing({ seconds, total, locked }: { seconds: number; total: number; locked: boolean }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, seconds / total));
  const urgent = !locked && seconds <= 4;
  const stroke = locked ? "#e7c877" : urgent ? "#ff5a4f" : "#ffe9a8";

  return (
    <div className="relative flex h-[64px] w-[64px] sm:h-[92px] sm:w-[92px] items-center justify-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="rgba(2,12,10,.72)" stroke="rgba(255,255,255,.09)" strokeWidth="5" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 240ms ease", filter: "drop-shadow(0 0 6px rgba(255,233,168,.55))" }}
        />
      </svg>
      <div className="flex flex-col items-center leading-none">
        {locked ? (
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#ffe9a8]">dealing</span>
        ) : (
          <>
            <span className={`font-num text-[17px] sm:text-[26px] font-bold ${urgent ? "urgent" : "text-[#f4ead2]"}`}>
              {Math.max(0, seconds).toFixed(1)}
            </span>
            <span className="font-num mt-1 text-[8px] uppercase tracking-[0.2em] text-white/45">to call</span>
          </>
        )}
      </div>
    </div>
  );
}
