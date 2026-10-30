"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Dice from "./Dice";
import LudoBoard from "./LudoBoard";
import ResultOverlay from "./ResultOverlay";
import {
  COLOR_META,
  coordsForToken,
  nextCoordsOnMove,
  randomBagCells,
  settlementFor,
  simulateGame,
  tokenCenter,
  type Deal,
  type GameEvent,
  type TokenState,
} from "@/lib/ludo";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEAT_POS = ["br", "tr", "tl", "bl"] as const;
const DICE_POS = ["br", "tr", "tl", "bl"] as const;

function initialTokens(): TokenState[][] {
  return [0, 1, 2, 3].map(() => [{ steps: 0 }, { steps: 0 }, { steps: -1 }, { steps: -1 }]);
}

export default function GameScreen({
  deal,
  balance,
  soundOn,
  onLobby,
  onContinue,
  onSettled,
  playTone,
}: {
  deal: Deal;
  balance: number;
  soundOn: boolean;
  onLobby: () => void;
  onContinue: () => void;
  onSettled: () => void;
  playTone: (kind: "roll" | "move" | "win" | "lose" | "bag") => void;
}) {
  const [phase, setPhase] = useState<"waiting" | "playing" | "result">("waiting");
  const [joined, setJoined] = useState(1);
  const [waitLeft, setWaitLeft] = useState(8);
  const [tokens, setTokens] = useState<TokenState[][]>(initialTokens);
  const [current, setCurrent] = useState(0);
  const [dice, setDice] = useState(6);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState<{ player: number; token: number } | null>(null);
  const [needClick, setNeedClick] = useState(false);
  const [bags, setBags] = useState<number[]>(() => randomBagCells(deal.seed));
  const [toast, setToast] = useState("");
  const [bagPop, setBagPop] = useState<{ left: string; top: string; text: string } | null>(null);

  const events = useMemo(() => simulateGame(deal), [deal]);
  const cancelled = useRef(false);
  const rollGate = useRef<((value?: unknown) => void) | null>(null);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      rollGate.current?.(null);
    };
  }, []);

  useEffect(() => {
    if (phase !== "waiting") return;
    const timers: number[] = [];
    timers.push(window.setInterval(() => setWaitLeft((s) => Math.max(0, s - 1)), 1000));
    timers.push(window.setTimeout(() => setJoined(2), 900));
    timers.push(window.setTimeout(() => setJoined(3), 1800));
    timers.push(window.setTimeout(() => setJoined(4), 2700));
    timers.push(
      window.setTimeout(() => {
        setPhase("playing");
      }, 3200),
    );
    return () => timers.forEach((id) => clearTimeout(id));
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    cancelled.current = false;

    const run = async () => {
      for (const ev of events) {
        if (cancelled.current) return;
        await handleEvent(ev);
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function waitForPlayerRoll() {
    setNeedClick(true);
    await new Promise((resolve) => {
      rollGate.current = resolve;
      window.setTimeout(() => resolve(null), 2000);
    });
    rollGate.current = null;
    setNeedClick(false);
  }

  function clickDice() {
    rollGate.current?.(null);
  }

  async function handleEvent(ev: GameEvent) {
    if (ev.type === "turn") {
      setCurrent(ev.player);
      await sleep(ev.player === 0 ? 180 : 90);
      return;
    }
    if (ev.type === "roll") {
      if (ev.player === 0) await waitForPlayerRoll();
      setRolling(true);
      if (soundOn) playTone("roll");
      const spinFor = ev.player === 0 ? 280 : 160;
      const start = Date.now();
      while (Date.now() - start < spinFor) {
        setDice(1 + Math.floor(Math.random() * 6));
        await sleep(40);
      }
      setDice(ev.value);
      setRolling(false);
      await sleep(110);
      return;
    }
    if (ev.type === "out" || ev.type === "move") {
      const player = ev.player;
      const token = ev.token;
      const fromSteps = ev.type === "out" ? -1 : ev.fromSteps;
      const toSteps = ev.type === "out" ? 0 : ev.toSteps;
      setMoving({ player, token });
      const path = nextCoordsOnMove(player, token, fromSteps, toSteps);
      for (let i = 1; i < path.length; i++) {
        if (soundOn && i % 2 === 0) playTone("move");
        setTokens((prev) => {
          const next = prev.map((row) => row.map((t) => ({ ...t })));
          const steps = fromSteps < 0 ? 0 : fromSteps + i;
          next[player][token].steps = Math.min(toSteps, steps);
          return next;
        });
        await sleep(52);
      }
      setTokens((prev) => {
        const next = prev.map((row) => row.map((t) => ({ ...t })));
        next[player][token].steps = toSteps;
        if (ev.type === "move" && ev.captured) {
          next[ev.captured.player][ev.captured.token].steps = -1;
        }
        return next;
      });
      setMoving(null);
      await sleep(60);
      return;
    }
    if (ev.type === "bag") {
      if (soundOn) playTone("bag");
      setToast(`${deal.players[ev.player].name} grabbed a money bag +${ev.amount}`);
      const lead = tokens[ev.player]?.find((t) => t.steps >= 0) ?? tokens[ev.player][0];
      const c = coordsForToken(ev.player, 0, lead?.steps ?? 0);
      const pos = tokenCenter(c.row, c.col);
      setBagPop({ left: pos.left, top: pos.top, text: `+${ev.amount}` });
      setBags((prev) => prev.slice(1));
      window.setTimeout(() => setToast(""), 1400);
      window.setTimeout(() => setBagPop(null), 1200);
      await sleep(400);
      return;
    }
    if (ev.type === "win") {
      await sleep(500);
      if (soundOn) playTone(ev.player === 0 ? "win" : "lose");
      onSettled();
      setPhase("result");
    }
  }

  const visiblePlayers = deal.players.map((p, i) => (i === 0 || i < joined ? p : null));

  return (
    <div className="table">
      <div className="table-stage">
        <div className="board-wrap">
          <LudoBoard tokens={tokens} bags={phase === "waiting" ? [] : bags} moving={moving} />
          {phase === "waiting" ? (
            <div className="overlay" style={{ background: "rgba(10,4,20,0.42)", borderRadius: 8 }}>
              <div className="wait-box">
                <div className="wait-title">Waiting for others to join</div>
                <div className="wait-timer">00:{String(waitLeft).padStart(2, "0")}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {deal.players.map((p) => {
        if (phase === "waiting" && !visiblePlayers[p.id]) return null;
        const pos = SEAT_POS[p.id];
        const meta = COLOR_META[p.color];
        return (
          <div
            key={p.id}
            className={`seat ${pos} ${p.isYou ? "you" : ""} ${current === p.id && phase === "playing" ? "active" : ""}`}
            style={{ ["--seat" as string]: meta.main }}
          >
            <div className="seat-avatar" style={{ borderColor: meta.main }}>
              <img src={p.avatar} alt={p.name} />
            </div>
            <div className="seat-name">{p.name}</div>
            {p.isYou ? <div className="you-tag">YOU</div> : null}
          </div>
        );
      })}

      {phase === "playing" ? (
        <div className={`dice-dock ${DICE_POS[current]}`}>
          <Dice value={dice} rolling={rolling} onClick={needClick ? clickDice : undefined} />
        </div>
      ) : null}

          {needClick ? <div className="roll-hint">Tap dice to roll · auto in 2s</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}
      {bagPop ? (
        <div className="bag-float" style={{ left: bagPop.left, top: bagPop.top }}>
          {bagPop.text}
        </div>
      ) : null}

      {phase === "waiting" ? <div className="room-code">Room ID: {deal.roomCode}</div> : null}

      {phase === "result" ? (
        <ResultOverlay
          deal={deal}
          balance={Math.max(0, Math.round((balance + settlementFor(deal, 0).total) * 100) / 100)}
          onLobby={onLobby}
          onContinue={onContinue}
        />
      ) : null}
    </div>
  );
}
