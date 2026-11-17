"use client";
import { gameBetError, MIN_GAME_BET, MAX_GAME_BET } from "@/lib/gameBetLimits";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGameBalance, useDailyPoolMode, acceptBrowserProjectile, completeBrowserProjectile, recoverBrowserProjectiles, saveBrowserEngine } from "@/lib/walletSync";
import { BETS, H, SPECIES, START_BALANCE, W, WIN_RATE, LOSS_RATE, PLATFORM_RATE, formatMult, formatNum } from "./game/config";
import { FishingEngine, type BigWinInfo, type Snapshot, type EngineRecovery } from "./game/engine";
import { initAudio, setSoundEnabled, sfx } from "./game/sound";
import "./fishing-arcade.css";
import FishIcon from "./FishIcon";

const INITIAL: Snapshot = {
  balance: START_BALANCE,
  lastWin: 0,
  shots: 0,
  wins: 0,
  losses: 0,
  totalBet: 0,
  totalWon: 0,
  platformCuts: 0,
};

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const k = Math.min(1, (now - t0) / 1200);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{formatNum(v)}</>;
}

function CoinIcon({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, #fff7b0, #ffc928 55%, #d98a06)",
        border: "3px solid #8a5205",
        boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.4)",
      }}
    />
  );
}

export default function FishingGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance, setBalance] = useGameBalance("fishing-arcade", START_BALANCE);
  const poolEnabled = useDailyPoolMode();
  const viewportRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FishingEngine | null>(null);
  const balanceRef = useRef(balance);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scale, setScale] = useState(1);
  const [stageWidth, setStageWidth] = useState(W);
  const stageWidthRef = useRef(W);
  const [ready, setReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [needsLandscape, setNeedsLandscape] = useState(false);
  const [snap, setSnap] = useState<Snapshot>({ ...INITIAL, balance });
  const [betIdx, setBetIdx] = useState(2);
  const [customBet, setCustomBet] = useState<number | null>(null);
  const [editingBet, setEditingBet] = useState<"start" | "game" | null>(null);
  const [started, setStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [auto, setAuto] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const noFunds = started && balance < MIN_GAME_BET;
  const [bigWin, setBigWin] = useState<(BigWinInfo & { key: number }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* ---------- responsive scaling of the 1280x720 stage ---------- */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const portrait = window.matchMedia("(max-width: 1023px) and (orientation: portrait)");
    const updateOrientation = () => setNeedsLandscape(portrait.matches);
    const fit = () => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      const width = Math.max(960, H * viewport.clientWidth / viewport.clientHeight);
      stageWidthRef.current = width;
      setStageWidth(width);
      setScale(Math.min(viewport.clientWidth / width, viewport.clientHeight / H));
      engineRef.current?.setViewportWidth(width);
    };
    fit();
    updateOrientation();
    setReady(true);
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    portrait.addEventListener("change", updateOrientation);
    return () => {
      observer.disconnect();
      portrait.removeEventListener("change", updateOrientation);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ---------- sync engine balance when wallet updates ---------- */
  useEffect(() => {
    if (Math.abs(balance - balanceRef.current) > 0.01) {
      balanceRef.current = balance;
      engineRef.current?.setBalance(balance);
    }
  }, [balance]);

  /* ---------- engine lifecycle ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const engine = new FishingEngine(canvas, {
      onChange: (s) => {
        setSnap(s);
      },
      onAccept: (wagerId, stake, outcome, snapshot) => acceptBrowserProjectile("fishing-arcade", wagerId, stake, outcome, snapshot),
      onComplete: async (wagerId, claim) => {
        try { return !!await completeBrowserProjectile("fishing-arcade", wagerId, claim); }
        catch { showToast("Projectile result is saved. Reopen this game to confirm its exact result."); return false; }
      },
      onCheckpoint: snapshot => saveBrowserEngine("fishing-arcade", snapshot),
      onBigWin: (info) => setBigWin({ ...info, key: Date.now() }),
      onNoFunds: (bal) => {
        setAuto(false);
        if (bal >= MIN_GAME_BET) showToast("Not enough Rs. for this bet – lower your bet");
      },
    });
    engine.setBalance(balanceRef.current);
    engine.setViewportWidth(stageWidthRef.current);
    void recoverBrowserProjectiles("fishing-arcade").then(async recovery => {
      if (disposed) return;
      if (recovery.snapshot) await engine.restore(recovery.snapshot as EngineRecovery, recovery.activeIds);
      if (disposed) return;
      engineRef.current = engine;
      engine.setBalance(balanceRef.current);
      setEngineReady(true);
      engine.start();
    }).catch(() => showToast("Saved projectiles need wallet confirmation. Reopen this game after reconnecting."));
    return () => {
      disposed = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, [showToast, setBalance]);

  useEffect(() => {
    engineRef.current?.setBetIndex(betIdx);
  }, [betIdx, engineReady]);

  useEffect(() => {
    engineRef.current?.setCustomBet(customBet);
  }, [customBet, engineReady]);

  useEffect(() => {
    engineRef.current?.setAuto(auto);
  }, [auto, engineReady]);

  useEffect(() => {
    engineRef.current?.setInputEnabled(started && !showPay && !noFunds && !needsLandscape);
  }, [started, showPay, noFunds, needsLandscape, engineReady]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (!bigWin) return;
    const id = setTimeout(() => setBigWin(null), 3000);
    return () => clearTimeout(id);
  }, [bigWin]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (needsLandscape) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "+" || e.key === "=") { setCustomBet(null); setBetIdx((i) => Math.min(BETS.length - 1, i + 1)); }
      if (e.key === "ArrowLeft" || e.key === "-") { setCustomBet(null); setBetIdx((i) => Math.max(0, i - 1)); }
      if (e.key === "a" || e.key === "A") setAuto((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needsLandscape]);

  /* ---------- handlers ---------- */
  const changeBet = (d: number) => {
    initAudio();
    sfx.click();
    setEditingBet(null);
    setCustomBet(null);
    setBetIdx((i) => Math.max(0, Math.min(BETS.length - 1, i + d)));
  };

  const pickBet = (idx: number) => {
    initAudio();
    sfx.click();
    setEditingBet(null);
    setCustomBet(null);
    setBetIdx(idx);
  };

  const startGame = () => {
    const stake = customBet ?? BETS[betIdx];
    const limitError = gameBetError(stake);
    if (limitError) {
      showToast(limitError);
      return;
    }
    if (!Number.isSafeInteger(stake) || stake < MIN_GAME_BET || stake > balanceRef.current) {
      showToast("Enter a bet of at least Rs. 10 within your balance.");
      return;
    }
    initAudio();
    sfx.click();
    setEditingBet(null);
    setStarted(true);
  };

  const enterLandscape = async () => {
    try {
      if (!document.fullscreenElement) await gameRef.current?.requestFullscreen();
      const orientation = screen.orientation;
      if ("lock" in orientation && typeof orientation.lock === "function") await orientation.lock("landscape");
      else showToast("Turn your phone sideways to play.");
    } catch (error) {
      console.warn("[fishing landscape]", error);
      showToast("Turn your phone sideways.");
    }
  };

  const toggleFullscreen = async () => {
    sfx.click();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (gameRef.current?.requestFullscreen) await gameRef.current.requestFullscreen();
      else showToast("Fullscreen is unavailable in this browser. Turn your phone sideways.");
    } catch (error) {
      console.warn("[fishing fullscreen]", error);
      showToast("Fullscreen is unavailable. Turn your phone sideways to play.");
    }
  };

  return (
    <div ref={gameRef} className="fishing-arcade-container relative flex h-full w-full items-center justify-center overflow-hidden select-none">
      {needsLandscape && (
        <div role="status" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#02152b] p-6 text-center text-sky-100">
          <svg aria-hidden="true" viewBox="0 0 64 64" className="h-16 w-16 text-yellow-300" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="20" y="12" width="24" height="40" rx="4" transform="rotate(35 32 32)" />
            <path d="M8 28A25 25 0 0 1 43 7M43 7h-9m9 0v9M56 36A25 25 0 0 1 21 57m0 0h9m-9 0v-9" />
          </svg>
          <h2 className="text-xl font-black text-yellow-300">Rotate your phone</h2>
          <p className="max-w-xs text-sm leading-relaxed">
            Turn your phone sideways (landscape) to play Fishing Arcade.
          </p>
          <button type="button" onClick={() => void enterLandscape()} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold">
            Enable landscape
          </button>
          {toast && <p role="status" className="text-sm text-yellow-200">{toast}</p>}
          <Link href={backHref} className="mt-2 rounded-xl border border-sky-400/50 px-4 py-2 text-sm font-bold text-sky-200">
            Back to games
          </Link>
        </div>
      )}
      <div ref={viewportRef} inert={needsLandscape} className="flex h-full w-full items-center justify-center overflow-hidden bg-[#02152b]">
        <div
          className="relative shrink-0"
          style={{ width: stageWidth * scale, height: H * scale, opacity: ready ? 1 : 0, transition: "opacity .3s" }}
        >
          <div
            className="font-arcade absolute top-0 left-0 overflow-hidden"
            style={{ width: stageWidth, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ cursor: started && !showPay && !noFunds ? "none" : "default", touchAction: "none" }}
            />

            {/* ================= HUD ================= */}
            <div className="pointer-events-none absolute inset-0">
              {/* logo + Back */}
              <div className="absolute top-3 left-6 flex items-center gap-3">
                <Link
                  href={backHref}
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-sky-400/50 bg-[#072448]/90 px-3 py-1.5 text-xs font-black text-sky-200 shadow-md hover:bg-sky-500 hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  ← Back
                </Link>
                <div className="leading-none">
                  <div className="gold-text text-[32px] tracking-wide italic">FISHING</div>
                  <div className="gold-text -mt-1 ml-1 text-[18px] tracking-[0.35em]">ARCADE</div>
                </div>
              </div>

              {/* stats */}
              <div className="fishing-panel absolute top-[76px] left-6 w-[250px] px-3 py-2">
                <div className="flex justify-between text-[10px] font-bold text-sky-100">
                  <span className="text-emerald-300">WIN {snap.wins}</span>
                  <span className="text-orange-300">PLAT {snap.platformCuts}</span>
                  <span>SHOTS {snap.shots}</span>
                </div>
              </div>

              {/* top-right buttons */}
              <div className="absolute top-4 right-5 flex items-center gap-3">
                <button
                  className={`hud-btn !w-auto px-4 text-[15px] font-black tracking-wider transition-all hover:scale-105 active:scale-95 ${auto
                      ? "bg-gradient-to-r from-emerald-500 to-green-600 border-emerald-300 text-white shadow-[0_0_15px_rgba(16,185,129,0.7)]"
                      : "bg-[#072448]/90 text-sky-200 border-sky-400/40"
                    }`}
                  onClick={() => {
                    initAudio();
                    sfx.click();
                    setAuto((v) => !v);
                  }}
                  title="Auto fire (A) – click a fish to lock on"
                >
                  AUTO {auto ? "ON" : "OFF"}
                </button>
                <button
                  className="hud-btn transition-all hover:scale-105 active:scale-95"
                  onClick={() => {
                    initAudio();
                    setSoundOn((v) => !v);
                    sfx.click();
                  }}
                  title="Sound"
                >
                  <span className="text-[22px]">{soundOn ? "🔊" : "🔇"}</span>
                </button>
                <button
                  className="hud-btn transition-all hover:scale-105 active:scale-95"
                  onClick={() => {
                    sfx.click();
                    setShowPay(true);
                  }}
                  title="Paytable & help"
                >
                  <span className="text-[24px] font-black">?</span>
                </button>
                <button className="hud-btn transition-all hover:scale-105 active:scale-95" onClick={toggleFullscreen} title="Fullscreen">
                  <span className="text-[22px]">⛶</span>
                </button>
              </div>

              {/* balance */}
              <div className="fishing-panel absolute bottom-6 left-6 flex h-16 w-[250px] items-center gap-3 px-3">
                <CoinIcon size={40} />
                <div className="min-w-0 leading-tight">
                  <div className="text-[11px] font-bold tracking-[0.2em] text-sky-200">BALANCE</div>
                  <div className="text-[28px] font-black text-yellow-300 tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
                    {formatNum(snap.balance)}
                  </div>
                </div>
              </div>

              {/* last win */}
              <div className="fishing-panel absolute right-6 bottom-6 flex h-16 w-[250px] items-center gap-3 px-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald-300 to-emerald-600 text-[22px] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.35)]">
                  🏆
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-[11px] font-bold tracking-[0.2em] text-sky-200">{poolEnabled ? "LAST CLAIM" : "LAST WIN"}</div>
                  <div className="text-[28px] font-black text-emerald-300 tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
                    {formatNum(snap.lastWin)}
                  </div>
                </div>
              </div>

              {/* total won tiny */}
              <div className="absolute right-7 bottom-[96px] text-right text-[11px] font-bold tracking-wider text-sky-100/90 drop-shadow-[0_1px_0_rgba(0,0,0,0.7)]">
                TOTAL BET {formatNum(snap.totalBet)} · {poolEnabled ? "PROVISIONAL CLAIMS · DAILY PAYOUT PENDING" : "TOTAL WON"} {formatNum(snap.totalWon)}
              </div>

              {/* bet panel (cannon base) */}
              <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2">
                <div className="fishing-panel pointer-events-auto flex h-[54px] w-[370px] items-center justify-between rounded-[28px] px-2">
                  <button
                    className="bet-btn text-white rounded-full bg-gradient-to-b from-rose-600 to-red-800 hover:from-rose-500 hover:to-red-700 active:scale-90 transition-all font-black text-2xl flex items-center justify-center cursor-pointer shadow-md"
                    onClick={() => changeBet(-1)}
                    disabled={betIdx === 0 && customBet === null}
                    aria-label="Decrease bet"
                  >
                    −
                  </button>
                  <div className="text-center leading-none">
                    <div className="text-[10px] font-bold tracking-[0.3em] text-sky-200">BET</div>
                    <div className="mt-1 flex items-center justify-center gap-2 text-[24px] font-black text-yellow-300 tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
                      <CoinIcon size={20} />
                      {editingBet === "game" ? <input
                        autoFocus
                        type="number"
                        min={10}
                        max={MAX_GAME_BET}
                        step={1}
                        inputMode="numeric"
                        aria-label="Custom bet amount"
                        value={customBet ?? BETS[betIdx]}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value));
                          setCustomBet(Number.isFinite(n) && n > 0 ? n : null);
                        }}
                        className="w-24 bg-transparent text-center text-[24px] font-black text-yellow-300 tabular-nums outline-none"
                      /> : <output aria-label="Selected bet per shot">{customBet ?? BETS[betIdx]}</output>}
                      <button type="button" aria-label={editingBet === "game" ? "Done editing bet" : "Edit custom bet"}
                        onClick={() => setEditingBet(editingBet === "game" ? null : "game")}
                        className="rounded border border-sky-300/60 px-2 py-1 text-[12px] text-sky-100">
                        {editingBet === "game" ? "Done" : "Edit"}
                      </button>
                    </div>
                  </div>
                  <button
                    className="bet-btn text-white rounded-full bg-gradient-to-b from-emerald-500 to-green-700 hover:from-emerald-400 hover:to-green-600 active:scale-90 transition-all font-black text-2xl flex items-center justify-center cursor-pointer shadow-md"
                    onClick={() => changeBet(1)}
                    disabled={betIdx === BETS.length - 1 && customBet === null}
                    aria-label="Increase bet"
                  >
                    +
                  </button>
                </div>
                <div className="pointer-events-auto absolute bottom-[60px] left-1/2 flex -translate-x-1/2 gap-1.5">
                  {BETS.map((b, i) => (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={customBet === null && betIdx === i}
                      onClick={() => pickBet(i)}
                      className={`rounded-full border-2 px-3 py-1 text-[13px] font-black tabular-nums transition-all cursor-pointer ${customBet === null && betIdx === i
                          ? "border-yellow-300 bg-yellow-400 text-[#08244a]"
                          : "border-sky-300/50 bg-[#08244a]/90 text-sky-100 hover:border-yellow-300"
                        }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* toast */}
              {toast && (
                <div className="toast-in absolute top-[92px] left-1/2 -translate-x-1/2 rounded-full border-2 border-yellow-300 bg-[#08244a]/95 px-6 py-2 text-[16px] font-bold text-white shadow-lg">
                  {toast}
                </div>
              )}
            </div>

            {/* ============== BIG WIN ============== */}
            {bigWin && (
              <div key={bigWin.key} className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="bigwin-rays absolute" />
                <div className="bigwin-card relative text-center">
                  <div className="gold-text text-[104px] leading-none">{poolEnabled ? "PROVISIONAL CLAIM" : bigWin.mult >= 25 ? "MEGA WIN" : "BIG WIN"}</div>
                  <div className="mt-1 text-[22px] font-black tracking-widest text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.7)]">
                    {bigWin.name.toUpperCase()} · x{formatMult(bigWin.mult)}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-4">
                    <CoinIcon size={58} />
                    <span className="gold-text text-[72px] leading-none tabular-nums">
                      <CountUp value={bigWin.amount} />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ============== START SCREEN ============== */}
            {!started && (
              <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(8,60,120,0.35),rgba(2,12,34,0.8))]">
                <div className="text-center">
                  <div className="gold-text float-y text-[132px] leading-[0.95] italic">FISHING</div>
                  <div className="gold-text -mt-1 text-[56px] tracking-[0.55em]">ARCADE</div>
                  <div className="mt-4 text-[22px] font-black tracking-[0.3em] text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.7)]">
                    SHOOT · CATCH · WIN
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3 text-xl font-bold text-white">
                    Bet per shot (Rs.)
                    {editingBet === "start" ? <input autoFocus type="number" min={10} max={MAX_GAME_BET} step={1} inputMode="numeric"
                      aria-label="Starting bet per shot" value={customBet ?? BETS[betIdx]}
                      onChange={event => setCustomBet(Math.floor(Number(event.target.value)))}
                      className="w-36 rounded-xl border-2 border-yellow-300 bg-slate-950 px-3 py-2 text-center text-yellow-200" />
                      : <output aria-label="Starting bet per shot" className="min-w-24 rounded-xl border-2 border-yellow-300 bg-slate-950 px-3 py-2 text-yellow-200">{customBet ?? BETS[betIdx]}</output>}
                    <button type="button" aria-label={editingBet === "start" ? "Done editing starting bet" : "Edit starting bet"}
                      onClick={() => setEditingBet(editingBet === "start" ? null : "start")}
                      className="rounded-lg border border-sky-300 px-3 py-2 text-sm">
                      {editingBet === "start" ? "Done" : "Edit"}
                    </button>
                  </div>
                  <div className="mt-3 flex justify-center gap-2">
                    {BETS.map((amount, index) => (
                      <button type="button" key={amount} onClick={() => pickBet(index)}
                        aria-pressed={customBet === null && betIdx === index}
                        className="rounded-lg border border-sky-300 bg-sky-950 px-3 py-2 font-bold text-white">{amount}</button>
                    ))}
                  </div>
                  <button
                    onClick={startGame}
                    disabled={!engineReady}
                    className="start-btn pointer-events-auto mt-10 rounded-full border-4 border-emerald-300 bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-700 px-16 py-4 text-[34px] font-black tracking-widest text-white shadow-[0_0_30px_rgba(16,185,129,0.7)] hover:from-emerald-300 hover:to-green-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    {engineReady ? "CONFIRM BET & PLAY" : "CONNECTING..."}
                  </button>
                  <div className="mt-6 text-[14px] font-bold tracking-wider text-sky-100/90">
                    Each shot costs your selected amount. No bet is placed until you shoot.
                  </div>
                </div>
              </div>
            )}

            {/* ============== PAYTABLE ============== */}
            {showPay && (
              <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/65">
                <div className="fishing-panel relative w-[920px] px-8 py-6">
                  <button
                    className="hud-btn absolute -top-4 -right-4"
                    onClick={() => {
                      sfx.click();
                      setShowPay(false);
                    }}
                    aria-label="Close"
                  >
                    <span className="text-[22px] font-black">✕</span>
                  </button>
                  <div className="gold-text text-center text-[44px] leading-none">PAYTABLE</div>
                  <div className="mt-1 text-center text-[14px] font-bold tracking-wider text-sky-200">
                    Win = your bet × the fish multiplier
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-4">
                    {SPECIES.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex flex-col items-center rounded-2xl border-2 border-sky-400/40 bg-[#0a2c58]/80 py-2"
                      >
                        <FishIcon sp={sp} />
                        <div className="text-[14px] font-bold text-white">{sp.name}</div>
                        <div className="gold-text text-[26px] leading-none">x{formatMult(sp.mult)}</div>
                      </div>
                    ))}
                    <div className="flex flex-col justify-center rounded-2xl border-2 border-yellow-300/50 bg-[#0a2c58]/80 px-4 py-2 text-[13px] leading-snug font-bold text-sky-100">
                      <div className="mb-1 text-[15px] text-yellow-300">HOW TO PLAY</div>
                      <div>• Click / tap to shoot, hold to keep firing</div>
                      <div>• AUTO locks onto the fish you click</div>
                      <div>• − / + changes your bet (←/→ keys)</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-black/30 px-4 py-2 text-center text-[14px] font-bold text-sky-100">
                    Aim for high-multiplier fish and mega boss creatures to win massive coin rewards!
                  </div>
                </div>
              </div>
            )}

            {/* ============== OUT OF COINS ============== */}
            {noFunds && (
              <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/70">
                <div className="fishing-panel w-[560px] px-8 py-8 text-center">
                  <div className="gold-text text-[52px] leading-none">OUT OF Rs.</div>
                  <p className="mt-3 text-[16px] font-bold text-sky-100">
                    Insufficient balance for the minimum Rs. {MIN_GAME_BET} shot.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
