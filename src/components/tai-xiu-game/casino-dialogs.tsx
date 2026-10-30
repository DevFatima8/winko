"use client";

import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, Check, ChevronRight, CircleHelp, Clock3, Coffee, Coins, Dices, Heart, History, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Star, Trophy, Wallet } from "lucide-react";
import { Coin, DiceFace, Modal } from "./game-ui";
import { money, sideName, type DialogName, type Round, type Session } from "./lib/game";

interface Props {
  name: Exclude<DialogName, null>;
  session: Session;
  setSession: Dispatch<SetStateAction<Session>>;
  onClose: () => void;
  notify: (message: string) => void;
  round: Round | null;
  playing: boolean;
  onReset: () => void;
  onViewHistory: () => void;
}

const headings = {
  rules: ["A classic, in three steps.", "A little know-how before a little luck."],
  fairness: ["Your odds. Out in the open.", "No fine print, no mystery percentages."],
  wallet: ["Your shared wallet", "Your balance is managed by the server."],
  leaderboard: ["Live table activity", "Only real player wagers appear on this table."],
  lobby: ["Find your lucky side.", "Welcome to the club. Your table is ready."],
  favorites: ["Your kind of games", "The tables you always come back to."],
  support: ["A little help at the table", "Everything you need for a smooth session."],
  profile: ["Make yourself at home", "Your seat. Your name. Your little corner of the club."],
  notifications: ["At a glance", "Your latest updates from the table."],
  responsible: ["Keep it a good time.", "The best sessions are the ones you stay in control of."],
  round: ["Behind the roll", "Three dice. One result."],
} as const;

export default function CasinoDialogs({ name, session, setSession, onClose, notify, round, playing, onReset, onViewHistory }: Props) {
  const [playerName, setPlayerName] = useState(session.playerName);
  const [title, subtitle] = headings[name];
  const closeAndPlay = () => { onClose(); document.getElementById("game-table")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  const gamePreview = <div className="game-preview"><Image src="/images/dice-table.png" alt="Three golden dice at the Tai Xiu table" width={180} height={180} /><div><span className="eyebrow">TAI XIU ORIGINALS</span><h3>Tai Xiu</h3><p>High or low. Make your call.</p><span className="tiny-badge">Virtual coins only</span></div><button className="primary-button preview-play" onClick={closeAndPlay}>Play now <ArrowRight size={16} /></button></div>;

  return <Modal title={name === "round" && round ? `Round #${round.id}` : title} subtitle={subtitle} onClose={onClose} wide={name === "leaderboard"}>
    {name === "rules" && <>
      <div className="rule-choices"><div><strong>TÀI <span>BIG</span></strong><p>Dice total <b>11–17</b></p></div><div><strong>XỈU <span>SMALL</span></strong><p>Dice total <b>4–10</b></p></div></div>
      <div className="steps"><div><span>01</span><section><h3>Pick your side</h3><p>Choose Tài for a high total, or Xỉu for a low total. All three dice count.</p></section></div><div><span>02</span><section><h3>Make it interesting</h3><p>Choose a virtual-coin stake. Start small, or use the quick amount controls.</p></section></div><div><span>03</span><section><h3>Let the dice decide</h3><p>If your prediction wins, receive 2× your stake, including your original bet. A losing bet returns no coins.</p></section></div></div>
      <div className="info-callout"><ShieldCheck size={21} /><p><strong>One shared round for everyone.</strong> The server generates the dice independently of wagers. Triples are excluded. Bets placed after betting closes reserve a stake for the next round.</p></div>
      <button className="primary-button full-width" onClick={closeAndPlay}>I’m ready to roll <Dices size={18} /></button>
    </>}

    {name === "fairness" && <>
      <div className="odds-large"><div><span>TÀI</span><strong>50<small>%</small></strong></div><div><span>XỈU</span><strong>50<small>%</small></strong></div></div><div className="probability-bar large"><span style={{ width: "50%" }} /></div>
      <div className="explanation-list"><section><ShieldCheck size={19} /><div><h3>Shared server results</h3><p>The server uses cryptographic randomness over non-triple dice rolls. All players see the same result, regardless of their wager or prediction.</p></div></section><section><RotateCcw size={19} /><div><h3>Independent rounds</h3><p>Previous results do not change the next round. The server clock controls betting and settlement.</p></div></section><section><Coins size={19} /><div><h3>Payouts</h3><p>A winning bet pays 2× your stake before the platform share. Your wallet and settled-bet payout show the credited amount.</p></div></section></div>
      <div className="info-callout"><LockKeyhole size={19} /><p>Balances and wagers are stored on the server. Other players are shown with masked names.</p></div>
    </>}

    {name === "wallet" && <>
      <div className="wallet-balance"><div className="wallet-symbol"><Wallet size={26} /></div><span>AVAILABLE BALANCE</span><strong><Coin />{money(session.balance)}</strong><small>Rs.</small></div>
      <a className="primary-button full-width" href="/player/deposit">Open wallet <ArrowRight size={18} /></a>
      <p className="center-note">Deposits and withdrawals are managed through your player wallet.</p>
      <button className="secondary-button full-width" disabled={playing} onClick={onReset}>Refresh wallet and live table <RotateCcw size={18} /></button>
    </>}

    {name === "leaderboard" && <>
      <div className="leaderboard-note"><Trophy size={16} /> REAL PLAYER ACTIVITY <span>Masked names · shared rounds</span></div>
      <div className="info-callout"><Sparkles size={20} /><p>The live bets panel at the table shows accepted player wagers and next-round reservations. Your own settled results appear in <button className="text-link" onClick={onViewHistory}>My bets</button>.</p></div>
    </>}

    {name === "lobby" && <>{gamePreview}<div className="lobby-perks"><span><ShieldCheck size={16} /> Transparent odds</span><span><Coins size={16} /> Free to play</span><span><Dices size={16} /> Instant rounds</span></div><p className="center-note">One timeless game. Endless little possibilities.</p></>}

    {name === "favorites" && <>{session.favorite ? gamePreview : <div className="dialog-empty"><span className="empty-icon"><Heart size={30} /></span><h3>Your favorites start here.</h3><p>Keep Tai Xiu close. Add it to your collection for your next visit.</p><button className="primary-button" onClick={() => { setSession((previous) => ({ ...previous, favorite: true })); notify("Tai Xiu added to your favorites."); }}><Star size={17} /> Add Tai Xiu</button></div>}{session.favorite && <button className="text-link remove-favorite" onClick={() => setSession((previous) => ({ ...previous, favorite: false }))}>Remove from favorites</button>}</>}

    {name === "support" && <div className="faq-list">{[
      ["Where is my balance managed?", "The live table uses your player wallet. Only the server can accept a wager, credit a payout, or refund a cancelled wager."],
      ["How do I manage my wallet?", "Use the balance button and choose Open wallet. Refreshing the game does not reset your balance or accepted wagers."],
      ["Do my bets affect the dice?", "No. Every player sees the same independent server result. Your recent win rate does not predict future rounds."],
      ["Where is my progress saved?", "Wagers and balances are stored on the server. My bets shows settled wagers observed during this visit; the player records page contains your account history."],
      ["How does auto bet work?", "Choose Auto bet, set your stake and number of rounds, then start. The same side and stake are used each round. You can stop after the current roll, and auto bet stops if your balance is too low."],
      ["What happens if my connection drops?", "Accepted wagers still settle on the server. Wait for reconnection and check the live bets panel before retrying. A connection error does not mean your wager was cancelled or refunded."],
    ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronRight size={16} /></summary><p>{answer}</p></details>)}<div className="support-bottom"><CircleHelp size={18} /><p>Still finding your feet? The <b>How to play</b> guide has all the basics.</p></div></div>}

    {name === "profile" && <form onSubmit={(event) => { event.preventDefault(); const value = playerName.trim(); if (!value) return; setSession((previous) => ({ ...previous, playerName: value })); notify("Your player name is updated."); onClose(); }}><div className="profile-preview"><span className="profile-avatar large-avatar">{playerName.trim().slice(0, 1).toUpperCase() || "A"}</span><span className="tiny-badge"><span className="status-dot" /> PRACTICE PLAYER</span></div><label className="form-label" htmlFor="player-name">Player name</label><input id="player-name" className="profile-input" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={20} required autoComplete="nickname" /><p className="field-note">Up to 20 characters. Only stored in this browser.</p><button className="primary-button full-width" type="submit" disabled={!playerName.trim()}>Save changes <Check size={17} /></button></form>}

    {name === "notifications" && <><div className="notification-item"><span className="notification-icon"><Sparkles size={20} /></span><div><h3>Your seat is waiting.</h3><p>Welcome to Tai Xiu. You started with 12,500 free practice coins. Pick a side and make your first prediction.</p><small>WELCOME TO THE CLUB</small></div></div>{session.bets.slice(0, 3).map((bet) => <div className="notification-item" key={bet.id}><span className={`notification-icon ${bet.won ? "gold-text" : ""}`}>{bet.won ? <Trophy size={19} /> : <Dices size={19} />}</span><div><h3>{bet.won ? "That’s your lucky side." : "Another roll, another story."}</h3><p>{sideName(bet.side)} rolled {bet.total}. Your {money(bet.stake)} coin bet {bet.won ? `won ${money(bet.payout)} coins.` : "didn’t win this time."}</p><small>ROUND #{bet.id}</small></div></div>)}<button className="secondary-button full-width" onClick={onViewHistory}>View my bets <History size={16} /></button></>}

    {name === "responsible" && <><div className="responsible-art"><Coffee size={40} /><span>A LITTLE BREAK GOES A LONG WAY.</span></div><div className="explanation-list"><section><Clock3 size={19} /><div><h3>Make time for the real world</h3><p>Take regular breaks. A good game should fit around your day, not take it over.</p></div></section><section><Heart size={19} /><div><h3>Play for the experience</h3><p>Never chase losses. Even with practice coins, remember that past results don’t predict future rolls.</p></div></section><section><ShieldCheck size={19} /><div><h3>For adults, just for fun</h3><p>This 18+ demo has no real-money features. No coin in this game can be exchanged for anything of value.</p></div></section></div><button className="primary-button full-width" disabled={playing} onClick={() => { const active = session.breakUntil > Date.now(); setSession((previous) => ({ ...previous, breakUntil: active ? 0 : Date.now() + 300000 })); notify(active ? "Welcome back. Keep it a good time." : "Your table is paused for 5 minutes. Take a breather."); onClose(); }}><Coffee size={18} />{session.breakUntil > Date.now() ? "End practice break" : "Take a 5-minute break"}</button></>}

    {name === "round" && round && <><div className="round-detail-dice">{round.dice.map((die, index) => <DiceFace value={die} key={index} />)}</div><div className="round-detail-total"><span>DICE TOTAL</span><strong>{round.total}</strong><b className={`side-pill ${round.side}`}>{sideName(round.side)} · {round.side === "tai" ? "BIG" : "SMALL"}</b></div>{session.bets.find((bet) => bet.id === round.id) ? (() => { const bet = session.bets.find((item) => item.id === round.id)!; return <div className="round-bet-detail"><div><span>Your prediction</span><b>{sideName(bet.prediction)}</b></div><div><span>Bet amount</span><b>{money(bet.stake)}</b></div><div><span>{bet.won ? "Net profit" : "Result"}</span><b className={bet.won ? "gold-text" : "loss-text"}>{bet.payout >= bet.stake ? `+${money(bet.payout - bet.stake)}` : "No win"}</b></div></div>; })() : <p className="center-note">Shared server round · no personal wager shown.</p>}<button className="secondary-button full-width" onClick={closeAndPlay}>Back to the table <ArrowRight size={16} /></button></>}
  </Modal>;
}
