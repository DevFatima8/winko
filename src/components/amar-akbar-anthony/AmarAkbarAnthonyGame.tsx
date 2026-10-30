"use client";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { gameSfx } from "@/lib/gameSfx";

import { useEffect, useRef, useState } from "react";
import { useLiveTable } from "../teen-patti/useLiveTable";
import Link from "next/link";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import "./amar-akbar-anthony.css";

type PlayerKey = "amar" | "akbar" | "anthony";

type Player = {
  key: PlayerKey;
  name: string;
  suit: string;
  suitSymbol: string;
  color: string;
  gradient: string;
  glow: string;
};

const PLAYERS: Player[] = [
  {
    key: "amar",
    name: "AMAR",
    suit: "spade",
    suitSymbol: "♠",
    color: "#111827",
    gradient: "linear-gradient(160deg,#1e293b,#0f172a)",
    glow: "rgba(148,163,184,0.9)",
  },
  {
    key: "akbar",
    name: "AKBAR",
    suit: "heart",
    suitSymbol: "♥",
    color: "#dc2626",
    gradient: "linear-gradient(160deg,#7f1d1d,#450a0a)",
    glow: "rgba(248,113,113,0.9)",
  },
  {
    key: "anthony",
    name: "ANTHONY",
    suit: "club",
    suitSymbol: "♣",
    color: "#059669",
    gradient: "linear-gradient(160deg,#065f46,#022c22)",
    glow: "rgba(52,211,153,0.9)",
  },
];

const CHIPS = BET_PRESETS;

function chipGradient(c: number) {
  switch (c) {
    case 50: return "radial-gradient(circle at 30% 30%, #10b981, #047857)";
    case 100: return "radial-gradient(circle at 30% 30%, #ef4444, #991b1b)";
    case 200: return "radial-gradient(circle at 30% 30%, #0284c7, #0369a1)";
    case 500: return "radial-gradient(circle at 30% 30%, #8b5cf6, #6d28d9)";
    default: return "radial-gradient(circle at 30% 30%, #f59e0b, #b45309)";
  }
}

// Card ranks used purely for visual flair on the revealed card.
const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7"];

const STARTING_BALANCE = 5000;

type Phase = "betting" | "spinning" | "result";

function formatMoney(n: number) {
  return "Rs. " + n.toLocaleString("en-PK");
}

export default function AmarAkbarAnthonyGame({ backHref }: { backHref?: string }) {
  const [balance] = useGameBalance("amar-akbar-anthony", STARTING_BALANCE);
  const pool = usePoolLifecycle("amar-akbar-anthony");
  const [selectedChip, setSelectedChip] = useState(50);
  const [bets, setBets] = usePoolRoundState<Record<PlayerKey, number>>("amar-akbar-anthony", "bets", {
    amar: 0,
    akbar: 0,
    anthony: 0,
  });
  const [phase, setPhase] = useState<Phase>("betting");
  const [flipping, setFlipping] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [winner, setWinner] = useState<PlayerKey | null>(null);
  const [cardRank, setCardRank] = useState("A");
  const [resultText, setResultText] = useState<string>("");
  const [resultWin, setResultWin] = useState(false);
  const [endDismissed, setEndDismissed] = useState(false);
  const [payout, setPayout] = useState(0);
  const [history, setHistory] = useState<PlayerKey[]>([]);
  const [message, setMessage] = useState("Place your bets!");

  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: bets, targets: ["amar", "akbar", "anthony"], prepaid: true,
    start: () => deal(), reset: () => nextRound(),
    apply: async (b) => { const stake = b.amar + b.akbar + b.anthony; pool.checkpoint({ bets: b }); if (stake > 0 && !await pool.stake(stake)) return; setBets(b); },
  });

  useEffect(() => {
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  const totalBet = bets.amar + bets.akbar + bets.anthony;

  async function placeBet(key: PlayerKey) {
    if (phase !== "betting") return;
    gameSfx.chip();
    if (selectedChip <= 0) return;
    if (selectedChip > balance) {
      setMessage("Not enough balance for this chip!");
      return;
    }
    pool.checkpoint({ bets: { ...bets, [key]: bets[key] + selectedChip } });
    if (!await pool.stake(selectedChip)) return;
    setBets((prev) => ({ ...prev, [key]: prev[key] + selectedChip }));
    setMessage("Bet placed. Add more or press DEAL.");
  }

  async function clearBets() {
    if (phase !== "betting") return;
    if (totalBet > 0 && !await pool.refund()) return;
    setBets({ amar: 0, akbar: 0, anthony: 0 });
    setMessage("Bets cleared.");
  }

  async function deal() {
    if (pool.busy) return;
    if (phase !== "betting") return;
    gameSfx.spin();
    if (!live.begin()) return;

    setPhase("spinning");
    setRevealed(false);
    setWinner(null);
    setFlipping(true);
    setMessage("Dealing...");

    const outcome = totalBet > 0
      ? await pool.resolveServer({ bets }) as { win: PlayerKey; playerWins: boolean; rank: string; payout: number } | null
      : { win: PLAYERS[Math.floor(Math.random() * 3)].key, playerWins: false, rank: RANKS[Math.floor(Math.random() * RANKS.length)], payout: 0 };
    if (!outcome) { setPhase("betting"); setFlipping(false); return; }

    // Animated card cycling.
    if (cycleRef.current) clearInterval(cycleRef.current);
    cycleRef.current = setInterval(() => {
      setCardRank(RANKS[Math.floor(Math.random() * RANKS.length)]);
    }, 90);

    settleRef.current = setTimeout(async () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      setFlipping(false);
      setRevealed(true);
      setWinner(outcome.win);
      setCardRank(outcome.rank);
      if (totalBet <= 0) {
        setResultText(`${outcome.win.toUpperCase()} WINS`);
        setHistory((h) => [outcome.win, ...h].slice(0, 12));
        setPhase("result");
        return;
      }

      const winAmount = outcome.payout;
      pool.announce();
      if (winAmount > 0) {
        gameSfx.win();
        setResultWin(true);
        setPayout(winAmount);
        setResultText(pool.enabled ? `PROVISIONAL CLAIM ${formatMoney(winAmount)} — daily settlement pending` : `YOU WIN ${formatMoney(winAmount)}!`);
      } else {
        gameSfx.lose();
        setResultWin(false);
        setPayout(0);
        setResultText(pool.enabled ? "Daily payout pending — provisional claim 0" : "No win");
      }

      setHistory((h) => [outcome.win, ...h].slice(0, 12));
      setEndDismissed(false);
      setPhase("result");
    }, 2200);
  }

  function nextRound() {
    if (phase === "spinning") return;
    setPhase("betting");
    setBets({ amar: 0, akbar: 0, anthony: 0 });
    setRevealed(false);
    setWinner(null);
    setResultText("");
    setPayout(0);
    setMessage(balance <= 0 ? "Insufficient balance." : "Place your bets!");
  }

  const winnerPlayer = winner ? PLAYERS.find((p) => p.key === winner)! : null;

  return (
    <div className="amar-akbar-anthony-container h-full w-full flex flex-col min-h-0 bg-[radial-gradient(circle_at_50%_0%,#1e3a5f_0%,#0b1220_55%,#050810_100%)] text-white overflow-hidden">
      {live.controls}
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-white/10 bg-black/40 px-3 py-2 sm:px-6 sm:py-3 shadow-md z-10 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref || "/player"}
            className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="font-extrabold text-sm sm:text-lg tracking-wider">
            <span className="text-slate-200">AMAR</span>{" "}
            <span className="text-rose-400">AKBAR</span>{" "}
            <span className="text-emerald-400">ANTHONY</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-1 font-black text-amber-950 shadow-[0_2px_10px_rgba(245,158,11,0.4)] text-xs sm:text-sm">
            <span>🪙</span>
            <span>{formatMoney(balance)}</span>
          </div>
        </div>
      </header>

      {/* Main scrollable body */}
      <main className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 flex flex-col items-center">
        {/* Table Felt */}
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background:
              "radial-gradient(circle at 50% 30%, #15803d 0%, #14532d 60%, #052e16 100%)",
            borderRadius: 20,
            border: "5px solid #713f12",
            boxShadow:
              "0 15px 40px rgba(0,0,0,0.6), inset 0 0 50px rgba(0,0,0,0.4)",
            padding: "14px 12px 18px",
            position: "relative",
          }}
        >
          {/* Deck / dealt card */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 12,
              perspective: 900,
            }}
          >
            <div
              style={{
                width: "clamp(80px, 18vw, 105px)",
                height: "clamp(112px, 25vw, 148px)",
                position: "relative",
                transition: "transform 0.5s",
                transformStyle: "preserve-3d",
                transform: revealed ? "rotateY(360deg)" : "none",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 12,
                  background: revealed && winnerPlayer
                    ? "#fff"
                    : "linear-gradient(135deg,#1e3a8a,#1e40af)",
                  border: "3px solid #fff",
                  boxShadow: revealed && winnerPlayer
                    ? `0 0 30px ${winnerPlayer.glow}`
                    : "0 6px 18px rgba(0,0,0,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  animation: flipping ? "shake 0.18s infinite" : "none",
                }}
              >
                {revealed && winnerPlayer ? (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 8,
                        fontWeight: 800,
                        fontSize: 16,
                        color: winnerPlayer.color,
                      }}
                    >
                      {cardRank}
                    </div>
                    <div
                      style={{
                        fontSize: 44,
                        color: winnerPlayer.color,
                        lineHeight: 1,
                      }}
                    >
                      {winnerPlayer.suitSymbol}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 8,
                        fontWeight: 800,
                        fontSize: 16,
                        color: winnerPlayer.color,
                        transform: "rotate(180deg)",
                      }}
                    >
                      {cardRank}
                    </div>
                  </>
                ) : flipping ? (
                  <div
                    style={{
                      fontSize: 34,
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    {cardRank}
                  </div>
                ) : (
                  <div style={{ fontSize: 34 }}>🂠</div>
                )}
              </div>
            </div>
          </div>

          {/* Message banner */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 10,
              minHeight: 24,
              fontWeight: 700,
              fontSize: 14,
              color: phase === "result" ? (resultWin ? "#4ade80" : "#f87171") : "#fde68a",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {phase === "result" ? resultText : message}
          </div>

          {/* Betting boxes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 8,
            }}
          >
            {PLAYERS.map((p) => {
              const isWinner = revealed && winner === p.key;
              const isLoserRevealed = revealed && winner !== p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => placeBet(p.key)}
                  disabled={phase !== "betting"}
                  style={{
                    cursor: phase === "betting" ? "pointer" : "default",
                    background: p.gradient,
                    borderRadius: 14,
                    border: isWinner
                      ? "3px solid #fde047"
                      : "2px solid rgba(255,255,255,0.18)",
                    padding: "10px 4px 8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    position: "relative",
                    transition: "all 0.2s",
                    transform: isWinner ? "scale(1.04)" : "scale(1)",
                    opacity: isLoserRevealed ? 0.45 : 1,
                    boxShadow: isWinner
                      ? `0 0 25px ${p.glow}`
                      : "0 4px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  {isWinner && (
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        background: "#fde047",
                        color: "#422006",
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: 8,
                      }}
                    >
                      WINNER
                    </div>
                  )}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      color: p.color,
                      fontWeight: 800,
                    }}
                  >
                    {p.suitSymbol}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 12,
                      letterSpacing: 0.5,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      opacity: 0.75,
                    }}
                  >
                    Pays 3x
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      minHeight: 20,
                      padding: bets[p.key] > 0 ? "2px 8px" : 0,
                      borderRadius: 10,
                      background: bets[p.key] > 0 ? "#fbbf24" : "transparent",
                      color: "#3b2600",
                      fontWeight: 800,
                      fontSize: 11,
                    }}
                  >
                    {bets[p.key] > 0 ? formatMoney(bets[p.key]) : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chips */}
        <div style={{ width: "100%", maxWidth: 460, marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginBottom: 6,
              textAlign: "center",
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            SELECT CHIP
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {CHIPS.map((c) => {
              const active = selectedChip === c;
              return (
                <button
                  key={c}
                  onClick={() => setSelectedChip(c)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    border: active
                      ? "3px dashed #fde047"
                      : "2px dashed rgba(255,255,255,0.4)",
                    background: chipGradient(c),
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: "pointer",
                    transform: active ? "translateY(-4px) scale(1.08)" : "none",
                    boxShadow: active
                      ? "0 6px 16px rgba(0,0,0,0.6)"
                      : "0 3px 8px rgba(0,0,0,0.4)",
                  }}
                >
                  {c}
                </button>
              );
            })}
            <input
              type="number"
              min={10}
              value={selectedChip || ""}
              placeholder="Custom"
              aria-label="Custom bet amount"
              onChange={(e) => setSelectedChip(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              style={{
                width: 80,
                height: 48,
                borderRadius: 10,
                border: "2px solid rgba(253,224,71,0.5)",
                background: "rgba(0,0,0,0.5)",
                color: "#fde047",
                fontWeight: 800,
                fontSize: 13,
                textAlign: "center",
              }}
            />
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            marginTop: 14,
            display: "flex",
            gap: 8,
          }}
        >
          {phase === "result" ? (
            <button
              onClick={nextRound}
              style={{
                ...btnStyle("linear-gradient(90deg,#f59e0b,#d97706)"),
                color: "#000",
                boxShadow: "0 0 20px rgba(245,158,11,0.5)",
              }}
            >
              NEXT ROUND
            </button>
          ) : (
            <>
              <button
                onClick={clearBets}
                disabled={phase !== "betting" || totalBet === 0}
                style={{
                  ...btnStyle("linear-gradient(90deg,#e11d48,#be123c)"),
                  flex: 0.65,
                  opacity: totalBet === 0 || phase !== "betting" ? 0.4 : 1,
                  boxShadow: "0 4px 14px rgba(225,29,72,0.4)",
                }}
              >
                CLEAR
              </button>
              <button
                onClick={deal}
                disabled={phase !== "betting"}
                style={{
                  ...btnStyle("linear-gradient(90deg,#10b981,#059669)"),
                  opacity: phase !== "betting" ? 0.6 : 1,
                  boxShadow: "0 0 20px rgba(16,185,129,0.5)",
                }}
              >
                {phase === "spinning" ? "DEALING..." : "DEAL"}
              </button>
            </>
          )}
        </div>

        {/* Total bet info */}
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            marginTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          <span>
            Total Bet: <b style={{ color: "#fbbf24" }}>{formatMoney(totalBet)}</b>
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>Win Payout: 3x</span>
        </div>

        {/* History */}
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            marginTop: 10,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, fontWeight: 700 }}>
            RESULT HISTORY
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {history.length === 0 && (
              <span style={{ opacity: 0.4, fontSize: 11 }}>No rounds yet</span>
            )}
            {history.map((h, i) => {
              const p = PLAYERS.find((x) => x.key === h)!;
              return (
                <div
                  key={i}
                  title={p.name}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "#fff",
                    color: p.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 13,
                    border: "2px solid rgba(255,255,255,0.3)",
                  }}
                >
                  {p.suitSymbol}
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <GameOverOverlay open={phase === "result" && totalBet > 0 && !endDismissed} winAmount={resultWin ? payout : 0} result={resultText} onPlayAgain={nextRound} onClose={() => setEndDismissed(true)} />

      <style>{`
        @keyframes shake {
          0% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-3px) rotate(-2deg); }
          75% { transform: translateX(3px) rotate(2deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    flex: 1,
    background: bg,
    border: "none",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 1,
    padding: "12px 0",
    borderRadius: 12,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
  };
}
