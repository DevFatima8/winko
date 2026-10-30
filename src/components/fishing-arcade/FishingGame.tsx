"use client";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FishingEngine | null>(null);
  const balanceRef = useRef(balance);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState<Snapshot>({ ...INITIAL, balance });
  const [betIdx, setBetIdx] = useState(2);
  const [customBet, setCustomBet] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [auto, setAuto] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [noFunds, setNoFunds] = useState(false);
  const [bigWin, setBigWin] = useState<(BigWinInfo & { key: number }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* ---------- responsive scaling of the 1280x720 stage ---------- */
  useLayoutEffect(() => {
    const fit = () => {
      const availW = Math.max(320, window.innerWidth - 16);
      const availH = Math.max(320, window.innerHeight - 16);
      setScale(Math.min(availW / W, availH / H));
    };
    fit();
    setReady(true);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
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
        if (bal < BETS[0]) setNoFunds(true);
        else showToast("Not enough Rs. for this bet – lower your bet");
      },
    });
    engine.setBalance(balanceRef.current);
    void recoverBrowserProjectiles("fishing-arcade").then(async recovery => {
      if (disposed) return;
      if (recovery.snapshot) await engine.restore(recovery.snapshot as EngineRecovery, recovery.activeIds);
      if (disposed) return;
      engineRef.current = engine;
      engine.setBalance(balanceRef.current);
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
  }, [betIdx]);

  useEffect(() => {
    engineRef.current?.setCustomBet(customBet);
  }, [customBet]);

  useEffect(() => {
    engineRef.current?.setAuto(auto);
  }, [auto]);

  useEffect(() => {
    engineRef.current?.setInputEnabled(started && !showPay && !noFunds);
  }, [started, showPay, noFunds]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (!bigWin) return;
    const id = setTimeout(() => setBigWin(null), 3000);
    return () => clearTimeout(id);
  }, [bigWin]);

  // out of coins
  useEffect(() => {
    if (!started || snap.balance >= BETS[0]) return;
    const id = setTimeout(() => {
      if (balanceRef.current < BETS[0]) setNoFunds(true);
    }, 2000);
    return () => clearTimeout(id);
  }, [snap.balance, started]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "+" || e.key === "=") { setCustomBet(null); setBetIdx((i) => Math.min(BETS.length - 1, i + 1)); }
      if (e.key === "ArrowLeft" || e.key === "-") { setCustomBet(null); setBetIdx((i) => Math.max(0, i - 1)); }
      if (e.key === "a" || e.key === "A") setAuto((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- handlers ---------- */
  const changeBet = (d: number) => {
    initAudio();
    sfx.click();
    setCustomBet(null);
    setBetIdx((i) => Math.max(0, Math.min(BETS.length - 1, i + d)));
  };

  const pickBet = (idx: number) => {
    initAudio();
    sfx.click();
    setCustomBet(null);
    setBetIdx(idx);
  };

  const startGame = () => {
    initAudio();
    sfx.click();
    setStarted(true);
  };

  const toggleFullscreen = () => {
    sfx.click();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="fishing-arcade-container relative flex h-full w-full items-center justify-center overflow-hidden p-1 select-none">
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#02152b]">
        <div
        className="relative shrink-0"
        style={{ width: W * scale, height: H * scale, opacity: ready ? 1 : 0, transition: "opacity .3s" }}
      >
        <div
          className="font-arcade absolute top-0 left-0 overflow-hidden"
          style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}
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
            <div className="panel absolute top-[76px] left-6 w-[250px] px-3 py-2">
              <div className="flex justify-between text-[10px] font-bold text-sky-100">
                <span className="text-emerald-300">WIN {snap.wins}</span>
                <span className="text-orange-300">PLAT {snap.platformCuts}</span>
                <span>SHOTS {snap.shots}</span>
              </div>
            </div>

            {/* top-right buttons */}
            <div className="absolute top-4 right-5 flex items-center gap-3">
              <button
                className={`hud-btn !w-auto px-4 text-[15px] font-black tracking-wider transition-all hover:scale-105 active:scale-95 ${
                  auto
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
            <div className="panel absolute bottom-6 left-6 flex h-16 w-[250px] items-center gap-3 px-3">
              <CoinIcon size={40} />
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] font-bold tracking-[0.2em] text-sky-200">BALANCE</div>
                <div className="text-[28px] font-black text-yellow-300 tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
                  {formatNum(snap.balance)}
                </div>
              </div>
            </div>

            {/* last win */}
            <div className="panel absolute right-6 bottom-6 flex h-16 w-[250px] items-center gap-3 px-3">
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
              <div className="panel flex h-[54px] w-[370px] items-center justify-between rounded-[28px] px-2">
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
                    <input
                      type="number"
                      min={10}
                      step={1}
                      inputMode="numeric"
                      aria-label="Custom bet amount"
                      value={customBet ?? BETS[betIdx]}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        setCustomBet(Number.isFinite(n) && n > 0 ? n : null);
                      }}
                      className="w-24 bg-transparent text-center text-[24px] font-black text-yellow-300 tabular-nums outline-none"
                    />
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
              <div className="absolute bottom-[60px] left-1/2 flex -translate-x-1/2 gap-1.5">
                {BETS.map((b, i) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => pickBet(i)}
                    className={`rounded-full border-2 px-3 py-1 text-[13px] font-black tabular-nums transition-all cursor-pointer ${
                      customBet === null && betIdx === i
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
                <button
                  onClick={startGame}
                  className="start-btn pointer-events-auto mt-10 rounded-full border-4 border-emerald-300 bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-700 px-16 py-4 text-[34px] font-black tracking-widest text-white shadow-[0_0_30px_rgba(16,185,129,0.7)] hover:from-emerald-300 hover:to-green-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  PLAY
                </button>
                <div className="mt-6 text-[14px] font-bold tracking-wider text-sky-100/90">
                  Rs. balance · Just for fun
                </div>
              </div>
            </div>
          )}

          {/* ============== PAYTABLE ============== */}
          {showPay && (
            <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/65">
              <div className="panel relative w-[920px] px-8 py-6">
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
              <div className="panel w-[560px] px-8 py-8 text-center">
                <div className="gold-text text-[52px] leading-none">OUT OF Rs.</div>
                <p className="mt-3 text-[16px] font-bold text-sky-100">
                  Insufficient balance.
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
