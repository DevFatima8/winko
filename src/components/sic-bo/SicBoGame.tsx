"use client";
import { gameSfx } from "@/lib/gameSfx";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { DiceOutcome } from "@/lib/multiplayer-rules";

import { useEffect, useRef, useState } from "react";
import { BET_PRESETS } from "@/lib/betPresets";
import "./sic-bo.css";

type DiceRoll = [number, number, number];
type MarketId = "small" | "big" | "triple" | `total-${number}`;
type Market = {
  id: MarketId;
  label: string;
  description: string;
  payout: number;
};
type RoundResult = {
  round: number;
  dice: DiceRoll;
  market: string;
  stake: number;
  win: boolean;
  profit: number;
};

type Phase = "betting" | "ready" | "rolling" | "result";

const CHIP_VALUES: readonly number[] = BET_PRESETS;
const TOTALS = Array.from({ length: 14 }, (_, index) => index + 4);
const TOTAL_PAYOUTS: Record<number, number> = {
  4: 50,
  5: 18,
  6: 14,
  7: 12,
  8: 8,
  9: 6,
  10: 6,
  11: 6,
  12: 6,
  13: 8,
  14: 12,
  15: 14,
  16: 18,
  17: 50,
};
const MARKETS: Market[] = [
  { id: "small", label: "Small", description: "4–10 · triples lose", payout: 1 },
  { id: "big", label: "Big", description: "11–17 · triples lose", payout: 1 },
  { id: "triple", label: "Any triple", description: "Three of a kind", payout: 30 },
  ...TOTALS.map((total) => ({
    id: `total-${total}` as const,
    label: `Total ${total}`,
    description: `Exact sum of all three dice`,
    payout: TOTAL_PAYOUTS[total],
  })),
];

const PIP_POSITIONS: Record<number, string[]> = {
  1: ["center"],
  2: ["top-left", "bottom-right"],
  3: ["top-left", "center", "bottom-right"],
  4: ["top-left", "top-right", "bottom-left", "bottom-right"],
  5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
  6: [
    "top-left",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-right",
  ],
};

function formatCoins(amount: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

function DiceFace({ value, rolling = false }: { value: number; rolling?: boolean }) {
  return (
    <div className={`dice-face${rolling ? " dice-rolling" : ""}`} aria-label={`Die showing ${value}`}>
      {PIP_POSITIONS[value].map((position) => (
        <span className={`die-pip pip-${position}`} key={position} />
      ))}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-die-pip brand-pip-one" />
      <span className="brand-die-pip brand-pip-two" />
      <span className="brand-die-pip brand-pip-three" />
    </div>
  );
}

function MarketButton({
  market,
  selected,
  locked,
  onSelect,
}: {
  market: Market;
  selected: boolean;
  locked: boolean;
  onSelect: (market: Market) => void;
}) {
  return (
    <button
      className={`market-card market-${market.id}${selected ? " market-selected" : ""}${locked ? " market-locked" : ""}`}
      type="button"
      onClick={() => onSelect(market)}
      disabled={locked}
      aria-pressed={selected}
    >
      <span className="market-card-copy">
        <span className="market-eyebrow">{market.id === "small" || market.id === "big" ? "HIGH / LOW" : "SPECIAL BET"}</span>
        <span className="market-name">{market.label}</span>
        <span className="market-description">{market.description}</span>
      </span>
      <span className="market-odds">
        <strong>{market.payout}:1</strong>
        <span>pays</span>
      </span>
      {selected && <span className="selected-check" aria-label="Selected">✓</span>}
    </button>
  );
}

export default function SicBoGame() {
  const live = useMultiplayerGame<DiceOutcome>("sic-bo");
  const balance = live.state?.balance ?? 0;
  const [stake, setStake] = useState(25);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [history, setHistory] = useState<RoundResult[]>([]);
  const [notice, setNotice] = useState("");
  const [mobileTab, setMobileTab] = useState<"table" | "bet">("table");
  const seen = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const round = live.state?.round.roundNo ?? 0;
  const phase: Phase = live.state?.round.phase === "running" ? "rolling" : live.state?.round.phase ?? "betting";
  const seconds = Math.max(0, Math.ceil(((live.state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const dice: DiceRoll = live.state?.round.result?.dice ?? live.state?.history[0]?.result.dice ?? [2, 4, 5];
  const current = live.state?.myBets.filter(b => b.status !== "cancelled") ?? [];
  const queued = live.state?.myQueuedBets.filter(b => b.status === "pending") ?? [];
  const first = current.find(b => b.status === "pending");
  const activeBet = first ? { market: MARKETS.find(m => m.id === first.option)!, stake: first.amount } : null;
  const lastResult = phase === "result" ? history.find(h => h.round === round) ?? null : null;
  const locked = live.busy || !live.state;
  const chosenMarket = selectedMarket ?? activeBet?.market;
  const currentStake = stake;
  const estimatedReturn = chosenMarket ? currentStake * (chosenMarket.payout + 1) : 0;

  useEffect(() => {
    const result = live.state?.round.result;
    if (!result) return;
    const personal = live.state?.myBets ?? [];
    const timer = setTimeout(() => {
      const rows: RoundResult[] = [];
      for (const bet of personal) {
        if (bet.poolPending || bet.status === "pending" || bet.status === "cancelled" || bet.amount <= 0 || seen.current.has(bet.id)) continue;
        seen.current.add(bet.id);
        rows.push({ round: bet.roundNo, dice: result.dice, market: MARKETS.find(m => m.id === bet.option)?.label ?? bet.option,
          stake: bet.amount, win: bet.status === "win", profit: bet.payout - bet.amount });
      }
      if (rows.length) {
        setHistory(h => [...rows, ...h].slice(0, 20));
        if (rows.some(r => r.win)) gameSfx.win(); else gameSfx.lose();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [live.state]);

  function selectMarket(market: Market) { setSelectedMarket(market); setNotice(""); }
  async function placeBet() {
    if (!selectedMarket || locked) return;
    if (!Number.isInteger(stake) || stake < 10 || stake > balance) { setNotice("Minimum bet is Rs. 10. Enter a whole-number stake within your balance."); return; }
    const reply = await live.place(selectedMarket.id, stake);
    if (mounted.current && !("error" in reply)) { gameSfx.chip(); setNotice(reply.queued ? "Bet accepted for the next shared round." : "Bet accepted for this shared round."); }
  }
  function cancelBet() { if (first && phase === "betting") void live.cancel(round, first.id); }
  function resetSession() { void live.refresh(); }

  return (
    <div className="sic-bo-game">
    <div className="px-2 py-1 shrink-0"><LiveMultiplayerBets state={live.state} error={live.error} />{queued.length > 0 && <button type="button" disabled={live.busy} onClick={() => void live.cancel(round + 1)}>Cancel next-round bets</button>}</div>
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand-lockup" href="#game" aria-label="Fortune House Sic Bo home">
            <BrandMark />
            <span className="brand-copy">
              <strong>FORTUNE <i>HOUSE</i></strong>
              <small>THE DICE ROOM</small>
            </span>
          </a>
          <nav className="top-nav" aria-label="Main navigation">
            <span className="nav-item">CASINO</span>
            <span className="nav-item nav-active">SIC BO</span>
            <span className="nav-item">TABLE GAMES</span>
          </nav>
          <div className="topbar-actions">
            <span className="demo-badge"><span /> LIVE TABLE</span>
            <div className="wallet-summary">
              <span className="wallet-caption">BALANCE</span>
              <strong><span className="coin-glyph">G</span>Rs. {formatCoins(balance)} <small></small></strong>
            </div>
            <button className="reset-session" type="button" onClick={resetSession} disabled={phase === "rolling"} title="Refresh live table" aria-label="Refresh live table">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.93-3M4 4v4h4M4 13a8 8 0 0 0 14.93 3M20 20v-4h-4" /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="page-container" id="game">
        <section className="page-intro">
          <div>
            <div className="breadcrumb"><span>CASINO</span><span className="breadcrumb-slash">/</span><span>TABLE GAMES</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">SIC BO</span></div>
            <div className="title-row">
              <h1>Sic Bo</h1>
              <span className="live-tag"><span /> TABLE NO. 07</span>
            </div>
            <p className="page-description">Three dice. Your call. A classic game of chance, made for the moment.</p>
          </div>
          <div className="intro-highlight">
            <div className="highlight-icon">Ⅲ</div>
            <div><span>THREE DICE</span><strong>ONE BIG MOMENT</strong></div>
          </div>
        </section>

        <div className="flex lg:hidden items-center justify-center gap-2 mb-2 w-full px-1">
          <button
            type="button"
            onClick={() => setMobileTab("table")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              mobileTab === "table"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Table & Dice
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("bet")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              mobileTab === "bet"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Bet Slip {chosenMarket ? `(${chosenMarket.label})` : ""}
          </button>
        </div>

        <div className="game-layout">
          <section className={`table-column ${mobileTab === "table" ? "block" : "hidden lg:block"}`} aria-label="Sic Bo game table">
            <div className="table-shell">
              <div className="table-toolbar">
                <div className="table-name-lockup">
                  <span className="table-seal">Ⅲ</span>
                  <span><strong>THE GRAND TABLE</strong><small>CLASSIC SIC BO</small></span>
                </div>
                <div className="table-status"><span className={`status-light${phase === "rolling" ? " status-rolling" : ""}`} />{phase === "rolling" ? "DICE IN PLAY · BET NEXT" : phase === "result" ? "RESULT · BET NEXT" : `BETS OPEN · ${seconds}s`}</div>
                <div className="table-round"><span>ROUND</span><strong>{String(round).padStart(4, "0")}</strong></div>
              </div>

              <div className="felt-table">
                <div className="felt-decoration felt-decoration-left" aria-hidden="true">✦</div>
                <div className="felt-decoration felt-decoration-right" aria-hidden="true">✦</div>
                <div className="felt-inner">
                  <div className="felt-overline"><span /> FORTUNE FAVOURS THE BOLD <span /></div>
                  <div className="dice-stage">
                    {dice.map((value, index) => <DiceFace key={index} value={value} rolling={phase === "rolling"} />)}
                  </div>
                  <div className={`roll-announcement${lastResult && phase === "result" ? lastResult.win ? " announcement-win" : " announcement-loss" : ""}`} aria-live="polite">
                    {phase === "rolling" ? <><span className="announcement-dot" /> THE DICE ARE ROLLING</> : lastResult && phase === "result" ? lastResult.win ? <>LUCK IS ON YOUR SIDE <span>+Rs. {formatCoins(lastResult.profit)}</span></>
 : <>No win</> : <>PLACE YOUR BETS <span>·</span> TRUST YOUR INSTINCT</>}
                  </div>

                  <div className="board-section-heading"><span>CHOOSE YOUR OUTCOME</span><span className="board-section-note">SELECT ONE BETTING AREA</span></div>
                  <div className="high-low-grid">
                    <MarketButton market={MARKETS[0]} selected={chosenMarket?.id === "small"} locked={locked} onSelect={(m) => { selectMarket(m); }} />
                    <MarketButton market={MARKETS[1]} selected={chosenMarket?.id === "big"} locked={locked} onSelect={(m) => { selectMarket(m); }} />
                  </div>

                  <div className="totals-heading"><span className="heading-line" /><span>OR BET ON THE TOTAL</span><span className="heading-line" /></div>
                  <div className="total-grid">
                    {TOTALS.map((total) => {
                      const market = MARKETS.find((entry) => entry.id === `total-${total}`)!;
                      return (
                        <button
                          className={`total-bet${chosenMarket?.id === market.id ? " total-selected" : ""}${locked ? " total-locked" : ""}`}
                          type="button"
                          key={total}
                          onClick={() => { selectMarket(market); }}
                          disabled={locked}
                          aria-pressed={chosenMarket?.id === market.id}
                          aria-label={`Bet on total ${total}, pays ${market.payout} to 1`}
                        >
                          <span className="total-number">{total}</span>
                          <span className="total-payout">{market.payout}:1</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="special-market-wrap">
                    <MarketButton market={MARKETS[2]} selected={chosenMarket?.id === "triple"} locked={locked} onSelect={(m) => { selectMarket(m); }} />
                  </div>
                  <div className="table-legend"><span><i className="legend-dot legend-gold" />Payout odds shown</span><span><i className="legend-dot legend-ivory" />Demo Rs. only</span><span>Min bet <b>Rs. 1</b></span></div>
                </div>
              </div>
              <div className="table-bottom-bar"><span>FORTUNE HOUSE <i>·</i> SIC BO</span><span>THREE DICE · 216 POSSIBLE COMBINATIONS</span><span className="table-bottom-mark">FH <b>✦</b></span></div>
            </div>

            <div className="lg:hidden flex items-center justify-between gap-2 p-2 bg-slate-900/90 border border-amber-500/30 rounded-lg mt-2">
              <div className="text-xs">
                <span className="text-amber-400 font-bold">{chosenMarket ? chosenMarket.label : "Choose bet above"}</span>
                <span className="text-slate-400 text-[11px] ml-1">· Stake: {stake}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab("bet")}
                className="py-1 px-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs rounded-md shadow-md"
              >
                {activeBet ? "ROLL DICE ↗" : "PLACE BET ↗"}
              </button>
            </div>

            <div className="under-table-note"><span className="info-mark">i</span><span><strong>New to Sic Bo?</strong> Pick a betting area, choose your stake, then roll. Big and Small win on sums 11–17 or 4–10; triples are excluded.</span></div>
          </section>

          <aside className={`side-column ${mobileTab === "bet" ? "block" : "hidden lg:block"}`} aria-label="Bet controls and recent rounds">
            <section className="bet-panel">
              <div className="panel-heading">
                <div><span className="panel-overline">YOUR PLAY</span><h2>Bet slip</h2></div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileTab("table")}
                    className="lg:hidden text-xs text-amber-400 underline font-semibold"
                  >
                    ← Table
                  </button>
                  <span className="slip-round">#{String(round).padStart(4, "0")}</span>
                </div>
              </div>

              {lastResult && phase === "result" && (
                <div className={`result-summary${lastResult.win ? " summary-win" : " summary-loss"}`}>
                  <span className="result-summary-icon">{lastResult.win ? "✓" : "×"}</span>
                  <span><strong>{lastResult.win ? "YOU WON" : "No win"}</strong><small>{lastResult.market} · {formatCoins(lastResult.stake)} stake</small></span>
                  {lastResult.win && <b>+{formatCoins(lastResult.profit)}</b>}
                </div>
              )}

              <div className="stake-label-row"><label htmlFor="stake-input">YOUR STAKE</label><span>Rs.</span></div>
              <div className="stake-input-wrap">
                <span className="stake-coin">G</span>
                <input id="stake-input" type="number" min="1" step="1" max={balance} value={stake} disabled={locked} onChange={(event) => { setStake(Number(event.target.value)); setNotice(""); }}                 aria-label="Stake amount in Rs." />
                                <span className="stake-unit">Rs.</span>
              </div>
              <div className="chip-row" aria-label="Choose a chip value">
                {CHIP_VALUES.map((value, index) => (
                  <button className={`chip-option chip-tone-${index % 4}${stake === value ? " chip-active" : ""}`} type="button" key={value} onClick={() => { if (!locked) { setStake(value); setNotice(""); } }} disabled={locked} aria-pressed={stake === value}>
                    <span className="chip-coin" aria-hidden="true" /><span>{value}</span>
                  </button>
                ))}
              </div>

              <div className="slip-divider"><span>BET DETAILS</span><i /></div>
              <div className="chosen-bet-box">
                {chosenMarket ? <>
                  <span className="chosen-icon">{chosenMarket.id === "triple" ? "Ⅲ" : chosenMarket.id.startsWith("total-") ? chosenMarket.id.replace("total-", "") : chosenMarket.label.slice(0, 1)}</span>
                  <span className="chosen-market-copy"><small>SELECTED BET</small><strong>{chosenMarket.label}</strong><em>{chosenMarket.payout}:1 payout</em></span>
                  <button className="clear-bet" type="button" onClick={() => { if (!locked) { setSelectedMarket(null); setNotice(""); } }} disabled={locked} aria-label="Clear selected bet">×</button>
                </> : <div className="empty-selection"><span className="empty-crosshair">＋</span><span><strong>No bet selected</strong><small>Tap an area on the table to begin.</small></span></div>}
              </div>

              <div className="payout-line"><span>Potential return</span><strong>{chosenMarket && currentStake > 0 ? `Rs. ${formatCoins(estimatedReturn)}` : "—"}</strong></div>
              <div className="payout-subline">Includes your stake · server settles all bets</div>

              {notice && <p className="form-notice" role="status">{notice}</p>}
              <button className="primary-action" type="button" onClick={() => void placeBet()} disabled={locked || !selectedMarket || !Number.isInteger(stake) || stake < 10 || stake > balance}>
                {phase === "betting" ? "PLACE BET" : "BET NEXT ROUND"} · Rs. {formatCoins(stake || 0)}
              </button>
              {activeBet && phase === "betting" && <button className="cancel-action" type="button" disabled={live.busy} onClick={cancelBet}>Cancel bet and return stake</button>}
              <div className="balance-foot"><span>Available balance</span><strong><span className="mini-coin">G</span>Rs. {formatCoins(balance)}</strong></div>
            </section>

            <section className="fair-play-card">
              <div className="fair-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.1c0 4.6 3.2 8.4 7.5 9.9 4.3-1.5 7.5-5.3 7.5-9.9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg></div>
              <div className="fair-copy"><strong>SHARED LIVE TABLE</strong><span>All players see the same dice. Bets and payouts are settled by the server.</span></div>
            </section>

            <section className="history-panel">
              <div className="history-heading"><div><span className="panel-overline">TABLE ACTIVITY</span><h2>Recent rounds</h2></div><span className="history-count">{history.length ? String(history.length).padStart(2, "0") : "—"}</span></div>
              {history.length ? <div className="history-list">
                {history.slice(0, 5).map((item) => <div className="history-row" key={`${item.round}-${item.market}`}>
                  <span className="history-result-icon">{item.win ? "✓" : "×"}</span>
                  <span className="history-detail"><strong>Round {String(item.round).padStart(4, "0")}</strong><small>{item.market} · {item.dice.join("–")}</small></span>
                  <span className={`history-profit${item.win ? " profit-win" : " profit-loss"}`}>{item.win ? `+${formatCoins(item.profit)}` : "No win"}</span>
                </div>)}
              </div> : <div className="history-empty"><span className="history-empty-icon">◷</span><strong>No rounds yet</strong><small>Your settled bets will appear here.</small></div>}
              <div className="history-footer"><span>SESSION HISTORY</span><button type="button" onClick={resetSession} disabled={phase === "rolling"}>REFRESH LIVE TABLE <span>↗</span></button></div>
            </section>
          </aside>
        </div>

        <footer className="page-footer"><span>FORTUNE HOUSE <i>·</i> A SIC BO DEMO EXPERIENCE</span><span>NO PURCHASE NECESSARY <i>·</i> VIRTUAL COINS ONLY</span><span>PLAY RESPONSIBLY</span></footer>
      </div>
    </main>
    </div>
  );
}
