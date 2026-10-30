"use client";

import { BETS, COLOR_META, COLORS, formatMoney, type BetAmount } from "@/lib/ludo";
import BetAmountInput from "@/components/BetAmountInput";

function MiniPawn({ color }: { color: keyof typeof COLOR_META }) {
  const meta = COLOR_META[color];
  return (
    <div className="preview-pawn">
      <div
        className="pawn-base"
        style={{
          position: "absolute",
          left: "8%",
          bottom: 0,
          width: "84%",
          height: "22%",
          borderRadius: "50%",
          background: meta.dark,
        }}
      />
      <div
        className="pawn-body"
        style={{
          position: "absolute",
          left: "12%",
          bottom: "8%",
          width: "76%",
          height: "52%",
          borderRadius: "40%",
          background: `linear-gradient(160deg, ${meta.light}, ${meta.main} 50%, ${meta.dark})`,
          border: "2px solid rgba(255,255,255,0.5)",
        }}
      />
      <div
        className="pawn-head"
        style={{
          position: "absolute",
          left: "22%",
          top: 0,
          width: "56%",
          height: "44%",
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #fff 0%, ${meta.main} 42%, ${meta.dark} 100%)`,
          border: "2px solid rgba(255,255,255,0.75)",
        }}
      />
    </div>
  );
}

export default function Lobby({
  balance,
  bet,
  setBet,
  onPlay,
  busy,
  onRules,
}: {
  balance: number;
  bet: BetAmount;
  setBet: (b: BetAmount) => void;
  onPlay: () => void;
  busy: boolean;
  onRules: () => void;
}) {
  return (
    <div className="lobby">
      <div className="lobby-hero">
        <div className="logo-title">LUDO</div>
        <div className="logo-sub">QUICK</div>
        <div className="token-row">
          {COLORS.map((c) => (
            <MiniPawn key={c} color={c} />
          ))}
        </div>
        <p style={{ margin: "4px 0 0", color: "#e0c8f5", fontWeight: 700 }}>
          4 players · first token home wins · money bags &amp; chance
        </p>
      </div>

      <div className="lobby-card">
        <h2>Select Entry Fee</h2>
        <div className="bet-grid">
          {BETS.map((amount) => (
            <button
              key={amount}
              type="button"
              className={`bet-chip ${bet === amount ? "active" : ""}`}
              onClick={() => setBet(amount)}
            >
              <strong>{amount.toLocaleString()}</strong>
              <small>Win {Math.round(amount * 1.85).toLocaleString()}</small>
            </button>
          ))}
        </div>
        <BetAmountInput value={bet} onChange={setBet} max={Math.max(1, Math.floor(balance))} />
        <button type="button" className="play-btn" onClick={onPlay} disabled={busy || balance < bet || bet < 10}>
          {busy ? "Matching..." : balance < bet ? "Not enough Rs." : "PLAY NOW"}
        </button>
        <p className="lobby-note">
          Balance {formatMoney(balance)} ·{" "}
          <button type="button" className="rules-link" onClick={onRules}>
            How to play
          </button>
        </p>
      </div>
    </div>
  );
}
