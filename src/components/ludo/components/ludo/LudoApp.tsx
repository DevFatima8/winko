"use client";

import { notifyGameResult } from "@/lib/gameResultNotice";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, useBrowserWager } from "@/lib/walletSync";
import GameScreen from "@/components/ludo/GameScreen";
import Lobby from "@/components/ludo/Lobby";
import {
  STARTING_BALANCE,
  formatMoney,
  type BetAmount,
  type Deal,
} from "@/lib/ludo";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.63-.94l-.36-2.54A.5.5 0 0013.9 2h-3.8a.5.5 0 00-.5.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.8 8.48a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.92 14.16a.5.5 0 00-.12.64l1.92 3.32c.13.23.4.32.6.22l2.39-.96c.49.41 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.23.1.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  );
}

function CoinSvg() {
  return (
    <svg className="coin-svg" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="28" fill="#f5c518" />
      <circle cx="32" cy="32" r="22" fill="#ffe56a" stroke="#c49200" strokeWidth="3" />
      <path d="M32 18l3.6 8.4 9.2.8-7 6.2 2.2 9-8-4.6-8 4.6 2.2-9-7-6.2 9.2-.8L32 18z" fill="#c49200" />
    </svg>
  );
}

export default function LudoApp() {
  const [balance] = useGameBalance("ludo", STARTING_BALANCE);
  const { playServer } = useBrowserWager("ludo", STARTING_BALANCE);
  const [ready, setReady] = useState(false);
  const [bet, setBet] = useState<BetAmount>(1000);
  const [screen, setScreen] = useState<"lobby" | "table">("lobby");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojis, setEmojis] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const settled = useRef<string | null>(null);
  const resultNotice = useRef<{ wagerId: string; claim: number; poolPending: boolean } | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    const sfx = window.localStorage.getItem("ludo-quick-sound");
    if (sfx === "0") setSoundOn(false);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem("ludo-quick-balance", String(balance));
  }, [balance, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("ludo-quick-sound", soundOn ? "1" : "0");
  }, [soundOn, ready]);

  const playTone = useCallback((kind: "roll" | "move" | "win" | "lose" | "bag") => {
    if (!soundOn) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (kind === "roll") {
        osc.frequency.value = 420;
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (kind === "move") {
        osc.frequency.value = 640;
        osc.type = "square";
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (kind === "bag") {
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (kind === "win") {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.12);
        osc.frequency.setValueAtTime(784, now + 0.24);
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(220, now + 0.18);
        osc.type = "sawtooth";
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  async function startMatch(nextBet: BetAmount) {
    if (balance < nextBet) return;
    setBusy(true);
    try {
      const reply = await playServer(nextBet, {});
      const next = reply.outcome as Deal;
      resultNotice.current = reply;
      settled.current = null;
      setDeal(next);
      setScreen("table");
    } catch {
      window.dispatchEvent(new CustomEvent("wx:wallet-error", { detail: { error: "Ludo wager confirmation failed. Retry the saved wager; no local replacement outcome is allowed." } }));
    } finally {
      setBusy(false);
    }
  }

  function applySettlement(currentDeal: Deal) {
    if (settled.current === currentDeal.txId) return;
    settled.current = currentDeal.txId;
    const notice = resultNotice.current;
    if (notice) notifyGameResult("ludo", notice.wagerId, notice.claim, notice.poolPending);
  }

  function onResultShown(currentDeal: Deal) {
    applySettlement(currentDeal);
  }

  function spawnEmoji(emoji: string) {
    const id = Date.now() + Math.random();
    setEmojis((list) => [...list, { id, emoji, left: 30 + Math.random() * 40 }]);
    window.setTimeout(() => {
      setEmojis((list) => list.filter((e) => e.id !== id));
    }, 1600);
    setEmojiOpen(false);
  }

  if (!ready) {
    return <div className="lq-root" />;
  }

  return (
    <div className="lq-root">
      <header className="top-bar lq-chrome">
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
        <div className="jili-lockup">
          <small>Powered by</small>
          <div className="jili-badge">JILI</div>
        </div>
        <button type="button" className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="Info">
          <InfoIcon />
        </button>
      </header>

      {screen === "lobby" || !deal ? (
        <Lobby
          balance={balance}
          bet={bet}
          setBet={setBet}
          busy={busy}
          onPlay={() => void startMatch(bet)}
          onRules={() => setRulesOpen(true)}
        />
      ) : (
        <SettlingTable
          key={deal.txId}
          deal={deal}
          balance={balance}
          soundOn={soundOn}
          playTone={playTone}
          onResultShown={onResultShown}
          onLobby={() => {
            setScreen("lobby");
            setDeal(null);
          }}
          onContinue={() => {
            if (balance < deal.bet) {
              setScreen("lobby");
              setDeal(null);
              return;
            }
            void startMatch(deal.bet as BetAmount);
          }}
        />
      )}

      <footer className="bottom-bar">
        <div className="balance-chip">
          <CoinSvg />
          <span>{formatMoney(balance)}</span>
        </div>
        <div className="side-tools">
          <button type="button" className="tool-btn" onClick={() => setEmojiOpen((v) => !v)} aria-label="Emoji">
            😊
          </button>
          <button type="button" className="tool-btn" onClick={() => setEmojiOpen((v) => !v)} aria-label="Chat">
            💬
          </button>
        </div>
      </footer>
      <div className="ver-line">v_2.032</div>
      {deal ? <div className="meta-line">{deal.txId}</div> : null}

      {emojis.map((e) => (
        <span key={e.id} className="emoji-pop" style={{ left: `${e.left}%`, bottom: "120px" }}>
          {e.emoji}
        </span>
      ))}

      {emojiOpen ? (
        <div className="emoji-panel">
          {["😂", "🔥", "👍", "😎", "🎉", "😭"].map((e) => (
            <button key={e} type="button" onClick={() => spawnEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card" onClick={(ev) => ev.stopPropagation()}>
            <h3>Settings</h3>
            <div className="settings-row">
              <span>Sound</span>
              <button
                type="button"
                className={`toggle ${soundOn ? "" : "off"}`}
                onClick={() => setSoundOn((v) => !v)}
              >
                {soundOn ? "ON" : "OFF"}
              </button>
            </div>
            <p style={{ marginTop: 12, fontSize: 13, color: "#e0c8f5" }}>
              Ludo Quick is a fast 4-player race. First token into the finish zone wins the table.
            </p>
            <button type="button" className="close-modal" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {rulesOpen ? (
        <div className="modal" onClick={() => setRulesOpen(false)}>
          <div className="modal-card" onClick={(ev) => ev.stopPropagation()}>
            <h3>How to play</h3>
            <ul>
              <li>Four players, four tokens each. Two tokens start on the board.</li>
              <li>Roll the dice and move. A 6 lets you bring a token out or move 6 steps and roll again.</li>
              <li>Land on an opponent (not on a star/safe square) to send them back to base and earn a bonus roll.</li>
              <li>Stars are safe. Chance pins and money bags add extra rewards.</li>
              <li>First player to get a token into the finish zone wins the round.</li>
              <li>Winner takes the advertised Win plus any bags. Everyone receives a bag return.</li>
            </ul>
            <button type="button" className="close-modal" onClick={() => setRulesOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettlingTable({
  deal,
  balance,
  soundOn,
  playTone,
  onLobby,
  onContinue,
  onResultShown,
}: {
  deal: Deal;
  balance: number;
  soundOn: boolean;
  playTone: (kind: "roll" | "move" | "win" | "lose" | "bag") => void;
  onLobby: () => void;
  onContinue: () => void;
  onResultShown: (deal: Deal) => void;
}) {
  const applied = useRef(false);

  return (
    <GameScreen
      deal={deal}
      balance={balance}
      soundOn={soundOn}
      playTone={playTone}
      onSettled={() => {
        if (!applied.current) {
          applied.current = true;
          onResultShown(deal);
        }
      }}
      onLobby={() => {
        if (!applied.current) {
          applied.current = true;
          onResultShown(deal);
        }
        onLobby();
      }}
      onContinue={() => {
        if (!applied.current) {
          applied.current = true;
          onResultShown(deal);
        }
        onContinue();
      }}
    />
  );
}
