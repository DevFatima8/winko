"use client";

import { formatMoney, formatSigned, settlementFor, type Deal } from "@/lib/ludo";
import { useDailyPoolMode } from "@/lib/walletSync";

const ROW_KEYS = [
  { key: "entry" as const, label: "Entry fee" },
  { key: "win" as const, label: "Win" },
  { key: "bag" as const, label: "Bag" },
  { key: "bagReturn" as const, label: "Bag return" },
  { key: "total" as const, label: "Total" },
];

export default function ResultOverlay({
  deal,
  balance,
  onLobby,
  onContinue,
}: {
  deal: Deal;
  balance: number;
  onLobby: () => void;
  onContinue: () => void;
}) {
  const won = deal.winner === 0;
  const poolEnabled = useDailyPoolMode();
  const order = [2, 1, 3, 0];
  const confetti = Array.from({ length: 36 }, (_, i) => i);
  const colors = ["#f5c518", "#e23b32", "#2fae4a", "#1e88e5", "#ffe56a", "#ff6b8a"];

  return (
    <div className="overlay">
      <div className="result-wrap">
        {confetti.map((i) => (
          <i
            key={i}
            className="confetti"
            style={{
              left: `${(i * 2.7) % 100}%`,
              background: colors[i % colors.length],
              animationDelay: `${(i % 10) * 0.12}s`,
              animationDuration: `${2.2 + (i % 5) * 0.25}s`,
            }}
          />
        ))}

        <div style={{ position: "relative", display: "inline-block", padding: "0 24px 12px" }}>
          <div className="ribbon" />
          <div className={`banner-3d ${won ? "win" : "lose"}`}>{poolEnabled ? "DAILY PAYOUT PENDING" : won ? "WIN" : ""}</div>
        </div>

        <div className="result-card">
          <div className="result-players">
            {order.map((id) => {
              const p = deal.players[id];
              const isWinner = id === deal.winner;
              return (
                <div key={id} className={`result-player ${isWinner ? "winner" : ""}`}>
                  <img src={p.avatar} alt={p.name} />
                  {isWinner ? <span className="winner-badge">Winner</span> : <span style={{ height: 16 }} />}
                  <div className="rp-name">{p.name}</div>
                </div>
              );
            })}
          </div>

          <div className="result-rows">
            {ROW_KEYS.map((row) => (
              <div className="result-row" key={row.key}>
                <div className="row-label">{poolEnabled ? `Indicative ${row.label} (not paid)` : row.label}</div>
                {order.map((id) => {
                  const s = settlementFor(deal, id);
                  const val = s[row.key];
                  return (
                    <div key={id} className={`cell-val ${row.key === "total" ? "red" : ""}`}>
                      {row.key === "entry" ? formatMoney(Math.abs(val)) : val < 0 ? "" : formatSigned(val)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="result-balance">{formatMoney(balance)}</div>
        </div>

        <div className="result-actions">
          <button type="button" className="btn-lobby" onClick={onLobby}>
            Back To Lobby
          </button>
          <button type="button" className="btn-continue" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
