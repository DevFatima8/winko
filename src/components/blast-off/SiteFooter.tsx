import { Mark } from "./Mark";

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-hair bg-graphite-2">
      <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[42ch]">
            <div className="flex items-center gap-3">
              <Mark className="h-8 w-8" />
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">BLAST</span>
                <span className="font-display text-[17px] font-bold tracking-[0.16em] text-launch">OFF</span>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-[1.85] text-mist">
              Blast Off is a free-to-play simulation of a rocket crash game. Credits have no monetary value, cannot be
              deposited, withdrawn or exchanged, and every round is generated on your own device.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <div className="legend mb-3">Game</div>
              <ul className="space-y-2 text-[13px] text-mist">
                <li>Flight manual</li>
                <li>Payout table</li>
                <li>Session stats</li>
              </ul>
            </div>
            <div>
              <div className="legend mb-3">Fairness</div>
              <ul className="space-y-2 text-[13px] text-mist">
                <li>Client-side RNG</li>
                <li>Seed per round</li>
                <li>Independent rounds</li>
              </ul>
            </div>
            <div>
              <div className="legend mb-3">Support</div>
              <ul className="space-y-2 text-[13px] text-mist">
                <li>Responsible play</li>
                <li>Session limits</li>
                <li>Self-exclusion</li>
                <li>Help line</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-hair pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="border border-hair px-2 py-1 text-[10px] tracking-[0.2em] text-mist uppercase">
              18+ only
            </span>
            <span className="text-[11px] tracking-[0.14em] text-mist/70 uppercase">
              Play responsibly — the house keeps 65 of every 100 rounds
            </span>
          </div>
          <span className="num text-[11px] text-mist/60">© 2026 BLAST OFF · DEMO BUILD 1.4.0</span>
        </div>
      </div>
    </footer>
  );
}
