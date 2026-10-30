"use client";

import {
  LINES,
  PAYTABLE,
  SYMBOL_META,
  SYMBOL_ORDER,
  formatMoney,
  type SymbolId,
} from "./lib/fortune";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";

type Overlay = "none" | "menu" | "pay" | "bet" | "auto" | "rules";

export function Splash({ progress, ready }: { progress: number; ready: boolean }) {
  return (
    <div className={`ft-splash ${ready ? "is-out" : ""}`}>
      <div className="ft-splash-glow" />
      <p className="ft-kicker">WG · Rainforest Fortune</p>
      <h1 className="ft-splash-title">
        FORTUNE
        <span>TOUCAN</span>
      </h1>
      <img src="/images/toucan-mascot.png" alt="" className="ft-splash-bird" />
      <div className="ft-load">
        <div className="ft-load-bar" style={{ width: `${progress}%` }} />
      </div>
      <p className="ft-load-txt">{ready ? "GET READY" : `LOADING ${Math.floor(progress)}%`}</p>
      <p className="ft-demo-tag">Rs. GAME</p>
    </div>
  );
}

export function FeatureIntro({
  symbol,
}: {
  symbol: Exclude<SymbolId, "wild">;
}) {
  const meta = SYMBOL_META[symbol];
  return (
    <div className="ft-feature-intro">
      <div className="ft-feature-card">
        <p className="ft-feature-kicker">RANDOM FEATURE</p>
        <h2>FORTUNE TOUCAN</h2>
        <p className="ft-feature-sub">Sticky respins · chosen symbol locks</p>
        <img src={meta.src} alt={meta.name} />
        <p className="ft-feature-name">{meta.name}</p>
      </div>
    </div>
  );
}

export function BigWinOverlay({
  amount,
  shown,
  tier,
  provisional = false,
}: {
  amount: number;
  shown: number;
  tier: "big" | "super" | "mega";
  provisional?: boolean;
}) {
  const label = provisional ? "PROVISIONAL CLAIM" : tier === "mega" ? "MEGA WIN" : tier === "super" ? "SUPER WIN" : "BIG WIN";
  return (
    <div className="ft-bigwin">
      <div className={`ft-bigwin-card is-${tier}`}>
        <p className="ft-bigwin-label">{label}</p>
        <p className="ft-bigwin-amt">{formatMoney(shown)}</p>
        <p className="ft-bigwin-total">Total {formatMoney(amount)}</p>
      </div>
    </div>
  );
}

export function MenuSheet({
  open,
  sound,
  turbo,
  onClose,
  onOpen,
  onToggleSound,
  onToggleTurbo,
}: {
  open: boolean;
  sound: boolean;
  turbo: boolean;
  onClose: () => void;
  onOpen: (o: Overlay) => void;
  onToggleSound: () => void;
  onToggleTurbo: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ft-backdrop" onClick={onClose}>
      <div className="ft-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ft-sheet-head">
          <h3>MENU</h3>
          <button type="button" className="ft-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <button type="button" className="ft-row" onClick={() => onOpen("pay")}>
          Paytable
        </button>
        <button type="button" className="ft-row" onClick={() => onOpen("rules")}>
          How to play
        </button>
        <button type="button" className="ft-row" onClick={onToggleSound}>
          Sound <span>{sound ? "ON" : "OFF"}</span>
        </button>
        <button type="button" className="ft-row" onClick={onToggleTurbo}>
          Turbo <span>{turbo ? "ON" : "OFF"}</span>
        </button>
      </div>
    </div>
  );
}

export function PaytableModal({
  open,
  bet,
  onClose,
}: {
  open: boolean;
  bet: number;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ft-backdrop" onClick={onClose}>
      <div className="ft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-sheet-head">
          <h3>PAYTABLE</h3>
          <button type="button" className="ft-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="ft-modal-note">Three matching symbols on a payline. Values shown for current bet {formatMoney(bet)}.</p>
        <div className="ft-pay-list">
          {SYMBOL_ORDER.map((id) => {
            const meta = SYMBOL_META[id];
            const line = PAYTABLE[id] * bet;
            return (
              <div key={id} className="ft-pay-row">
                <img src={meta.src} alt={meta.name} />
                <div>
                  <strong>{meta.name}</strong>
                  <em>{meta.hint}</em>
                </div>
                <span>
                  3×
                  <b>{formatMoney(line)}</b>
                </span>
              </div>
            );
          })}
        </div>
        <div className="ft-info-block">
          <h4>x10 MULTIPLIER</h4>
          <p>
            When every position on the 3×3 grid is part of a winning payline, the total win is multiplied by 10. A full
            screen of wilds can award up to 2,500× the spin amount.
          </p>
        </div>
        <div className="ft-info-block">
          <h4>FORTUNE TOUCAN FEATURE</h4>
          <p>
            Triggers at random. One pay symbol is chosen. Only that symbol, wilds, and blanks can land. Chosen symbols
            and wilds stick while empty cells respin until nothing new lands or the grid is full.
          </p>
        </div>
      </div>
    </div>
  );
}

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="ft-backdrop" onClick={onClose}>
      <div className="ft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-sheet-head">
          <h3>HOW TO PLAY</h3>
          <button type="button" className="ft-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <ol className="ft-rules">
          <li>Choose your bet in Rs. (quick chips or custom amount), split across 5 paylines.</li>
          <li>Press the gold spin button or use autoplay.</li>
          <li>Land 3 matching symbols on any of the 5 paylines to win.</li>
          <li>Paylines: 3 horizontal rows and 2 diagonals.</li>
          <li>The framed toucan is wild and substitutes for all symbols.</li>
          <li>Wild three-of-a-kind pays the highest line prize.</li>
          <li>Watch for the random Fortune Toucan sticky-respin feature.</li>
          <li>Fill the whole grid in a win for the x10 banner multiplier.</li>
          <li>Server-prepared reels select 10 winning players per 100 distinct players. The total return, including sticky respins and multipliers, is at most 2× the paid stake.</li>
        </ol>
        <p className="ft-modal-note">Amounts are in Rs.</p>
      </div>
    </div>
  );
}

export function BetModal({
  open,
  bet,
  balance,
  onBet,
  onMax,
  onClose,
}: {
  open: boolean;
  bet: number;
  balance: number;
  onBet: (n: number) => void;
  onMax: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ft-backdrop" onClick={onClose}>
      <div className="ft-modal ft-bet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-sheet-head">
          <h3>BET</h3>
          <button type="button" className="ft-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="ft-bet-label">BET (Rs.)</p>
        <div className="ft-chips">
          {BET_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={s === bet ? "is-on" : ""}
              onClick={() => onBet(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="ft-bet-label">CUSTOM</p>
        <BetAmountInput value={bet} onChange={onBet} max={Math.max(1, Math.floor(balance))} />
        <div className="ft-bet-meta">
          <span>
            LINES <b>{LINES}</b>
          </span>
          <span>
            SPIN AMOUNT <b>{formatMoney(bet)}</b>
          </span>
        </div>
        <button type="button" className="ft-max" onClick={onMax}>
          MAX SPIN
        </button>
      </div>
    </div>
  );
}

export function AutoModal({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const opts = [10, 20, 30, 50, 80, 100, 200, 500, 1000];
  return (
    <div className="ft-backdrop" onClick={onClose}>
      <div className="ft-modal ft-bet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-sheet-head">
          <h3>AUTO SPIN</h3>
          <button type="button" className="ft-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="ft-modal-note">Choose how many hands-free spins to play.</p>
        <div className="ft-chips dense">
          {opts.map((n) => (
            <button key={n} type="button" onClick={() => onPick(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
