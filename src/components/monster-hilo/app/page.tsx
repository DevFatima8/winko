"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BarChart3, Bell, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Club, Coins, Copy, Dices, Expand, Flame, Gem, Gift, Heart, History, Home, Info, Menu, Minus, Music2, RotateCcw, Settings2, ShieldCheck, Spade, Sparkles, Target, Trophy, Volume2, VolumeX, Wallet, X, Zap } from "lucide-react";

const suits = ["♠", "♥", "♣", "♦"] as const;
type Suit = (typeof suits)[number];
type CardData = { rank: number; suit: Suit };
type Direction = "higher" | "lower";
type Phase = "ready" | "playing" | "lost" | "cashed";
type Round = { id: number; amount: number; result: "Win" | "Loss"; multiplier: number; time: string };

const ranks = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const initialCard: CardData = { rank: 8, suit: "♥" };
const randomSuit = (): Suit => suits[Math.floor(Math.random() * suits.length)];
const money = (n: number) => n.toFixed(2);
const randomCard = (): CardData => ({ rank: Math.floor(Math.random() * 11) + 3, suit: randomSuit() });

function PlayingCard({ card, back = false, small = false, faded = false }: { card?: CardData; back?: boolean; small?: boolean; faded?: boolean }) {
  if (back || !card) return <div className={`playing-card card-back ${small ? "card-small" : ""} ${faded ? "card-faded" : ""}`}><div className="back-border"><div className="back-pattern"><span>✦</span><span className="back-m">M</span><span>✦</span></div></div></div>;
  const red = card.suit === "♥" || card.suit === "♦";
  return <div className={`playing-card card-front ${small ? "card-small" : ""} ${faded ? "card-faded" : ""} ${red ? "red-suit" : "black-suit"}`}><div className="card-corner"><b>{ranks[card.rank]}</b><span>{card.suit}</span></div><span className="card-center-suit">{card.suit}</span><div className="card-corner card-corner-bottom"><b>{ranks[card.rank]}</b><span>{card.suit}</span></div></div>;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}><div className="brand-mark"><span className="brand-horn horn-left" /><span className="brand-horn horn-right" /><span className="brand-eyes">••</span><span className="brand-mouth">⌣</span></div><span className="brand-name">MONSTER<span>BET</span></span></div>;
}

export default function HomePage() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState("10.00");
  const [phase, setPhase] = useState<Phase>("ready");
  const [card, setCard] = useState<CardData>(initialCard);
  const [previous, setPrevious] = useState<CardData | null>(null);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<Round[]>([]);
  const [cardTrail, setCardTrail] = useState<CardData[]>([]);
  const [lastResult, setLastResult] = useState<"win" | "loss" | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [sound, setSound] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeNav, setActiveNav] = useState("Casino");
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const betAmount = Number(bet) || 0;
  const multiplier = Math.pow(1.85, streak);
  const cashoutValue = betAmount * multiplier;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("monster-hilo-demo");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.balance === "number" && Number.isFinite(parsed.balance)) setBalance(parsed.balance);
        if (Array.isArray(parsed.history)) setHistory(parsed.history.slice(0, 8));
      }
    } catch { /* start with default demo balance */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("monster-hilo-demo", JSON.stringify({ balance, history })); }, [balance, history, loaded]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); } }, [toast]);

  const playTone = (frequency: number, duration = 0.14) => {
    if (!sound) return;
    try {
      audioContext.current ??= new AudioContext();
      const ctx = audioContext.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(); oscillator.stop(ctx.currentTime + duration);
    } catch { /* audio is optional */ }
  };
  const addHistory = (amount: number, result: "Win" | "Loss", multi: number) => setHistory(prev => [{ id: Date.now(), amount, result, multiplier: multi, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 8));
  const changeBet = (amount: number) => { if (phase === "playing") return; setBet(money(Math.max(0.1, amount))); };
  const startGame = () => {
    if (betAmount < 0.1 || !Number.isFinite(betAmount)) { setToast("Minimum bet is Rs. 0.10"); return; }
    if (betAmount > balance) { setToast("Insufficient balance."); return; }
    setBalance(v => Number((v - betAmount).toFixed(2)));
    setCard(randomCard()); setPrevious(null); setCardTrail([]); setStreak(0); setLastResult(null); setPhase("playing");
    playTone(390); setTimeout(() => playTone(540), 100);
  };
  const guess = (direction: Direction) => {
    if (phase !== "playing" || revealing) return;
    const canWin = direction === "higher" ? card.rank < 14 : card.rank > 2;
    if (!canWin) { setToast(`No card can be ${direction} than ${ranks[card.rank]}. Choose the other direction.`); return; }
    setRevealing(true); setLastResult(null);
    const won = Math.random() < 0.35;
    const options: number[] = [];
    for (let i = 2; i <= 14; i++) {
      if (won ? (direction === "higher" ? i > card.rank : i < card.rank) : (direction === "higher" ? i <= card.rank : i >= card.rank)) options.push(i);
    }
    const next: CardData = { rank: options[Math.floor(Math.random() * options.length)], suit: randomSuit() };
    const oldCard = card;
    setTimeout(() => {
      setPrevious(oldCard); setCard(next); setCardTrail(prev => [...prev, oldCard].slice(-5));
      setLastResult(won ? "win" : "loss"); setRevealing(false);
      if (won) { setStreak(v => v + 1); playTone(690); setTimeout(() => playTone(890), 110); }
      else { setPhase("lost"); addHistory(betAmount, "Loss", 0); playTone(210, 0.3); }
    }, 420);
  };
  const cashout = () => {
    if (phase !== "playing" || streak === 0 || revealing) return;
    const payout = Number(cashoutValue.toFixed(2));
    setBalance(v => Number((v + payout).toFixed(2)));
    addHistory(payout, "Win", multiplier); setPhase("cashed"); setLastResult("win");
    playTone(780); setTimeout(() => playTone(1000), 120);
  };
  const navClick = (name: string) => { setActiveNav(name); setMobileMenu(false); if (name !== "Casino" && name !== "HiLo") setToast(`${name} is coming soon. Enjoy Monster HiLo!`); };
  const navItems = [{ icon: Home, label: "Home" }, { icon: Dices, label: "Casino" }, { icon: Trophy, label: "Sports" }, { icon: Zap, label: "Live Casino" }];
  const gameItems = [{ icon: Flame, label: "Popular" }, { icon: Spade, label: "Originals" }, { icon: Target, label: "Slots" }, { icon: Club, label: "Table Games" }];

  return <div className="app-shell">
    {mobileMenu && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
      <div className="sidebar-logo"><Logo /><button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="sidebar-scroll">
        <div className="sidebar-group"><div className="sidebar-caption">MENU</div>{navItems.map(({ icon: Icon, label }) => <button key={label} onClick={() => navClick(label)} className={`nav-item ${activeNav === label ? "nav-active" : ""}`}><Icon size={19} strokeWidth={2.1} /><span>{label}</span>{label === "Casino" && <span className="active-pill" />}</button>)}</div>
        <div className="sidebar-divider" />
        <div className="sidebar-group"><div className="sidebar-caption">EXPLORE GAMES</div>{gameItems.map(({ icon: Icon, label }) => <button key={label} onClick={() => navClick(label)} className="nav-item"><Icon size={19} strokeWidth={2.1} /><span>{label}</span></button>)}</div>
        <div className="sidebar-divider" />
        <div className="sidebar-group"><div className="sidebar-caption">MORE</div><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={19} /><span>How to Play</span></button><button className="nav-item" onClick={() => setToast("This is a free-to-play demo with virtual credits only.")}><ShieldCheck size={19} /><span>Fair Play</span></button></div>
      </div>
      <div className="sidebar-bottom"><div className="sidebar-promo"><div className="promo-spark"><Sparkles size={19} /></div><strong>Your lucky streak<br />starts here!</strong></div><div className="sidebar-footer">MONSTERBET © 2026 <span>•</span> Demo mode</div></div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={22} /></button><div className="breadcrumb">Casino <ChevronRight size={14} /> Originals <ChevronRight size={14} /> <strong>Monster HiLo</strong></div></div><div className="topbar-right"><div className="demo-badge"><span /> DEMO MODE</div><button className="header-icon" title="Notifications" onClick={() => setToast("You're all caught up!")}><Bell size={19} /></button><div className="balance-box"><div className="balance-coin">Rs</div><div><small>YOUR BALANCE</small><strong>Rs. {money(balance)}</strong></div><ChevronDown size={15} /></div><button className="avatar" onClick={() => setToast("Playing as Guest in demo mode")}>G</button></div></header>

      <main className="content">
        <div className="game-heading"><div className="heading-left"><div className="game-icon"><span>♠</span></div><div><div className="eyebrow">MONSTERBET ORIGINALS <span className="tiny-star">✦</span></div><h1>Monster HiLo <span className="title-badge">ORIGINAL</span></h1><p>Trust your instincts. Go higher or lower. Win big.</p></div></div><div className="heading-actions"><button onClick={() => setHelpOpen(true)}><BookOpen size={17} /> How to play</button><button onClick={() => setSound(s => !s)} title={sound ? "Mute sounds" : "Unmute sounds"} aria-label={sound ? "Mute sounds" : "Unmute sounds"}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button onClick={() => { const el = document.querySelector(".game-board"); if (el && !document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); }} title="Fullscreen" aria-label="Fullscreen"><Expand size={17} /></button></div></div>

        <div className="game-board">
          <div className="bet-panel"><div className="panel-top"><span className="panel-top-icon"><Settings2 size={16} /></span> BET SETTINGS <span className="panel-top-line" /></div>
            <div className="bet-form"><div className="field-label"><label htmlFor="bet-amount">Bet Amount</label><span>PKR</span></div><div className={`amount-input ${phase === "playing" ? "input-disabled" : ""}`}><div className="dollar-icon">Rs</div><input id="bet-amount" type="number" min="0.1" step="0.1" value={bet} disabled={phase === "playing"} onChange={e => setBet(e.target.value)} onBlur={() => { if (bet && Number(bet) > 0) setBet(money(Number(bet))); }} /><span className="input-currency">PKR</span></div><div className="quick-bets"><button disabled={phase === "playing"} onClick={() => changeBet(betAmount / 2)}>½</button><button disabled={phase === "playing"} onClick={() => changeBet(betAmount * 2)}>2×</button><button disabled={phase === "playing"} onClick={() => changeBet(balance)}>MAX</button></div>
              <div className="panel-separator" /><div className="field-label payout-label"><span>Potential Payout</span><Info size={14} /></div><div className="payout-box"><div><div className="payout-coin">Rs</div><strong>Rs. {money(phase === "playing" ? cashoutValue : betAmount * 1.85)}</strong></div><span>{phase === "playing" ? multiplier.toFixed(2) : "1.85"}×</span></div><div className="payout-hint">{phase === "playing" ? "Cash out anytime after a correct guess" : "Make a correct guess to grow your payout"}</div>
              {phase === "playing" ? <button className={`main-bet-button cashout-button ${streak === 0 ? "cashout-unavailable" : ""}`} onClick={cashout} disabled={streak === 0 || revealing}><Wallet size={19} /> Cash Out <span>Rs. {money(cashoutValue)}</span></button> : <button className="main-bet-button" onClick={startGame}><Zap size={20} fill="currentColor" /> {phase === "ready" ? "Place Bet" : "Play Again"} <ArrowRight size={18} /></button>}
              <div className="play-note"><ShieldCheck size={15} /> Free to play · No real money involved</div></div>
            <div className="panel-bottom"><div className="mini-rule"><div className="rule-icon"><ArrowUpRight size={17} /></div><div><strong>Pick higher or lower</strong><span>Guess the next card correctly</span></div></div><div className="mini-rule"><div className="rule-icon purple"><Coins size={17} /></div><div><strong>Build your streak</strong><span>Cash out before you lose</span></div></div></div>
          </div>

          <div className="stage"><div className="stage-glow" /><div className="stage-grid" /><div className="stage-top"><span className="game-live"><span /> MONSTER HILO</span><span className="stage-top-right"><span className="small-spark">✦</span> THE GAME OF GUT FEELING</span></div>
            <div className="stage-main"><div className="monster-halo" /><img className="monster-art" src="/images/monster-mascot.png" alt="Purple Monster HiLo mascot" /><div className="stage-title"><span className="stage-title-top">CAN YOU BEAT THE MONSTER?</span><div className="arcade-title">HI<span>LO</span><i>!</i></div><div className="stage-subtitle">HIGHER OR LOWER? YOU DECIDE.</div></div>
              <div className="card-arena"><div className="card-position"><div className="card-label">CURRENT CARD</div><div className="card-holder"><PlayingCard card={phase === "lost" && previous ? previous : card} /></div></div><div className="card-transition"><div className="transition-line" /><div className="transition-circle"><ArrowRight size={23} strokeWidth={2.5} /></div><div className="transition-line" /></div><div className="card-position"><div className="card-label">NEXT CARD</div><div className={`card-holder next-holder ${revealing ? "card-shuffling" : ""}`}><PlayingCard back={phase !== "lost"} card={card} /></div></div></div>
              <div className="stage-message">{revealing ? <><span className="message-dot" /> Revealing your card...</> : lastResult === "loss" ? <span className="message-loss">{""}</span> : phase === "cashed" ? <span className="message-win">Nice cash out! Rs. {money(betAmount * multiplier)} collected.</span> : lastResult === "win" ? <span className="message-win">Great call! Keep going or cash out.</span> : phase === "playing" ? "Will the next card be higher or lower?" : "Place a bet to start your game"}</div>
              <div className="guess-buttons"><button className="guess-button guess-higher" onClick={() => guess("higher")} disabled={phase !== "playing" || revealing || card.rank === 14}><span className="guess-icon"><ArrowUp size={24} strokeWidth={3} /></span><span><strong>HIGHER</strong><small>Next card goes up</small></span><span className="guess-arrow"><ArrowUpRight size={18} /></span></button><button className="guess-button guess-lower" onClick={() => guess("lower")} disabled={phase !== "playing" || revealing || card.rank === 2}><span className="guess-icon"><ArrowDown size={24} strokeWidth={3} /></span><span><strong>LOWER</strong><small>Next card goes down</small></span><span className="guess-arrow"><ArrowDownRight size={18} /></span></button></div>
            </div><div className="stage-footer"><div className="footer-deck"><span className="footer-deck-icon">▰</span> Cards: 2 to Ace</div><div className="footer-streak"><Flame size={16} fill={streak > 0 ? "currentColor" : "none"} /> STREAK <strong>{streak}</strong></div><div className="footer-round">{phase === "playing" ? "ROUND IN PROGRESS" : "READY TO PLAY"}<span /></div></div></div>
        </div>

        <div className="under-game"><div className="trail-section"><div className="section-head"><div><History size={18} /><h2>Card History</h2></div><span>YOUR LAST CARDS</span></div><div className="trail-cards">{cardTrail.length ? cardTrail.map((c, i) => <PlayingCard key={`${i}-${c.rank}-${c.suit}`} card={c} small />) : <><PlayingCard card={{ rank: 5, suit: "♠" }} small faded /><PlayingCard card={{ rank: 10, suit: "♦" }} small faded /><PlayingCard card={{ rank: 7, suit: "♣" }} small faded /></>}<div className="trail-current"><span>{cardTrail.length ? "CURRENT" : "START HERE"}</span><ArrowRight size={18} /></div></div></div><div className="stats-section"><div className="section-head"><div><BarChart3 size={18} /><h2>Your Session</h2></div><span>DEMO STATS</span></div><div className="stats-grid"><div><span>Games Played</span><strong>{history.length}</strong></div><div><span>Biggest Win</span><strong className="green-text">Rs. {money(Math.max(0, ...history.filter(h => h.result === "Win").map(h => h.amount)))}</strong></div><div><span>Current Streak</span><strong>{streak} <Flame size={15} /></strong></div></div></div></div>
        <div className="history-section"><div className="section-head history-head"><div><Clock3 size={18} /><h2>Recent Bets</h2></div><span>YOUR ACTIVITY</span></div><div className="history-table"><div className="table-header"><span>GAME</span><span>TIME</span><span>BET / PAYOUT</span><span>MULTIPLIER</span><span>RESULT</span></div>{history.length ? history.slice(0, 4).map(item => <div className="table-row" key={item.id}><span><div className="table-game-icon">♠</div> Monster HiLo</span><span>{item.time}</span><span>Rs. {money(item.amount)}</span><span>{item.multiplier ? `${item.multiplier.toFixed(2)}×` : "—"}</span><span><span className={`result-pill ${item.result === "Win" ? "result-win" : "result-loss"}`}>{item.result === "Win" ? "Win" : ""}</span></span></div>) : <div className="empty-history"><Dices size={19} /> No bets yet. Place your first bet to get started!</div>}</div></div>
        <footer className="page-footer"><span><ShieldCheck size={15} /> For entertainment only. Virtual credits have no cash value.</span><span>Monster HiLo · Demo Edition</span></footer>
      </main>
    </div>
    {toast && <div className="toast"><Info size={17} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss"><X size={15} /></button></div>}
    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-label="How to play Monster HiLo" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Close"><X size={20} /></button><div className="modal-icon"><BookOpen size={23} /></div><div className="eyebrow">THE RULES ARE SIMPLE</div><h2>How to play <span>Monster HiLo</span></h2><p>Beat the monster by guessing whether the next card will be higher or lower than the current card.</p><div className="help-steps"><div><span>01</span><div><strong>Set your bet</strong><p>Choose a bet amount and press Place Bet. Your starting card will be revealed.</p></div></div><div><span>02</span><div><strong>Make your call</strong><p>Choose Higher or Lower. Cards rank from 2 (lowest) to Ace (highest). Equal cards count as a loss.</p></div></div><div><span>03</span><div><strong>Cash out or continue</strong><p>Each correct guess grows your multiplier by 1.85×. Cash out any time after a win, or keep risking it!</p></div></div></div><div className="help-notice"><Info size={17} /></div><button className="modal-play" onClick={() => setHelpOpen(false)}>Got it, let’s play <ArrowRight size={17} /></button></div></div>}
  </div>;
}
