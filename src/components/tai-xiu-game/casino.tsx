"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { DiceOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import "./tai-xiu.css";
import { ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown, ChevronRight, CircleCheck, Coffee, Dices, Headphones, Heart, History, Info, LayoutGrid, LockKeyhole, Maximize2, Menu, Minus, Plus, ShieldCheck, Sparkles, Square, Star, TrendingUp, Trophy, Volume2, VolumeX, X, Zap } from "lucide-react";
import { Brand, Coin, DiceFace } from "./game-ui";
import CasinoDialogs from "./casino-dialogs";
import { DEFAULT_SESSION, money, roundMoney, sideName, type Bet, type DialogName, type Round, type Session, type Side } from "./lib/taixiu";

type ActivityRow = { id: string; name: string; initials: string; color: string; prediction: Side; stake: number; dice: [number, number, number]; won: boolean; profit: number; bet?: Bet };

function SessionChart({ bets }: { bets: Bet[] }) {
  const values = [0];
  [...bets].reverse().slice(-20).forEach((bet) => values.push(values[values.length - 1] + bet.payout - bet.stake));
  if (values.length === 1) values.push(0, 0, 0, 0, 0, 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 260},${61 - ((value - min) / (max - min)) * 49}`);
  const line = `M ${points.join(" L ")}`;
  return <svg className="session-chart" viewBox="0 0 260 75" preserveAspectRatio="none" role="img" aria-label={bets.length ? "Net profit over your recent bets" : "Your session graph will begin with your first bet"}><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dcb76d" stopOpacity=".18" /><stop offset="100%" stopColor="#dcb76d" stopOpacity="0" /></linearGradient></defs><path d="M 0 18 H 260 M 0 42 H 260 M 0 66 H 260" stroke="#ffffff" strokeOpacity=".045" strokeDasharray="3 5" /><path d={`${line} L 260 75 L 0 75 Z`} fill="url(#chart-fill)" /><path d={line} fill="none" stroke="#c6a566" strokeWidth="1.8" strokeLinejoin="round" />{bets.length === 0 && <><circle cx="130" cy="61" r="4" fill="#d8b46e" /><circle cx="130" cy="61" r="8" fill="#d8b46e" fillOpacity=".12" /></>}</svg>;
}

export default function Casino() {
  const live = useMultiplayerGame<DiceOutcome>("tai-xiu");
  const [preferences, setPreferences] = useState<Session>({ ...DEFAULT_SESSION, balance: 0, bets: [] });
  const [personalBets, setPersonalBets] = useState<Bet[]>([]);
  const walletBalance = live.state?.balance ?? 0;
  const session: Session = { ...preferences, balance: walletBalance, bets: personalBets };
  const setSession: React.Dispatch<React.SetStateAction<Session>> = (update) => {
    const next = typeof update === "function" ? update(session) : update;
    setPreferences(p => ({ ...p, playerName: next.playerName, favorite: next.favorite, sound: next.sound, breakUntil: next.breakUntil }));
  };
  const hydrated = !!live.state;
  const [side, setSide] = useState<Side>("tai");
  const [amount, setAmount] = useState("100");
  const [mode, updateMode] = useState<"manual" | "auto">("manual");
  const [autoRounds, setAutoRounds] = useState(5);
  const [roundsLeft, setRoundsLeft] = useState(0);
  function setMode(next: "manual" | "auto") { setRoundsLeft(0); updateMode(next); }
  const running = live.busy;
  const rolling = live.state?.round.phase === "running";
  const [modal, setModal] = useState<DialogName>(null);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [activityTab, setActivityTab] = useState<"all" | "mine">("all");
  const [historyLimit, setHistoryLimit] = useState(5);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const tableRef = useRef<HTMLElement>(null);
  const activityRef = useRef<HTMLElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const seen = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const autoRound = useRef(0);
  const now = live.now;
  const roundNo = live.state?.round.roundNo ?? 0;
  const seconds = Math.max(0, Math.ceil(((live.state?.round.bettingEndsAt ?? now) - now) / 1000));
  const result = live.state?.round.result;
  const settled = personalBets.find(b => b.id.startsWith(`${roundNo}:`));
  const outcome: Bet | null = result ? settled ?? { ...result, id: String(roundNo), createdAt: "", prediction: side, won: false, stake: 0, payout: 0 } : null;
  const queued = live.state?.myQueuedBets.filter(b => b.status === "pending") ?? [];
  const cancellable = live.state?.myBets.filter(b => b.status === "pending") ?? [];
  const notify = (message: string) => setToast({ message, id: Date.now() });
  const openModal = (name: DialogName) => { setModal(name); setMobileOpen(false); };
  const viewHistory = () => { setActivityTab("mine"); setModal(null); setMobileOpen(false); activityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  const stake = Number(amount) || 0;
  const onBreak = session.breakUntil > now && now > 0;
  const breakSeconds = Math.max(0, Math.ceil((session.breakUntil - now) / 1000));
  const netProfit = personalBets.reduce((sum, bet) => sum + bet.payout - bet.stake, 0);
  const wins = personalBets.filter(b => b.won).length;
  const recentRounds: Round[] = [...(live.state?.history ?? [])].reverse().map(h => ({ ...h.result, id: String(h.roundNo), createdAt: "" }));
  const ownActivity: ActivityRow[] = personalBets.map(bet => ({ id: bet.id, name: "You", initials: "YO", color: "gold",
    prediction: bet.prediction, stake: bet.stake, dice: bet.dice, won: bet.won, profit: bet.payout - bet.stake, bet }));
  const activity: ActivityRow[] = activityTab === "mine" ? ownActivity.slice(0, historyLimit) : (live.state?.bets ?? [])
    .filter(b => !b.poolPending && (b.status === "win" || b.status === "lose") && result)
    .map(b => ({ id: b.id, name: b.name, initials: b.name.slice(0, 2), color: "gold", prediction: b.option as Side,
      stake: b.amount, dice: result!.dice, won: b.status === "win", profit: b.payout - b.amount, bet: b.mine ? personalBets.find(p => p.id === `${b.roundNo}:${b.id}`) : undefined }));
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => { void audioRef.current?.close(); }, []);
  useEffect(() => {
    const result = live.state?.round.result;
    if (!result) return;
    const personal = live.state?.myBets ?? [];
    const timer = setTimeout(() => {
      const rows: Bet[] = [];
      for (const bet of personal) {
        if (bet.poolPending || (bet.status !== "win" && bet.status !== "lose") || bet.amount <= 0 || seen.current.has(bet.id)) continue;
        seen.current.add(bet.id);
        rows.push({ ...result, id: `${bet.roundNo}:${bet.id}`, createdAt: "", prediction: bet.option as Side, stake: bet.amount,
          payout: bet.payout, won: bet.status === "win" });
      }
      if (rows.length) { setPersonalBets(b => [...rows, ...b].slice(0, 100)); setNotificationsRead(false); }
    }, 0);
    return () => clearTimeout(timer);
  }, [live.state]);
  useEffect(() => {
    if (mode !== "auto" || !live.state || live.state.round.phase !== "betting" || live.now >= live.state.round.bettingEndsAt - 500 ||
      roundsLeft <= 0 || running || onBreak || autoRound.current === roundNo) return;
    autoRound.current = roundNo;
    void live.place(side, stake).then(reply => {
      if (!mounted.current) return;
      if ("error" in reply) setRoundsLeft(0); else setRoundsLeft(n => Math.max(0, n - 1));
    });
  }, [mode, live.state, live.now, live.place, roundsLeft, running, onBreak, roundNo, side, stake]);

  function playSound(kind: "roll" | "win" | "loss" | "click", enabled = session.sound) {
    if (!enabled) return;
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      void context.resume();
      const frequencies = kind === "win" ? [523, 659, 784] : kind === "roll" ? [190, 240, 180, 280] : kind === "loss" ? [260, 220] : [440];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * .11;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.065, start + .015);
        gain.gain.exponentialRampToValueAtTime(.001, start + .16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .18);
      });
    } catch { /* Sound is an optional enhancement. */ }
  }

  function updateAmount(value: number) {
    if (running) return;
    setAmount(String(roundMoney(Math.max(1, value))));
  }

  async function placeBet() {
    if (running || onBreak) return;
    if (!Number.isFinite(stake) || stake < 10 || Math.abs(roundMoney(stake) - stake) > .000001 || stake > walletBalance) {
      notify("Enter a valid stake within your available balance."); return;
    }
    const reply = await live.place(side, stake);
    if (!mounted.current) return;
    if (!("error" in reply)) {
      autoRound.current = reply.roundNo;
      if (mode === "auto") setRoundsLeft(autoRounds - 1);
      playSound("click");
      notify(reply.queued ? "Bet reserved for the next shared round." : "Bet accepted for this shared round.");
    }
  }

  const toggleSound = () => {
    const enabled = !session.sound;
    setSession((previous) => ({ ...previous, sound: enabled }));
    playSound("click", enabled);
    notify(enabled ? "Table sounds on." : "Table sounds muted.");
  };

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (tableRef.current?.requestFullscreen) await tableRef.current.requestFullscreen();
      else notify("Full screen is not supported in this browser.");
    } catch { notify("Full screen is unavailable in this preview."); }
  }

  function showRound(round: Round) { setSelectedRound(round); setModal("round"); }

  return <div className="casino-app">

    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Main navigation">
      <button className="brand-button" onClick={() => openModal("lobby")} aria-label="Tai Xiu game lobby"><Brand /></button>
      <div className="sidebar-body"><p className="nav-section-label">LET’S PLAY</p><nav className="nav-group">
        <button className="nav-item" onClick={() => openModal("lobby")}><LayoutGrid size={19} /><span>Game lobby</span></button>
        <button className="nav-item active" onClick={() => { setMobileOpen(false); tableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} aria-current="page"><Dices size={20} /><span>Tai Xiu</span><span className="nav-active-dot" /></button>
        <button className={`nav-item ${activityTab === "mine" ? "sub-active" : ""}`} onClick={viewHistory}><History size={19} /><span>My bets</span></button>
        <button className="nav-item" onClick={() => openModal("leaderboard")}><Trophy size={19} /><span>Leaderboard</span></button>
      </nav><div className="nav-divider" /><p className="nav-section-label">A LITTLE MORE</p><nav className="nav-group">
        <button className="nav-item" onClick={() => openModal("favorites")}><Heart size={19} /><span>Favorites</span>{session.favorite && <span className="nav-count">1</span>}</button>
        <button className="nav-item" onClick={() => openModal("rules")}><BookOpen size={19} /><span>How to play</span></button>
        <button className="nav-item" onClick={() => openModal("fairness")}><ShieldCheck size={19} /><span>Fair play</span></button>
      </nav></div>
      <div className="sidebar-bottom"><div className="play-responsibly"><span className="responsible-icon"><ShieldCheck size={21} /></span><h3>All the thrill.<br />None of the risk.</h3><p>A little luck. A lot of fun.<br />Always play responsibly.</p><button onClick={() => openModal("responsible")}>Keep it a good time <ArrowUpRight size={14} /></button><span className="card-orbit orbit-one" /><span className="card-orbit orbit-two" /></div><button className="support-link" onClick={() => openModal("support")}><Headphones size={18} /><span>Need a hand?</span><ArrowUpRight size={15} /></button><div className="sidebar-footnote"><span className="age-badge">18+</span><span>Play for the experience.</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={22} /></button><div className="breadcrumbs"><LayoutGrid size={16} /><button onClick={() => openModal("lobby")}>Casino</button><ChevronRight size={13} /><span>Originals</span></div><div className="mobile-brand"><Brand compact /></div></div><div className="topbar-right"><span className="demo-pill"><span className="status-dot" /> Live table</span><button className="wallet-chip" onClick={() => openModal("wallet")} aria-label={`Open wallet, balance ${money(session.balance)} practice coins`}><Coin /><strong>{money(session.balance)}</strong><span className="wallet-plus"><Plus size={16} /></span></button><span className="header-divider" /><button className="icon-button notification-button" aria-label="Open notifications" onClick={() => { setNotificationsRead(true); openModal("notifications"); }}><Bell size={19} />{!notificationsRead && <i />}</button><button className="player-button" onClick={() => openModal("profile")} aria-label="Edit player profile"><span className="profile-avatar">{session.playerName.charAt(0).toUpperCase()}</span><ChevronDown size={14} /></button></div></header>

      <main className="main-content">
        <LiveMultiplayerBets state={live.state} error={live.error} />{queued.length > 0 && <button type="button" disabled={running} onClick={() => void live.cancel(roundNo + 1)}>Cancel next-round bets</button>}{cancellable.length > 0 && live.state?.round.phase === "betting" && <button type="button" disabled={running} onClick={() => void live.cancel(roundNo)}>Cancel current bets</button>}<section className="page-heading"><div><div className="title-line"><h1>Tai Xiu</h1><span className="originals-badge"><Sparkles size={11} /> ORIGINALS</span></div><p>Three dice. Two sides. One bold move.</p></div><div className="heading-actions"><button className="secondary-button how-to-button" onClick={() => openModal("rules")}><BookOpen size={16} /> How to play</button><button className={`icon-button favorite-button ${session.favorite ? "is-favorite" : ""}`} aria-label={session.favorite ? "Remove Tai Xiu from favorites" : "Add Tai Xiu to favorites"} aria-pressed={session.favorite} onClick={() => { setSession((previous) => ({ ...previous, favorite: !previous.favorite })); notify(session.favorite ? "Tai Xiu removed from favorites." : "Tai Xiu added to your favorites."); }}><Star size={18} fill={session.favorite ? "currentColor" : "none"} /></button></div></section>

        {onBreak && <div className="break-banner"><Coffee size={18} /><span>Your table is taking a breather. <b>{Math.floor(breakSeconds / 60)}:{String(breakSeconds % 60).padStart(2, "0")}</b> remaining.</span><button className="text-link" onClick={() => openModal("responsible")}>Manage break <ArrowRight size={14} /></button></div>}

        <div className="game-layout">
          <section className={`game-panel ${rolling ? "is-rolling" : ""}`} id="game-table" ref={tableRef} aria-label="Tai Xiu game table">
            <div className="game-table-inner"><div className="table-toolbar"><span className="round-number"><Dices size={15} /> ROUND <b>#{roundNo}</b></span><span className="round-status"><span className={`status-dot ${rolling ? "pulsing" : ""}`} />{rolling ? "Dice in motion" : outcome ? "Round complete" : `Bets open · ${seconds}s`}</span></div>
              <div className="table-headline"><span /> PICK A SIDE. MAKE IT YOURS. <span /></div>
              <div className="arena-stage">
                <button className={`side-choice tai-choice ${side === "tai" ? "selected" : ""} ${outcome?.side === "tai" ? "winning-side" : ""}`} aria-label="Choose Tài, big, dice total 11 to 17" aria-pressed={side === "tai"} disabled={running} onClick={() => { setSide("tai"); playSound("click"); }}><span className="choice-eyebrow">GO BIG</span><strong>TÀI</strong><span className="choice-range">11 — 17</span><span className="choice-payout">2× payout</span><span className="choice-select">{side === "tai" ? <><span className="choice-check"><Check size={10} strokeWidth={3} /></span> Selected</> : <>Choose Tài <ArrowRight size={12} /></>}</span></button>
                <div className={`table-art ${rolling ? "art-rolling" : ""} ${outcome ? "art-revealed" : ""}`}><div className="art-orbit orbit-outer" /><div className="art-orbit orbit-inner" /><span className="table-spark spark-one">✦</span><span className="table-spark spark-two">✧</span><span className="table-spark spark-three">✧</span>{!outcome ? <Image className="hero-dice" src="/images/dice-table.png" alt="Three ivory and gold dice on a bronze casino table" width={640} height={640} priority draggable={false} sizes="(max-width: 600px) 240px, 400px" /> : <div className={`revealed-scene ${outcome.won ? "is-win" : ""}`}><div className="reveal-glow" /><div className="revealed-dice">{outcome.dice.map((die, index) => <DiceFace key={`${outcome.id}-${index}`} value={die} className={`result-die result-die-${index}`} />)}</div><div className="reveal-platform" />{outcome.won && <div className="win-sparkles"><Sparkles size={20} /><Sparkles size={14} /><Sparkles size={18} /></div>}</div>}<div className="art-caption" aria-live="polite">{rolling ? <><span className="rolling-label">A little suspense…</span><span>THE DICE ARE ROLLING</span></> : outcome ? <><strong className={outcome.won ? "win-text" : ""}>{outcome.total} <span className="caption-dot">·</span> {sideName(outcome.side)} wins</strong><span className={outcome.won ? "win-text" : ""}>                {outcome.stake === 0 ? "Spectating — no bet placed" : outcome.won ? `NICE CALL! +${money(outcome.stake)} COINS` : `THIS ROUND: −${money(outcome.stake)} COINS`}</span></> : <><span className="art-caption-main">A little instinct. A little luck.</span><span>WHAT’S YOUR NEXT MOVE?</span></>}</div></div>
                <button className={`side-choice xiu-choice ${side === "xiu" ? "selected" : ""} ${outcome?.side === "xiu" ? "winning-side" : ""}`} aria-label="Choose Xỉu, small, dice total 4 to 10" aria-pressed={side === "xiu"} disabled={running} onClick={() => { setSide("xiu"); playSound("click"); }}><span className="choice-eyebrow">STAY SMALL</span><strong>XỈU</strong><span className="choice-range">4 — 10</span><span className="choice-payout">2× payout</span><span className="choice-select">{side === "xiu" ? <><span className="choice-check"><Check size={10} strokeWidth={3} /></span> Selected</> : <>Choose Xỉu <ArrowRight size={12} /></>}</span></button>
              </div>
              <div className="game-bottom-line"><button className="transparent-link" onClick={() => openModal("fairness")}><ShieldCheck size={14} /><span>Transparent by design</span><Info size={12} /></button><div className="table-utilities"><button className="icon-button" aria-label={session.sound ? "Mute table sounds" : "Enable table sounds"} aria-pressed={session.sound} onClick={toggleSound}>{session.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button className="icon-button" aria-label="Toggle full screen table" onClick={toggleFullscreen}><Maximize2 size={16} /></button></div></div>
            </div>
            <div className="recent-strip"><div className="recent-heading"><h3>Recent rounds <span>Last 20</span></h3><div className="round-legend"><span><i className="tai-dot" /> Tài</span><span><i className="xiu-dot" /> Xỉu</span></div></div><div className="round-trail">{recentRounds.map((round, index) => <button key={round.id} className={`round-dot ${round.side} ${index === recentRounds.length - 1 ? "latest" : ""}`} onClick={() => showRound(round)} aria-label={`Round ${round.id}: ${sideName(round.side)}, total ${round.total}. View details.`}>{round.side === "tai" ? "T" : "X"}</button>)}</div><div className="recent-footnote"><span>Every roll tells a different story.</span><span>Latest <ArrowRight size={11} /></span></div></div>
          </section>

          <aside className="bet-panel" aria-label="Betting controls"><div className="bet-heading"><h2>Place your bet</h2><button className="subtle-icon" aria-label="Learn about betting" onClick={() => openModal("rules")}><Info size={17} /></button></div><div className="mode-tabs" role="tablist" aria-label="Bet mode"><button role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "selected" : ""} disabled={running} onClick={() => setMode("manual")}>Manual bet</button><button role="tab" aria-selected={mode === "auto"} className={mode === "auto" ? "selected" : ""} disabled={running} onClick={() => setMode("auto")}><Zap size={13} /> Auto bet</button></div>
            <form onSubmit={(event) => { event.preventDefault(); void placeBet(); }}><div className="amount-label"><label htmlFor="bet-amount">Bet amount</label><span>Min. 1.00</span></div><div className={`amount-input ${stake > session.balance ? "input-warning" : ""}`}><Coin /><input id="bet-amount" aria-label="Bet amount in virtual coins" inputMode="decimal" autoComplete="off" value={amount} disabled={running} onChange={(event) => { if (/^\d{0,7}(\.\d{0,2})?$/.test(event.target.value)) setAmount(event.target.value); }} onBlur={() => { if (amount && Number.isFinite(Number(amount))) setAmount(String(roundMoney(Number(amount)))); }} /><span className="input-currency">Rs.</span><div className="amount-steppers"><button type="button" aria-label="Decrease bet by 25 coins" disabled={running} onClick={() => updateAmount(stake - 25)}><Minus size={13} /></button><button type="button" aria-label="Increase bet by 25 coins" disabled={running} onClick={() => updateAmount(stake + 25)}><Plus size={13} /></button></div></div><div className="quick-bets" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>{BET_PRESETS.map((preset) => <button type="button" key={preset} disabled={running} className={stake === preset ? "active" : ""} onClick={() => updateAmount(preset)}>{preset}</button>)}</div><div className="quick-bets"><button type="button" disabled={running} onClick={() => updateAmount(stake / 2)}>½</button><button type="button" disabled={running} onClick={() => updateAmount(stake * 2)}>2×</button><button type="button" disabled={running} onClick={() => updateAmount(stake + 100)}>+100</button><button type="button" disabled={running || session.balance < 1} onClick={() => updateAmount(session.balance)}>Max</button></div>
              {mode === "auto" && <div className="auto-settings"><label htmlFor="auto-rounds">Number of rounds</label><select id="auto-rounds" value={autoRounds} disabled={running} onChange={(event) => setAutoRounds(Number(event.target.value))}><option value={3}>3 rounds</option><option value={5}>5 rounds</option><option value={10}>10 rounds</option></select></div>}
              <div className="prediction-summary"><span>Your prediction</span><span className={`side-pill ${side}`}>{sideName(side)} <span>·</span> {side === "tai" ? "11–17" : "4–10"}</span></div><div className="payout-preview"><div><span>Potential payout <span className="payout-multiplier">2.00×</span></span><strong><Coin />{money(Math.min(stake, 1000000) * 2)}</strong></div><div className="profit-label">Profit <span>+{money(Math.min(stake, 1000000))}</span></div></div>
              {roundsLeft > 0 && mode === "auto" ? <button type="button" className="primary-button place-bet-button stop-button" onClick={() => { setRoundsLeft(0); notify("Future auto bets stopped. Accepted wagers stay on the table."); }}><Square size={15} /> Stop auto bet <span>{roundsLeft} left</span></button> : <button type="submit" className={`primary-button place-bet-button ${rolling ? "button-rolling" : ""}`} disabled={!hydrated || running || onBreak}><Dices size={19} /><span>{onBreak ? "Table on a break" : live.state?.round.phase !== "betting" ? "Bet next round" : mode === "auto" ? "Start auto bet" : outcome ? "Place another bet" : "Place bet"}</span>{!rolling && !onBreak && <ArrowRight size={18} />}</button>}<p className="bet-disclaimer"><LockKeyhole size={11} />Virtual coins. Real excitement.</p>
            </form><div className="odds-footer"><div className="odds-heading"><span>Know your odds</span><button className="subtle-icon" aria-label="Read how the shared results work works" onClick={() => openModal("fairness")}><Info size={13} /></button></div><div className="probability-bar"><span /></div><div className="odds-labels"><span><i /> Shared dice</span><span><i /> Server settled</span></div></div>
          </aside>
        </div>

        <div className="activity-layout"><section className="activity-panel" ref={activityRef} aria-label="Bet history"><div className="activity-heading"><div className="activity-tabs" role="tablist" aria-label="Bet history filter"><button role="tab" aria-selected={activityTab === "all"} className={activityTab === "all" ? "selected" : ""} onClick={() => setActivityTab("all")}>All bets</button><button role="tab" aria-selected={activityTab === "mine"} className={activityTab === "mine" ? "selected" : ""} onClick={() => setActivityTab("mine")}>My bets{session.bets.length > 0 && <span>{session.bets.length}</span>}</button></div><span className="activity-indicator"><span className="status-dot" />{activityTab === "all" ? "Real player bets" : "Your settled bets"}</span></div>
            {activity.length ? <div className="table-scroll"><table className="activity-table"><thead><tr><th>Player</th><th>Prediction</th><th>Bet amount</th><th>Result</th><th>Profit</th></tr></thead><tbody>{activity.map((row) => <tr key={row.id}><td><div className="player-cell"><span className={`player-avatar ${row.color}`}>{row.initials}</span><span>{row.name}</span>{row.bet && <small>YOU</small>}</div></td><td><span className={`side-pill table-side ${row.prediction}`}><i />{sideName(row.prediction)}</span></td><td><span className="table-amount"><Coin />{money(row.stake)}</span></td><td><button className="dice-result" aria-label={`View ${row.bet ? "your" : "shared"} round, total ${row.dice.reduce((sum, value) => sum + value, 0)}`} onClick={() => showRound(row.bet ?? { id: row.id, dice: row.dice, total: row.dice.reduce((sum, value) => sum + value, 0), side: row.dice.reduce((sum, value) => sum + value, 0) >= 11 ? "tai" : "xiu", createdAt: "" })}>{row.dice.map((value, index) => <DiceFace key={index} small value={value} />)}<span>{row.dice.reduce((sum, value) => sum + value, 0)}</span></button></td><td className={row.won ? "table-win" : "table-loss"}>{row.won ? `+${money(row.profit)}` : "No win"}{row.won && <ArrowUpRight size={12} />}</td></tr>)}</tbody></table></div> : <div className="history-empty"><span className="empty-icon"><History size={27} /></span><h3>Your story starts with a roll.</h3><p>Place your first bet and find your results right here.</p><button className="text-link" onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>Back to the table <ArrowRight size={14} /></button></div>}
            <div className="activity-footer"><span>{activityTab === "all" ? "Real players · masked names · shared server results" : `${session.bets.length} round${session.bets.length !== 1 ? "s" : ""} · Server-settled wagers`}</span>{activityTab === "mine" && session.bets.length > historyLimit ? <button onClick={() => setHistoryLimit((limit) => limit + 10)}>Show more <ChevronDown size={12} /></button> : <ShieldCheck size={13} />}</div>
          </section>
          <aside className="session-panel">
            <div className="session-heading"><h2>Your session</h2><TrendingUp size={17} /></div>
            <div className="session-profit">
              <span>Result</span>
              <strong className={netProfit < 0 ? "negative-profit" : ""}>{netProfit > 0 ? <><Coin />+{money(netProfit)}</> : "No win"}</strong>
              <small>A little perspective on your play.</small>
            </div>
            <SessionChart bets={session.bets} />
            <div className="session-metrics">
              <div><span>Total bets</span><strong>{session.bets.length.toString().padStart(2, "0")}</strong></div>
              <div><span>Wins</span><strong>{wins.toString().padStart(2, "0")}</strong></div>
            </div>
            <div className="session-note"><Sparkles size={12} /><span>Enjoy the game, not just the outcome.</span></div>
          </aside>
        </div>

        <footer className="page-footer"><div className="footer-promise"><ShieldCheck size={15} /><span>No deposits. No pressure. Just play.</span></div><span className="footer-copyright">© 2026 Tai Xiu</span><button onClick={() => openModal("responsible")}><span className="age-badge">18+</span> Play responsibly <ArrowUpRight size={12} /></button></footer>
      </main>
    </div>
    {modal && <CasinoDialogs key={modal} name={modal} session={session} setSession={setSession} onClose={() => setModal(null)} notify={notify} round={selectedRound} playing={running} onReset={() => { void live.refresh(); setModal(null); notify("Shared wallet and table refreshed."); }} onViewHistory={viewHistory} />}
    {toast && <div key={toast.id} className="toast" role="status"><CircleCheck size={19} /><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </div>;
}
