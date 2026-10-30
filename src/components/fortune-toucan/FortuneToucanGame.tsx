"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { readBrowserSlotOutcome } from "@/lib/browserSlotTypes";
import {
  AutoModal,
  BetModal,
  BigWinOverlay,
  FeatureIntro,
  MenuSheet,
  PaytableModal,
  RulesModal,
  Splash,
} from "./GameOverlays";
import { createFortuneAudio } from "./lib/fortune-audio";
import {
  INITIAL_GRID,
  START_BALANCE,
  SYMBOL_META,
  SYMBOL_ORDER,
  formatMoney,
  round2,
  winTier,
  type Cell,
  type LineWin,
  type SpinResult,
  type SymbolId,
} from "./lib/fortune";
import "./fortune-toucan.css";
import { BET_PRESETS } from "@/lib/betPresets";

type Phase = "idle" | "spinning" | "featureIntro" | "featureSpin" | "featureHold" | "win" | "bigwin";
type Overlay = "none" | "menu" | "pay" | "bet" | "auto" | "rules";

const PRELOAD = [
  "/games/22_Fortune_Toucan_1024x700.jpg",
  "/images/toucan-mascot.png",
  "/images/symbol-mask.png",
  "/images/symbol-drum.png",
  "/images/symbol-egg.png",
  "/images/symbol-feather.png",
  "/images/symbol-coffee.png",
  "/images/symbol-leaf.png",
];

function wait(ms: number, bag: number[]) {
  return new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    bag.push(id);
  });
}

function cellImage(cell: Cell) {
  if (cell === "blank") return null;
  return SYMBOL_META[cell];
}

export default function FortuneToucanGame({ backHref = "/player" }: { backHref?: string }) {
  const [progress, setProgress] = useState(8);
  const [booting, setBooting] = useState(true);
  const [splashOut, setSplashOut] = useState(false);

  const [balance] = useGameBalance("fortune-toucan", START_BALANCE);
  const pool = usePoolLifecycle("fortune-toucan");
  const [bet, setBet] = useState<number>(100);
  const [sound, setSound] = useState(true);
  const [turbo, setTurbo] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [grid, setGrid] = useState<Cell[]>(INITIAL_GRID);
  const [flicker, setFlicker] = useState(0);
  const [revealedCols, setRevealedCols] = useState(3);
  const [locked, setLocked] = useState<boolean[]>(Array(9).fill(false));
  const [wins, setWins] = useState<LineWin[]>([]);
  const [activeLine, setActiveLine] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const [shownWin, setShownWin] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [featureSymbol, setFeatureSymbol] = useState<Exclude<SymbolId, "wild"> | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [toast, setToast] = useState("");
  const [burst, setBurst] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [playing, setPlaying] = useState(false);

  const busy = playing || phase !== "idle";

  const phaseRef = useRef(phase);
  const betRef = useRef(bet);
  const turboRef = useRef(turbo);
  const soundRef = useRef(sound);
  const balanceRef = useRef(balance);
  const autoRef = useRef(autoLeft);
  const timers = useRef<number[]>([]);
  const busyLock = useRef(false);
  const spinFn = useRef<() => void>(() => {});
  const audioRef = useRef<ReturnType<typeof createFortuneAudio> | null>(null);

  phaseRef.current = phase;
  betRef.current = bet;
  turboRef.current = turbo;
  soundRef.current = sound;
  balanceRef.current = balance;
  autoRef.current = autoLeft;

  const audio = () => {
    if (!audioRef.current) {
      audioRef.current = createFortuneAudio(() => soundRef.current);
    }
    return audioRef.current!;
  };

  const clearTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;
    let assetTimeout: ReturnType<typeof setTimeout> | undefined;
    let imageFailed = false;
    const tick = window.setInterval(() => {
      const t = Math.min(92, ((Date.now() - started) / 2200) * 92);
      if (alive) setProgress(t);
    }, 80);

    const imgs = PRELOAD.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new window.Image();
          image.onload = () => resolve();
          image.onerror = () => { imageFailed = true; resolve(); };
          image.src = src;
        }),
    );

    const deadline = new Promise<void>(resolve => {
      assetTimeout = setTimeout(() => { imageFailed = true; resolve(); }, 4000);
    });
    void Promise.race([Promise.all(imgs), deadline]).then(() => {
      clearTimeout(assetTimeout);
      const rest = Math.max(0, 250 - (Date.now() - started));
      finishTimer = setTimeout(() => {
        if (!alive) return;
        setProgress(100);
        const storedBet = Number(window.localStorage.getItem("ft-bet"));
        const storedSound = window.localStorage.getItem("ft-sound");
        const storedTurbo = window.localStorage.getItem("ft-turbo");
        if (storedBet >= 10) setBet(storedBet);
        if (storedSound) setSound(storedSound !== "0");
        if (storedTurbo) setTurbo(storedTurbo === "1");
        setSplashOut(true);
        splashTimer = setTimeout(() => {
          if (alive) {
            setBooting(false);
            if (imageFailed) setToast("Some game images could not finish loading. Check your connection if artwork is missing.");
          }
        }, 200);
      }, rest);
    });

    return () => {
      alive = false;
      clearInterval(tick);
      clearTimeout(assetTimeout);
      clearTimeout(finishTimer);
      clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    if (booting) return;
    window.localStorage.setItem("ft-balance", String(balance));
  }, [balance, booting]);

  useEffect(() => {
    window.localStorage.setItem("ft-bet", String(bet));
  }, [bet]);

  useEffect(() => {
    window.localStorage.setItem("ft-sound", sound ? "1" : "0");
  }, [sound]);

  useEffect(() => {
    window.localStorage.setItem("ft-turbo", turbo ? "1" : "0");
  }, [turbo]);

  useEffect(() => {
    if (phase !== "spinning" && phase !== "featureSpin") return;
    const id = window.setInterval(() => setFlicker((n) => n + 1), turboRef.current ? 30 : 46);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (wins.length < 2 || (phase !== "win" && phase !== "bigwin" && phase !== "idle")) return;
    const id = window.setInterval(() => setActiveLine((n) => (n + 1) % wins.length), 700);
    return () => clearInterval(id);
  }, [wins, phase]);

  useEffect(() => {
    return () => {
      clearTimers();
      audio().spinStop();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    const id = window.setTimeout(() => setToast(""), 1800);
    timers.current.push(id);
  };

  const nudgeBet = (dir: 1 | -1) => {
    audio().click();
    if (dir === 1) {
      const next = BET_PRESETS.find((t) => t > bet);
      setBet(next ?? BET_PRESETS[BET_PRESETS.length - 1]);
    } else {
      const lower = [...BET_PRESETS].reverse().find((t) => t < bet);
      setBet(lower ?? BET_PRESETS[0]);
    }
  };

  const displayCell = (i: number): Cell => {
    const col = i % 3;
    if (phase === "spinning" && col >= revealedCols) {
      return SYMBOL_ORDER[(flicker + i * 2) % SYMBOL_ORDER.length]!;
    }
    if (phase === "featureSpin" && !locked[i]) {
      const featurePool: Cell[] = featureSymbol
        ? [featureSymbol, featureSymbol, featureSymbol, "wild", "blank", "blank"]
        : SYMBOL_ORDER;
      return featurePool[(flicker + i) % featurePool.length]!;
    }
    return grid[i]!;
  };

  const highlight = useMemo(() => {
    const set = new Set<number>();
    if (wins.length === 0) return set;
    if (fullScreen) {
      wins.forEach((w) => w.cells.forEach((c) => set.add(c)));
      return set;
    }
    const line = wins[activeLine % wins.length];
    line?.cells.forEach((c) => set.add(c));
    return set;
  }, [wins, activeLine, fullScreen]);

  const runSpin = useCallback(async () => {
    if (busyLock.current) return;
    busyLock.current = true;
    setPlaying(true);
    try {
    if (!await pool.resume()) {
      setAutoLeft(0);
      showToast("Previous spin needs confirmation. Please try again.");
      return;
    }
    const currentBet = betRef.current;
    if (balanceRef.current + 1e-9 < currentBet) {
      setAutoLeft(0);
      showToast("Not enough Rs.");
      return;
    }
    audio().resume();
    audio().click();
    clearTimers();
    setOverlay("none");
    setWins([]);
    setLastWin(0);
    setShownWin(0);
    setFullScreen(false);
    setBurst(false);
    setCelebrate(false);
    setFeatureSymbol(null);
    setLocked(Array(9).fill(false));
    setRevealedCols(0);

    if (!await pool.start(currentBet, undefined, {})) {
      setAutoLeft(0);
      return;
    }
    const outcome = readBrowserSlotOutcome("fortune-toucan", await pool.resolveServer({}), currentBet);
    if (!outcome) {
      setAutoLeft(0);
      showToast("Spin confirmation pending — please retry.");
      return;
    }
    const result: SpinResult = outcome.spin;
    if (autoRef.current > 0) setAutoLeft((n) => Math.max(0, n - 1));

    setPhase("spinning");
    audio().spinStart();

    const fast = turboRef.current;
    const bag = timers.current;
    await wait(fast ? 260 : 620, bag);
    const featureOpen = result.featureSteps?.[0];
    setGrid(result.type === "feature" && featureOpen ? featureOpen : result.grid);
    setRevealedCols(1);
    audio().land();
    await wait(fast ? 140 : 280, bag);
    setRevealedCols(2);
    audio().land();
    await wait(fast ? 140 : 280, bag);
    setRevealedCols(3);
    audio().land();
    audio().spinStop();

    if (result.type === "feature" && result.featureSymbol && result.featureSteps?.length) {
      setFeatureSymbol(result.featureSymbol);
      setPhase("featureIntro");
      audio().feature();
      await wait(fast ? 900 : 1600, bag);

      let prev: Cell[] = result.featureSteps[0]!.slice();
      setGrid(prev);
      setLocked(prev.map((c) => c !== "blank"));
      setPhase("featureHold");
      await wait(fast ? 180 : 320, bag);

      for (const step of result.featureSteps.slice(1)) {
        setLocked(prev.map((c) => c !== "blank"));
        setGrid(prev);
        setPhase("featureSpin");
        audio().spinStart();
        await wait(fast ? 380 : 720, bag);
        setGrid(step);
        setLocked(step.map((c) => c !== "blank"));
        setPhase("featureHold");
        audio().spinStop();
        audio().land();
        await wait(fast ? 220 : 420, bag);
        prev = step;
      }
      setGrid(result.grid);
      setLocked(result.grid.map((c) => c !== "blank"));
    }

    setHasResult(true);
    if (pool.enabled) showToast(`Daily payout pending — provisional claim ${formatMoney(result.totalWin)}`);
    setWins(result.wins);
    setActiveLine(0);
    setLastWin(result.totalWin);
    setFullScreen(result.fullScreen);
    setCelebrate(result.totalWin > 0);

    if (result.totalWin > 0) {
      const tier = winTier(result.totalWin, currentBet);
      setBurst(true);
      if (tier === "big" || tier === "super" || tier === "mega") {
        setPhase("bigwin");
        audio().win(tier);
        const dur = fast ? 900 : 1600;
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / dur);
            setShownWin(round2(result.totalWin * p));
            if (p < 1) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        setShownWin(result.totalWin);
        await wait(fast ? 500 : 900, bag);
      } else {
        setPhase("win");
        setShownWin(result.totalWin);
        audio().win("win");
        await wait(fast ? 420 : 900, bag);
      }
      setBurst(false);
    }
    } catch (error) {
      setAutoLeft(0);
      showToast(error instanceof Error ? error.message : "Spin failed. Please try again.");
    } finally {
      setPhase("idle");
      setPlaying(false);
      busyLock.current = false;
    }
  }, []);

  spinFn.current = () => {
    void runSpin();
  };

  useEffect(() => {
    if (booting || phase !== "idle" || autoLeft <= 0 || busyLock.current) return;
    const id = window.setTimeout(() => spinFn.current(), 380);
    return () => clearTimeout(id);
  }, [phase, autoLeft, booting, lastWin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (overlay !== "none") return;
      spinFn.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay]);

  const stopAuto = () => setAutoLeft(0);

  const onSpinClick = () => {
    if (autoLeft > 0) {
      stopAuto();
      return;
    }
    void runSpin();
  };

  const winningNow = (phase === "win" || phase === "bigwin" || (phase === "idle" && lastWin > 0)) && lastWin > 0;
  const tier = winTier(lastWin, bet);

  return (
    <div className="fortune-toucan-container relative h-full w-full flex items-center justify-center px-1 sm:px-4 py-1 select-none overflow-hidden">
      <div className="ft-root">
        <div className="ft-device">
          {booting && <Splash progress={progress} ready={splashOut} />}

          <header className="ft-top">
            <div className="flex items-center gap-1.5">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/50 bg-black/60 hover:bg-black/80 px-2.5 py-1 text-xs font-semibold text-amber-300 transition hover:scale-105 active:scale-95 cursor-pointer"
              >
                ← Back
              </Link>
              <button
                type="button"
                className="ft-icon-btn"
                aria-label="Menu"
                onClick={() => {
                  audio().click();
                  setOverlay("menu");
                }}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
            <div className="ft-logo">
              <small>FORTUNE</small>
              <strong>TOUCAN</strong>
            </div>
          <div className="ft-top-right">
            <button
              type="button"
              className="ft-round"
              aria-label={sound ? "Mute" : "Unmute"}
              onClick={() => {
                setSound((s) => !s);
                audio().click();
              }}
            >
              {sound ? "♪" : "×"}
            </button>
            <button
              type="button"
              className="ft-round"
              aria-label="Paytable"
              onClick={() => {
                audio().click();
                setOverlay("pay");
              }}
            >
              i
            </button>
          </div>
        </header>

        <div className="ft-stage">
          <div className={`ft-hero ${celebrate ? "is-win" : ""}`}>
            <img src="/images/toucan-mascot.png" alt="Fortune Toucan" className="ft-mascot" />
            <div className={`ft-x10 ${fullScreen && winningNow ? "is-hot" : ""}`}>
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 font-black text-amber-950">
                <span className="text-[10px] tracking-wider uppercase leading-none text-amber-900 font-extrabold">MAX</span>
                <span className="text-xl leading-none font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">10X</span>
              </div>
            </div>
          </div>

          <div className="ft-cabinet">
            <div className="ft-cabinet-shine" />
            <div className={`ft-reels ${winningNow ? "is-paying" : ""}`} role="grid" aria-label="Fortune Toucan reels">
              {Array.from({ length: 9 }, (_, i) => {
                const cell = displayCell(i);
                const meta = cellImage(cell);
                const col = i % 3;
                const spinning =
                  (phase === "spinning" && col >= revealedCols) ||
                  (phase === "featureSpin" && !locked[i]);
                const isWin = winningNow && highlight.has(i);
                return (
                  <div
                    key={i}
                    className={[
                      "ft-cell",
                      spinning ? "is-spin" : "",
                      isWin ? "is-win" : "",
                      locked[i] ? "is-lock" : "",
                      cell === "blank" ? "is-blank" : "",
                    ].join(" ")}
                    role="gridcell"
                  >
                    {meta && (
                      <img
                        src={meta.src}
                        alt={meta.name}
                        className="ft-sym"
                        draggable={false}
                      />
                    )}
                    {locked[i] && <em className="ft-pin">●</em>}
                  </div>
                );
              })}
            </div>
            {winningNow && wins.length > 0 && (
              <div className="ft-line-tag">
                {fullScreen
                  ? "ALL WAYS ×10"
                  : `LINE ${(wins[activeLine % wins.length]?.line ?? 0) + 1}`}
              </div>
            )}
          </div>

          <div className={`ft-winmeter ${lastWin > 0 ? "has-win" : ""}`}>
            {lastWin > 0 ? (
              <>
                <span>{pool.enabled ? "PROVISIONAL CLAIM" : "WIN"}</span>
                <strong>{formatMoney(phase === "bigwin" ? shownWin : lastWin)}</strong>
              </>
            ) : (
              <em>{pool.enabled && hasResult && phase === "idle" ? "Daily payout pending · claim 0" : "Good luck"}</em>
            )}
          </div>
        </div>

        {burst && (
          <div className="ft-coins" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <i
                key={i}
                className="ft-coin"
                style={{
                  ["--dx" as string]: `${Math.cos((i / 18) * Math.PI * 2) * (80 + (i % 5) * 16)}px`,
                  ["--dy" as string]: `${Math.sin((i / 18) * Math.PI * 2) * (60 + (i % 4) * 18) - 20}px`,
                  animationDelay: `${i * 16}ms`,
                }}
              />
            ))}
          </div>
        )}

        {phase === "featureIntro" && featureSymbol && <FeatureIntro symbol={featureSymbol} />}
        {phase === "bigwin" && (tier === "big" || tier === "super" || tier === "mega") && (
          <BigWinOverlay amount={lastWin} shown={shownWin} tier={tier} provisional={pool.enabled} />
        )}

        <footer className="ft-dock">
          <div className="ft-meters">
            <div>
              <span>BALANCE</span>
              <b>{formatMoney(balance)}</b>
            </div>
            <div>
              <span>BET</span>
              <b>{formatMoney(bet)}</b>
            </div>
          </div>

          <div className="ft-controls">
            <button
              type="button"
              className={`ft-side ${autoLeft > 0 ? "is-on" : ""}`}
              onClick={() => {
                audio().click();
                if (autoLeft > 0) stopAuto();
                else setOverlay("auto");
              }}
            >
              AUTO
              {autoLeft > 0 && <small>{autoLeft}</small>}
            </button>

            <div className="ft-betbox">
              <button type="button" onClick={() => nudgeBet(-1)} aria-label="Decrease bet" disabled={busy}>
                −
              </button>
              <button
                type="button"
                className="ft-betval"
                onClick={() => {
                  audio().click();
                  setOverlay("bet");
                }}
                disabled={busy}
              >
                {formatMoney(bet)}
              </button>
              <button type="button" onClick={() => nudgeBet(1)} aria-label="Increase bet" disabled={busy}>
                +
              </button>
            </div>

            <button
              type="button"
              className={`ft-spin ${busy ? "is-busy" : ""} ${autoLeft > 0 ? "is-stop" : ""}`}
              onClick={onSpinClick}
              aria-label={autoLeft > 0 ? "Stop auto" : "Spin"}
            >
              {autoLeft > 0 ? "STOP" : busy ? "..." : "SPIN"}
            </button>

            <button
              type="button"
              className={`ft-side ${turbo ? "is-on" : ""}`}
              onClick={() => {
                audio().click();
                setTurbo((t) => !t);
              }}
            >
              TURBO
            </button>
          </div>
          <p className="ft-legal">Rs. balance · 5 paylines</p>
        </footer>

        {toast && <div className="ft-toast">{toast}</div>}

        <MenuSheet
          open={overlay === "menu"}
          sound={sound}
          turbo={turbo}
          onClose={() => setOverlay("none")}
          onOpen={(o) => setOverlay(o)}
          onToggleSound={() => setSound((s) => !s)}
          onToggleTurbo={() => setTurbo((t) => !t)}
        />
        <PaytableModal open={overlay === "pay"} bet={bet} onClose={() => setOverlay("none")} />
        <RulesModal open={overlay === "rules"} onClose={() => setOverlay("none")} />
        <BetModal
          open={overlay === "bet"}
          bet={bet}
          balance={balance}
          onBet={(n) => {
            audio().click();
            setBet(n);
          }}
          onMax={() => {
            audio().click();
            setBet(Math.max(1, Math.floor(balance)));
            setOverlay("none");
          }}
          onClose={() => setOverlay("none")}
        />
        <AutoModal
          open={overlay === "auto"}
          onPick={(n) => {
            audio().click();
            setOverlay("none");
            setAutoLeft(n);
          }}
          onClose={() => setOverlay("none")}
        />
      </div>
    </div>
    </div>
  );
}
