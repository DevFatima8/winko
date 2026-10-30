import { EXTRA_BET_COST, MULTIPLIERS, PAYLINES, PAYOUT, type SymbolId } from '../game/logic';
import { SymbolIcon } from './SymbolIcon';

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Paytable({ bet, onClose }: { bet: number; onClose: () => void }) {
  const order: SymbolId[] = ['wild', 'red', 'blue', 'green', 'A', 'K', 'Q', 'J'];
  return (
    <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-h-full overflow-y-auto rounded-2xl border-2 border-yellow-500 bg-gradient-to-b from-[#0c3a3a] to-[#06171a] p-4 popin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="gold-text text-2xl font-black tracking-wider" style={{ fontFamily: 'Impact, sans-serif' }}>
            GAME RULES
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-red-600 text-white font-bold border-2 border-white/70">
            ✕
          </button>
        </div>

        <h3 className="text-yellow-300 font-black text-sm tracking-wide mb-2">SYMBOLS &amp; PAYOUTS (3 IN A LINE)</h3>
        <p className="text-teal-100 text-xs mb-3">Reels are settled by the server, with 10 winning players per 100 distinct players. Combined line and multiplier returns cannot exceed 2× the paid stake, including the Extra Bet cost.</p>
        <div className="grid grid-cols-2 gap-2">
          {order.map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-black/40 border border-teal-300/25 p-2">
              <div className="w-11 h-11 shrink-0">
                <SymbolIcon id={s} />
              </div>
              <div>
                <div className="text-yellow-300 font-black text-base leading-none">{fmt(PAYOUT[s] * bet)}</div>
                <div className="text-[10px] text-teal-200 mt-0.5">x{PAYOUT[s]} bet</div>
                {s === 'wild' && <div className="text-[9px] text-pink-300 leading-none mt-0.5">Substitutes all</div>}
              </div>
            </div>
          ))}
        </div>

        <h3 className="text-yellow-300 font-black text-sm tracking-wide mt-4 mb-2">WIN MULTIPLIER REEL</h3>
        <p className="text-teal-100 text-xs mb-2">
          A 4th reel spins with the main reels. The multiplier in the <b className="text-yellow-300">centre</b> position multiplies
          all line wins of that spin.
        </p>
        <div className="flex gap-1.5 justify-between">
          {MULTIPLIERS.map((m) => (
            <div
              key={m}
              className="flex-1 text-center rounded-lg py-1.5 font-black text-sm text-yellow-200 border border-yellow-500/60 bg-black/40"
            >
              x{m}
            </div>
          ))}
        </div>

        <h3 className="text-yellow-300 font-black text-sm tracking-wide mt-4 mb-2">EXTRA BET</h3>
        <p className="text-teal-100 text-xs">
          Turn on <b className="text-yellow-300">EX</b> to pay {EXTRA_BET_COST}x per spin. The x1 multiplier is removed from the
          multiplier reel and higher multipliers appear more often.
        </p>

        <h3 className="text-yellow-300 font-black text-sm tracking-wide mt-4 mb-2">5 PAYLINES</h3>
        <div className="grid grid-cols-5 gap-2">
          {PAYLINES.map((line, i) => (
            <div key={i} className="rounded-lg bg-black/40 border border-teal-300/25 p-1.5">
              <div className="grid grid-cols-3 gap-0.5">
                {[0, 1, 2].map((r) =>
                  [0, 1, 2].map((c) => (
                    <div key={`${r}${c}`} className={`aspect-square rounded-sm ${line[c] === r ? 'bg-yellow-400' : 'bg-teal-900'}`} />
                  ))
                )}
              </div>
              <div className="text-center text-[10px] text-teal-200 mt-1">{i + 1}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-teal-300/80 mt-3 text-center">
          Wins pay left to right. Demo game with Rs. balance only.
        </p>
      </div>
    </div>
  );
}
