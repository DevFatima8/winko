"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { readBrowserSlotOutcome, type BrowserSlotOutcomes } from "@/lib/browserSlotTypes";
import { readSlotPresentation, saveSlotPresentation } from "@/lib/browserSlotPresentation";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Volume2,
  VolumeX,
  History,
  Info,
  Maximize,
  Play,
  Square,
  Zap,
  Plus,
  Minus,
  Sparkles,
  Trophy,
  X,
  ChevronRight,
  RotateCw,
  Crown,
  Gift,
} from "lucide-react";
import {
  BET_OPTIONS,
  DEFAULT_BET,
  FREE_SPINS,
  PAYLINES,
  REELS,
  ROWS,
  START_BALANCE,
  SYMBOLS,
  formatMoney,
  scatterFreeMult,
  type FreeMode,
  type SymbolId,
} from "../game/config";
import {
  generateSpin,
  lossFallbackGrid,
  randomGrid,
  rollLubuSticky,
  type Cell,
  type Grid,
  type LineWin,
  type SpinResult,
} from "../game/engine";
import { sound } from "../game/sound";
import SlotSymbol from "./SlotSymbol";
import { cn } from "../lib/cn";
import BetAmountInput from "@/components/BetAmountInput";

/* ============================== types ============================== */

interface FreeState {
  active: boolean;
  mode: FreeMode;
  remaining: number;
  total: number;
  totalWin: number;
  mult: number;
  single: boolean;
}

interface HistoryEntry {
  id: number;
  bet: number;
  win: number;
  scatters: number;
  free: boolean;
  time: string;
}

interface BigWinState {
  tier: string;
  amount: number;
  bet: number;
  cn: string;
}

function savedBonus() {
  const saved = readSlotPresentation("diao-chan");
  if (!saved) return null;
  const mode = saved.mode ?? saved.outcome.singleMode;
  const total = mode ? saved.outcome.freeModes[mode]?.length ?? 0 : 0;
  const free: FreeState | null = mode && total > saved.cursor ? {
    active: true, mode, remaining: total - saved.cursor, total, totalWin: 0, mult: 1,
    single: saved.outcome.spin.scatterCount === 2,
  } : null;
  const pendingChoice = !mode && saved.outcome.spin.scatterCount === 3 ? { count: 3, mult: 1 } : null;
  return { ...saved, free, pendingChoice };
}

const FLICKER: SymbolId[] = [
  "N", "T", "J", "Q", "K", "A", "lotus", "rings", "soldier",
  "dong", "lubu", "N", "T", "J", "Q", "K", "A", "wild",
];

const DUST = [
  { l: "6%", t: "12%", d: "0s", s: "5px" },
  { l: "14%", t: "68%", d: "1.2s", s: "4px" },
  { l: "22%", t: "30%", d: "0.6s", s: "6px" },
  { l: "31%", t: "82%", d: "2s", s: "4px" },
  { l: "42%", t: "8%", d: "1.6s", s: "5px" },
  { l: "55%", t: "55%", d: "0.3s", s: "4px" },
  { l: "63%", t: "22%", d: "2.4s", s: "6px" },
  { l: "71%", t: "74%", d: "1s", s: "5px" },
  { l: "80%", t: "40%", d: "1.9s", s: "4px" },
  { l: "88%", t: "62%", d: "0.8s", s: "6px" },
  { l: "94%", t: "16%", d: "2.2s", s: "4px" },
  { l: "48%", t: "92%", d: "1.4s", s: "5px" },
];

const FEED_NAMES = [
  "Ahmed K.", "Li Wei", "Fatima S.", "Chen Bo", "Usman T.", "Mei Lin",
  "Bilal R.", "Zhang Yu", "Ayesha M.", "Wang Tao", "Hamza J.", "Liu Fang",
];

function bigWinTier(win: number, bet: number): BigWinState | null {
  if (bet <= 0) return null;
  const r = win / bet;
  if (r >= 100) return { tier: "LEGENDARY WIN", amount: win, bet, cn: "傳奇" };
  if (r >= 50) return { tier: "SUPER WIN", amount: win, bet, cn: "超級" };
  if (r >= 25) return { tier: "MEGA WIN", amount: win, bet, cn: "巨獎" };
  if (r >= 10) return { tier: "BIG WIN", amount: win, bet, cn: "大獎" };
  return null;
}

/* ============================== small components ============================== */

function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 12, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative max-h-[86dvh] w-full overflow-hidden rounded-2xl border-2 border-[#d9a441] bg-gradient-to-b from-[#3a0d12] via-[#22060a] to-[#120304] shadow-[0_0_60px_rgba(217,164,65,0.25)]",
              wide ? "max-w-lg" : "max-w-sm",
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#d9a441]/15 to-transparent" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalHeader({ title, cnText, onClose }: { title: string; cnText: string; onClose: () => void }) {
  return (
    <div className="relative flex items-center justify-between border-b border-[#d9a441]/30 bg-black/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-b from-[#e33d3d] to-[#8f1010] font-cn text-sm text-white shadow">
          {cnText}
        </span>
        <h2 className="font-display text-sm font-black tracking-[0.14em] text-[#f5d67b]">{title}</h2>
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d9a441]/40 bg-black/40 text-[#f5d67b] transition hover:bg-[#d9a441]/20"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/* ============================== main game ============================== */

export default function GameScreen() {
  // deterministic first paint (SSR-safe), randomized on mount
  const [grid, setGrid] = useState<Grid>(() => lossFallbackGrid());
  const [spinning, setSpinning] = useState(false);
  const [spinningReels, setSpinningReels] = useState<boolean[]>([false, false, false, false, false]);
  const [balance] = useGameBalance("diao-chan", START_BALANCE);
  const pool = usePoolLifecycle("diao-chan");
  const [serverOutcome, setServerOutcome] = useState<BrowserSlotOutcomes["diao-chan"] | null>(() => savedBonus()?.outcome ?? null);
  const serverOutcomeRef = useRef(serverOutcome);
  serverOutcomeRef.current = serverOutcome;
  const requestInFlight = useRef(false);
  const [bet, setBet] = usePoolRoundState("diao-chan", "bet", DEFAULT_BET);
  const [lastBet, setLastBet] = usePoolRoundState("diao-chan", "lastBet", () => savedBonus()?.outcome.stake ?? DEFAULT_BET);
  const [win, setWin] = useState(0);
  const [displayWin, setDisplayWin] = useState(0);
  const [lineWins, setLineWins] = useState<LineWin[]>([]);
  const [scatterCells, setScatterCells] = useState<Cell[]>([]);
  const [scatterCount, setScatterCount] = useState(0);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [expandedReels, setExpandedReels] = useState<number[]>([]);
  const [free, setFree] = usePoolRoundState<FreeState | null>("diao-chan", "free", () => savedBonus()?.free ?? null);
  const [pendingChoice, setPendingChoice] = usePoolRoundState<{ count: number; mult: number } | null>("diao-chan", "pendingChoice", () => savedBonus()?.pendingChoice ?? null);
  const [freeComplete, setFreeComplete] = useState<{ totalWin: number; spins: number } | null>(null);
  const [auto, setAuto] = useState<{ active: boolean; remaining: number | null }>({
    active: false,
    remaining: null,
  });
  const [turbo, setTurbo] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [betOpen, setBetOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTab, setPayTab] = useState<"symbols" | "lines" | "rules">("symbols");
  const [autoOpen, setAutoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bigWin, setBigWin] = useState<BigWinState | null>(null);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const [banner, setBanner] = useState("PLACE YOUR BET · 30 LINES");
  const [feed, setFeed] = useState<{ name: string; amount: number; id: number }[]>([]);
  const [spinCount, setSpinCount] = useState(0);

  const timers = useRef<number[]>([]);
  const flickerTimer = useRef<number | null>(null);
  const idCounter = useRef(1);

  // live refs for timeout logic
  const spinningRef = useRef(false);
  const balanceRef = useRef(balance);
  const betRef = useRef(bet);
  const lastBetRef = useRef(lastBet);
  const freeRef = useRef<FreeState | null>(free);
  const plannedFree = useRef<FreeState | null>(null);
  const autoRef = useRef(auto);
  const pendingChoiceRef = useRef(pendingChoice);
  const freeCompleteRef = useRef(freeComplete);
  const bigWinRef = useRef<BigWinState | null>(null);
  const turboRef = useRef(turbo);
  const spinningReelsRef = useRef<boolean[]>([false, false, false, false, false]);
  const spinFn = useRef<() => void>(() => { });

  balanceRef.current = balance;
  betRef.current = bet;
  lastBetRef.current = lastBet;
  freeRef.current = free;
  autoRef.current = auto;
  pendingChoiceRef.current = pendingChoice;
  freeCompleteRef.current = freeComplete;
  bigWinRef.current = bigWin;
  turboRef.current = turbo;
  spinningReelsRef.current = spinningReels;

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      setToast({ msg, id: Date.now() });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ---------- persistence + mount ---------- */
  useEffect(() => {
    try {
      const s = localStorage.getItem("htdc_sound");
      if (s !== null) {
        setSoundOn(s === "1");
        sound.setEnabled(s === "1");
      }
      const bt = localStorage.getItem("htdc_bet");
      if (bt !== null && Number(bt) > 0) setBet(Number(bt));
      const h = localStorage.getItem("htdc_history");
      if (h) setHistory(JSON.parse(h) as HistoryEntry[]);
    } catch {
      /* ignore */
    }
    const saved = savedBonus();
    const previousFree = saved?.mode && saved.cursor > 0
      ? saved.outcome.freeModes[saved.mode]?.[saved.cursor - 1]
      : null;
    setGrid(previousFree?.grid ?? saved?.outcome.spin.grid ?? randomGrid(1));
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      timers.current.forEach((t) => window.clearTimeout(t));
      if (flickerTimer.current) window.clearInterval(flickerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("htdc_balance", String(balance));
    } catch {
      /* ignore */
    }
  }, [balance]);

  useEffect(() => {
    try {
      localStorage.setItem("htdc_history", JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }, [history]);

  /* ---------- fake live-wins ticker (desktop sides) ---------- */
  useEffect(() => {
    const tick = () => {
      const name = FEED_NAMES[(Math.random() * FEED_NAMES.length) | 0];
      const amount = Math.round((50 + Math.random() * Math.random() * 40000) * 100) / 100;
      setFeed((f) => [{ name, amount, id: Date.now() + Math.random() }, ...f].slice(0, 7));
    };
    tick();
    const t = window.setInterval(tick, 4200);
    return () => window.clearInterval(t);
  }, []);

  /* ---------- win count-up ---------- */
  useEffect(() => {
    if (win <= 0) {
      setDisplayWin(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = Math.min(1400, 350 + win * 1.5);
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayWin(win * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [win]);

  /* ---------- win-line cycling ---------- */
  useEffect(() => {
    if (spinning || lineWins.length === 0) {
      setActiveLine(null);
      return;
    }
    setActiveLine(null);
    let idx = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      setActiveLine(0);
      interval = window.setInterval(() => {
        idx = (idx + 1) % lineWins.length;
        setActiveLine(idx);
      }, 900);
    }, 1500);
    return () => {
      window.clearTimeout(start);
      if (interval) window.clearInterval(interval);
    };
  }, [lineWins, spinning]);

  const visibleLines = useMemo(() => {
    if (lineWins.length === 0) return [];
    if (activeLine === null) return lineWins;
    return [lineWins[activeLine % lineWins.length]];
  }, [lineWins, activeLine]);

  const winCellSet = useMemo(() => {
    const s = new Set<string>();
    visibleLines.forEach((w) => w.cells.forEach((c) => s.add(`${c.reel}-${c.row}`)));
    if (scatterCount >= 2) scatterCells.forEach((c) => s.add(`${c.reel}-${c.row}`));
    return s;
  }, [visibleLines, scatterCells, scatterCount]);

  const hasWinShow = !spinning && (lineWins.length > 0 || scatterCount >= 2);
  const freeActive = free?.active && free.remaining > 0;

  /* ============================== spin flow ============================== */

  const scheduleNext = useCallback(
    (delay: number) => {
      later(() => {
        if (bigWinRef.current || pendingChoiceRef.current || freeCompleteRef.current) {
          scheduleNext(800);
          return;
        }
        const f = freeRef.current;
        const needFree = !!f?.active && f.remaining > 0;
        const a = autoRef.current;
        const needAuto =
          a.active && (a.remaining === null || a.remaining > 0);
        if (needFree || needAuto) spinFn.current();
      }, delay);
    },
    [later],
  );

  const fireConfetti = useCallback((big: boolean) => {
    const colors = ["#f5d67b", "#d9a441", "#e33d3d", "#fff3c4", "#7a1620"];
    confetti({ particleCount: big ? 160 : 60, spread: big ? 100 : 70, origin: { y: 0.6 }, colors });
    if (big) {
      window.setTimeout(
        () => confetti({ particleCount: 100, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }),
        250,
      );
      window.setTimeout(
        () => confetti({ particleCount: 100, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }),
        450,
      );
    }
  }, []);

  const finishSpin = useCallback(
    async (result: SpinResult, spinBet: number, wasFree: boolean) => {
      const f = freeRef.current;
      const verified = !!serverOutcomeRef.current;
      const mult = wasFree && f ? f.mult : 1;
      const effectiveWin = Math.round(result.totalWin * mult * 100) / 100;

      setGrid(result.grid);
      setLineWins(result.lineWins);
      setScatterCells(result.scatterCells);
      setScatterCount(result.scatterCount);
      setExpandedReels(result.expandedReels);
      setWin(effectiveWin);
      setLastBet(spinBet);
      setSpinCount((c) => c + 1);

      if (!verified && effectiveWin > 0 && !await pool.award(effectiveWin)) return;

      const entry: HistoryEntry = {
        id: idCounter.current++,
        bet: spinBet,
        win: effectiveWin,
        scatters: result.scatterCount,
        free: wasFree,
        time: new Date().toLocaleTimeString(),
      };
      setHistory((h) => [entry, ...h].slice(0, 50));

      // retrigger math for free spins
      let retriggerAdd = 0;
      if (wasFree && f && result.scatterCount >= 3) {
        retriggerAdd = FREE_SPINS[f.mode].spins;
      }

      if (wasFree && f) {
        const newRemaining = f.remaining - 1 + retriggerAdd;
        const newTotalWin = Math.round((f.totalWin + effectiveWin) * 100) / 100;
        const done = newRemaining <= 0;
        if (retriggerAdd > 0) {
          showToast(`RETRIGGER! +${retriggerAdd} FREE SPINS`);
          sound.fanfare();
        }
        if (done) {
          if (!verified && !await pool.complete(0)) return;
          setFree(null);
          freeRef.current = null;
          if (newTotalWin > 0) {
            later(() => {
              setFreeComplete({ totalWin: newTotalWin, spins: f.total });
              sound.winBig();
              fireConfetti(true);
            }, effectiveWin > 0 ? 900 : 100);
          } else {
            setBanner(pool.enabled ? "FREE SPINS COMPLETE — DAILY PAYOUT PENDING" : "FREE SPINS COMPLETE — NO WIN");
          }
        } else {
          const nf: FreeState = {
            ...f,
            remaining: newRemaining,
            totalWin: newTotalWin,
            total: f.total + retriggerAdd,
          };
          setFree(nf);
          freeRef.current = nf;
        }
      }

      // base-game scatter triggers
      if (!wasFree) {
        if (!verified && result.scatterCount < 2 && !await pool.complete(0)) return;
        if (result.scatterCount >= 3) {
          const m = scatterFreeMult(result.scatterCount);
          sound.fanfare();
          fireConfetti(false);
          later(() => {
            setPendingChoice({ count: result.scatterCount, mult: m });
            pendingChoiceRef.current = { count: result.scatterCount, mult: m };
            setBanner(`${result.scatterCount} SCATTERS — CHOOSE YOUR DESTINY!`);
          }, 700);
        } else if (result.scatterCount === 2) {
          const nf = plannedFree.current;
          if (!nf) return;
          const mode = nf.mode;
          sound.scatter();
          showToast(`2 SCATTERS — 1 FREE SPIN (${FREE_SPINS[mode].title} power)!`);
          setFree(nf);
          freeRef.current = nf;
        }
      }

      // sounds + banner + big win
      const tier = bigWinTier(effectiveWin, spinBet);
      if (tier) {
        sound.winBig();
        later(() => {
          setBigWin(tier);
          fireConfetti(true);
          const coin = window.setInterval(() => sound.coin(), 320);
          window.setTimeout(() => window.clearInterval(coin), 2200);
        }, 500);
        setBanner(`${pool.enabled ? "PROVISIONAL CLAIM" : tier.tier} — ${formatMoney(effectiveWin)}`);
      } else if (effectiveWin > 0) {
        if (effectiveWin >= spinBet) sound.winBig();
        else sound.winSmall();
        setBanner(
          pool.enabled ? `PROVISIONAL CLAIM — ${formatMoney(effectiveWin)}` : wasFree
            ? `FREE SPIN WIN — ${formatMoney(effectiveWin)}`
            : `WIN — ${formatMoney(effectiveWin)} · ${result.lineWins.length} LINE${result.lineWins.length === 1 ? "" : "S"}`,
        );
      } else {
        setBanner(pool.enabled ? "DAILY PAYOUT PENDING — PROVISIONAL SPIN CLAIM 0" : wasFree ? "FREE SPIN — NO WIN" : "NO WIN — SPIN AGAIN!");
      }

      // auto stop check
      const a = autoRef.current;
      if (a.active && a.remaining !== null && a.remaining <= 0) {
        setAuto({ active: false, remaining: null });
        showToast("AUTO SPINS COMPLETE");
      }

      setSpinning(false);
      spinningRef.current = false;
      setSpinningReels([false, false, false, false, false]);

      const t = turboRef.current;
      const delay = tier ? 5800 : effectiveWin > 0 ? (t ? 800 : 1500) : t ? 350 : 650;
      if (verified && ((!wasFree && result.scatterCount < 2) || (wasFree && f && f.remaining <= 1))) {
        setServerOutcome(null);
        serverOutcomeRef.current = null;
        saveSlotPresentation("diao-chan", null);
      } else if (verified && wasFree && f) {
        const saved = readSlotPresentation("diao-chan");
        if (saved) saveSlotPresentation("diao-chan", { ...saved, cursor: f.total - f.remaining + 1 });
      }
      scheduleNext(delay);
    },
    [fireConfetti, later, scheduleNext, showToast],
  );

  const spin = useCallback(async () => {
    if (spinningRef.current || requestInFlight.current) return;
    if (pendingChoiceRef.current || freeCompleteRef.current || bigWinRef.current) return;
    sound.unlock();

    const f = freeRef.current;
    const wasFree = !!f?.active && f.remaining > 0;
    const spinBet = wasFree ? lastBetRef.current : betRef.current;

    if (!wasFree && balanceRef.current < spinBet) {
      showToast("INSUFFICIENT BALANCE");
      return;
    }
    requestInFlight.current = true;
    let result: SpinResult;
    if (!wasFree) {
      if (!await pool.start(spinBet, undefined, {})) { requestInFlight.current = false; return; }
      const outcome = readBrowserSlotOutcome("diao-chan", await pool.resolveServer({}), spinBet);
      if (!outcome) {
        requestInFlight.current = false;
        setAuto({ active: false, remaining: null });
        showToast("Spin confirmation pending — please retry.");
        return;
      }
      setServerOutcome(outcome);
      serverOutcomeRef.current = outcome;
      saveSlotPresentation("diao-chan", outcome.spin.scatterCount >= 2
        ? { outcome, cursor: 0, mode: outcome.singleMode } : null);
      result = outcome.spin;
    } else if (serverOutcomeRef.current && f) {
      const outcome = readBrowserSlotOutcome("diao-chan", serverOutcomeRef.current, spinBet);
      const prepared = outcome?.freeModes[f.mode]?.[f.total - f.remaining];
      if (!prepared) {
        requestInFlight.current = false;
        showToast("Free-spin confirmation unavailable. Reopen this game.");
        return;
      }
      result = prepared;
    } else {
      // Only a pre-migration accepted bonus retains the legacy completion path.
      const sticky: Cell[] = f?.mode === "lubu" ? rollLubuSticky() : [];
      result = generateSpin({ wantWin: Math.random() < 0.5, lineBet: spinBet / 30, totalBet: spinBet,
        mode: f?.mode ?? null, sticky });
    }
    const effectiveWin = Math.round(result.totalWin * (wasFree && f ? f.mult : 1) * 100) / 100;
    let nextFree: FreeState | null = null;
    let nextChoice: { count: number; mult: number } | null = null;
    if (wasFree && f) {
      const retrigger = result.scatterCount >= 3 ? FREE_SPINS[f.mode].spins : 0;
      const remaining = f.remaining - 1 + retrigger;
      if (remaining > 0) nextFree = { ...f, remaining, total: f.total + retrigger, totalWin: Math.round((f.totalWin + effectiveWin) * 100) / 100 };
    } else if (result.scatterCount >= 3) {
      nextChoice = { count: result.scatterCount, mult: scatterFreeMult(result.scatterCount) };
    } else if (result.scatterCount === 2) {
      const modes: FreeMode[] = ["diaochan", "dongzhuo", "lubu"];
      nextFree = { active: true, mode: serverOutcomeRef.current?.singleMode ?? modes[(Math.random() * 3) | 0],
        remaining: 1, total: 1, totalWin: 0, mult: 1, single: true };
    }
    plannedFree.current = nextFree;
    pool.checkpoint({ bet: betRef.current, lastBet: spinBet, free: nextFree, pendingChoice: nextChoice, sampledSpin: result });
    const steps: { action: "award" | "complete"; amount: number }[] = [];
    if (effectiveWin > 0) steps.push({ action: "award", amount: effectiveWin });
    if (!nextFree && !nextChoice) steps.push({ action: "complete", amount: 0 });
    if (!serverOutcomeRef.current && steps.length) pool.queue(steps);

    if (!wasFree) {
      if (balanceRef.current < spinBet) {
        showToast("INSUFFICIENT BALANCE");
        sound.click();
        return;
      }
      setLastBet(spinBet);
      const a = autoRef.current;
      if (a.active && a.remaining !== null) {
        setAuto({ active: true, remaining: Math.max(0, a.remaining - 1) });
      }
    }

    spinningRef.current = true;
    requestInFlight.current = false;
    setSpinning(true);
    setSpinningReels([true, true, true, true, true]);
    setWin(0);
    setDisplayWin(0);
    setLineWins([]);
    setActiveLine(null);
    setScatterCells([]);
    setScatterCount(0);
    setExpandedReels([]);
    setBanner(wasFree ? `FREE SPIN ${f!.total - f!.remaining + 1} / ${f!.total}` : "GOOD LUCK!");
    sound.spin();

    // flicker animation on spinning reels
    if (flickerTimer.current) window.clearInterval(flickerTimer.current);
    flickerTimer.current = window.setInterval(() => {
      setGrid((prev) =>
        prev.map((col, i) =>
          spinningReelsRef.current[i]
            ? [0, 1, 2].map(() => FLICKER[(Math.random() * FLICKER.length) | 0])
            : col,
        ),
      );
    }, 90);

    const turbo = turboRef.current;
    const base = turbo ? 450 : 950;
    const step = turbo ? 180 : 380;
    for (let i = 0; i < REELS; i++) {
      later(() => {
        setGrid((prev) => {
          const next = prev.map((c) => [...c]);
          next[i] = [...result.grid[i]];
          return next;
        });
        setSpinningReels((prev) => {
          const next = [...prev];
          next[i] = false;
          return next;
        });
        sound.reelStop(i);
        if (i === REELS - 1) {
          if (flickerTimer.current) {
            window.clearInterval(flickerTimer.current);
            flickerTimer.current = null;
          }
          later(() => finishSpin(result, spinBet, wasFree), turbo ? 120 : 280);
        }
      }, base + i * step);
    }
  }, [finishSpin, later, showToast]);

  spinFn.current = spin;

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!betOpen && !payOpen && !autoOpen && !historyOpen) spinFn.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [betOpen, payOpen, autoOpen, historyOpen]);

  /* ---------- actions ---------- */
  const chooseFreeMode = (mode: FreeMode) => {
    const p = pendingChoiceRef.current;
    if (!p) return;
    const saved = readSlotPresentation("diao-chan");
    if (serverOutcomeRef.current && !serverOutcomeRef.current.freeModes[mode]) return;
    if (saved) saveSlotPresentation("diao-chan", { ...saved, mode, cursor: 0 });
    sound.fanfare();
    const nf: FreeState = {
      active: true,
      mode,
      remaining: FREE_SPINS[mode].spins,
      total: FREE_SPINS[mode].spins,
      totalWin: 0,
      mult: p.mult,
      single: false,
    };
    setFree(nf);
    freeRef.current = nf;
    setPendingChoice(null);
    pendingChoiceRef.current = null;
    setBanner(`${FREE_SPINS[mode].title.toUpperCase()} FREE SPINS — ${nf.total} SPINS ×${p.mult}`);
    scheduleNext(600);
  };

  const collectFree = () => {
    sound.button();
    setFreeComplete(null);
    freeCompleteRef.current = null;
    setBanner("PLACE YOUR BET · 30 LINES");
    scheduleNext(400);
  };

  const stopAuto = () => {
    setAuto({ active: false, remaining: null });
    sound.click();
    showToast("AUTOPLAY STOPPED");
  };

  const startAuto = (n: number | null) => {
    setAuto({ active: true, remaining: n });
    setAutoOpen(false);
    sound.button();
    showToast(n === null ? "AUTOPLAY: UNLIMITED" : `AUTOPLAY: ${n} SPINS`);
    if (!spinningRef.current) later(() => spinFn.current(), 400);
  };

  const cycleBet = (dir: 1 | -1) => {
    if (spinningRef.current || freeActive) return;
    sound.bet();
    const cur = betRef.current;
    const next =
      dir === 1
        ? (BET_OPTIONS.find((o) => o > cur) ?? BET_OPTIONS[BET_OPTIONS.length - 1])
        : ([...BET_OPTIONS].reverse().find((o) => o < cur) ?? BET_OPTIONS[0]);
    setBet(next);
    try {
      localStorage.setItem("htdc_bet", String(next));
    } catch {
      /* ignore */
    }
  };

  const toggleSound = () => {
    const v = !soundOn;
    setSoundOn(v);
    sound.setEnabled(v);
    try {
      localStorage.setItem("htdc_sound", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* ignore */
    }
  };

  /* ============================== render ============================== */

  const lineBet = lastBet / 30;

  return (
    <div className="relative h-full w-full flex flex-col justify-between overflow-hidden bg-[#0d0204] font-body text-white select-none px-1.5 sm:px-3 py-1">
      {/* ===== background ===== */}
      <div className="pointer-events-none fixed inset-0">
        <img
          src="/images/bg-palace.jpg"
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0204]/80 via-[#2b060b]/40 to-[#0d0204]/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />
        {DUST.map((d, i) => (
          <span
            key={i}
            className="gold-dust absolute rounded-full bg-[#f5d67b]"
            style={{ left: d.l, top: d.t, width: d.s, height: d.s, animationDelay: d.d }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-stretch justify-center gap-4 overflow-hidden px-0">
        {/* ===== left desktop panel ===== */}
        <aside className="hidden w-60 flex-col gap-3 self-center xl:flex max-h-full overflow-y-auto py-1">
          <div className="panel rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Crown size={16} className="text-[#f5d67b]" />
              <h3 className="font-display text-xs font-black tracking-[0.2em] text-[#f5d67b]">
                TOP PAYS ×5
              </h3>
            </div>
            {(["wild", "lubu", "dong", "soldier"] as SymbolId[]).map((id) => (
              <div key={id} className="mb-2 flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#d9a441]/50 bg-black/40">
                  <img
                    src={SYMBOLS[id].img}
                    alt={SYMBOLS[id].name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#ffe9b0]">{SYMBOLS[id].name}</p>
                  <p className="font-display text-sm font-black text-[#f5d67b]">
                    {(SYMBOLS[id].pays[5] ?? 0).toLocaleString()}×
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="panel rounded-2xl p-4 text-[11px] leading-relaxed text-[#e8c98a]/90">
            <div className="mb-2 flex items-center gap-2">
              <Gift size={14} className="text-[#f5d67b]" />
              <h3 className="font-display text-xs font-black tracking-[0.2em] text-[#f5d67b]">
                FREE SPINS
              </h3>
            </div>
            <p>Land <b className="text-white">3+ Phoenix Scatters</b> to choose your destiny:</p>
            <ul className="mt-2 space-y-1.5">
              <li><b className="text-white">Diao Chan · 8</b> — Expanding Wilds</li>
              <li><b className="text-white">Dong Zhuo · 10</b> — Wild ×4</li>
              <li><b className="text-white">Lu Bu · 12</b> — Sticky + Transform</li>
            </ul>
            <p className="mt-2">4 Scatters double, 5+ quadruple all bonus wins.</p>
          </div>
        </aside>

        {/* ===== center game column ===== */}
        <main className="flex h-full w-full max-w-[430px] flex-col justify-between overflow-hidden bg-gradient-to-b from-black/50 via-transparent to-black/70 sm:rounded-2xl sm:border sm:border-[#d9a441]/25 sm:shadow-[0_0_80px_rgba(0,0,0,0.8)]">
          {/* header */}
          <header className="flex items-center justify-between gap-2 px-2.5 pt-1 sm:pt-2 shrink-0">
            <button
              onClick={() => { sound.button(); setPayOpen(true); }}
              className="icon-btn"
              aria-label="Paytable & rules"
            >
              <Info size={18} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-gradient-to-b from-[#e33d3d] to-[#8f1010] px-1.5 py-0.5 font-cn text-xs leading-none text-white shadow">
                  貂蝉美人计
                </span>
              </div>
              <h1 className="gold-text font-display mt-0.5 truncate text-center text-sm sm:text-[17px] font-black leading-none tracking-wide">
                HONEY TRAP OF DIAO CHAN
              </h1>
              <p className="mt-0.5 text-[9px] font-bold tracking-[0.3em] text-[#e8b64c]/70">
                ★ 30 FIXED LINES ★
              </p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={toggleSound} className="icon-btn" aria-label="Sound">
                {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button onClick={() => { sound.button(); setHistoryOpen(true); }} className="icon-btn" aria-label="History">
                <History size={18} />
              </button>
              <button onClick={toggleFullscreen} className="icon-btn hidden sm:flex" aria-label="Fullscreen">
                <Maximize size={18} />
              </button>
            </div>
          </header>

          {/* balance bar */}
          <div className="mx-2 sm:mx-3 mt-1 sm:mt-1.5 grid grid-cols-3 gap-1.5 shrink-0">
            <div className="meter">
              <span className="meter-label">Balance</span>
              <span className="meter-value flex items-center justify-center gap-1">
                {formatMoney(balance)}
              </span>
            </div>
            <div className="meter">
              <span className="meter-label">Bet</span>
              <span className="meter-value">{formatMoney(freeActive ? lastBet : bet)}</span>
            </div>
            <div className={cn("meter", win > 0 && "meter-win")}>
              <span className="meter-label">Win</span>
              <span className="meter-value text-[#ffe9b0]">{formatMoney(displayWin)}</span>
            </div>
          </div>

          {/* free spins status */}
          <AnimatePresence>
            {freeActive && free && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-3 mt-2 overflow-hidden"
              >
                <div className="flex items-center justify-between rounded-xl border border-[#ff9d2e]/50 bg-gradient-to-r from-[#5c1400] via-[#8f2a00] to-[#5c1400] px-3 py-1.5 shadow-[0_0_20px_rgba(255,157,46,0.35)]">
                  <div className="flex items-center gap-2">
                    <img src={FREE_SPINS[free.mode].img} alt="" className="h-8 w-8 rounded-full border border-[#ffd76a] object-cover" draggable={false} />
                    <div>
                      <p className="font-display text-[11px] font-black tracking-widest text-[#ffd76a]">
                        {FREE_SPINS[free.mode].title.toUpperCase()} · {free.single ? "SINGLE FREE SPIN" : "FREE SPINS"}
                      </p>
                      <p className="text-[10px] text-white/80">
                        Spin {free.total - free.remaining + 1}/{free.total} · {pool.enabled ? "Provisional claims" : "Won"} {formatMoney(free.totalWin)}{free.mult > 1 ? ` · ×${free.mult}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd76a] to-[#9c6207] font-display text-lg font-black text-[#3d0a0a]">
                    {free.remaining}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== reels ===== */}
          <div className="flex flex-1 flex-col justify-center px-2 sm:px-3 py-1 sm:py-1.5 min-h-0 overflow-hidden">
            <div className="gold-frame relative rounded-2xl p-1 sm:p-[7px]">
              <span className="frame-jewel left-1 top-1" />
              <span className="frame-jewel right-1 top-1" />
              <span className="frame-jewel bottom-1 left-1" />
              <span className="frame-jewel bottom-1 right-1" />
              <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#ffd76a]/60 bg-gradient-to-b from-[#5c0d14] to-[#22060a] px-3 py-0.5 font-display text-[10px] font-black tracking-[0.25em] text-[#ffd76a] shadow-lg">
                ✦ HONEY TRAP ✦
              </div>
              <div className="relative rounded-xl bg-gradient-to-b from-[#2b060b] to-[#120304] p-2 shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]">
                <div className="relative">
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 1, 2, 3, 4].map((reel) => (
                      <div
                        key={reel}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-lg p-1 transition-all",
                          expandedReels.includes(reel)
                            ? "bg-[#d9a441]/20 shadow-[0_0_18px_rgba(217,164,65,0.6)]"
                            : "bg-black/30",
                        )}
                      >
                        {[0, 1, 2].map((row) => {
                          const id = grid[reel]?.[row] ?? "N";
                          const key = `${reel}-${row}`;
                          const isWin = winCellSet.has(key);
                          const isScatter = scatterCount >= 2 && id === "scatter";
                          return (
                            <div
                              key={row}
                              className={cn(
                                "reel-cell relative aspect-square overflow-hidden rounded-md",
                                isWin && !spinning && "reel-cell-win",
                              )}
                            >
                              <SlotSymbol
                                id={id}
                                spinning={spinningReels[reel]}
                                dim={hasWinShow && !isWin}
                                win={isWin && !spinning && id !== "scatter"}
                                scatterWin={isScatter && !spinning}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* win-line overlay */}
                  {hasWinShow && visibleLines.length > 0 && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 500 300"
                      preserveAspectRatio="none"
                    >
                      {visibleLines.map((w) => {
                        const pts = PAYLINES[w.lineIndex]
                          .map((row, reel) => `${((reel + 0.5) / 5) * 500},${((row + 0.5) / 3) * 300}`)
                          .join(" ");
                        return (
                          <g key={w.lineIndex}>
                            <polyline
                              points={pts}
                              fill="none"
                              stroke="#ff5d5d"
                              strokeWidth="9"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              opacity="0.55"
                            />
                            <polyline
                              points={pts}
                              fill="none"
                              stroke="#ffd76a"
                              strokeWidth="3.5"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              className="win-line-dash"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  {/* spin shimmer */}
                  {spinning && <div className="reel-shimmer pointer-events-none absolute inset-0 rounded-lg" />}
                </div>
              </div>
            </div>

            {/* banner */}
            <div className="mt-1 sm:mt-1.5 flex h-7 sm:h-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#d9a441]/30 bg-black/50 px-2 sm:px-3">
              <AnimatePresence mode="wait">
                <motion.p
                  key={banner + String(win > 0)}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "truncate font-display text-[13px] font-black tracking-[0.12em]",
                    win > 0 && !spinning ? "gold-text" : "text-[#e8c98a]",
                  )}
                >
                  {win > 0 && !spinning ? `★ ${banner} ★` : banner}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* ===== controls ===== */}
          <div className="mx-2 sm:mx-3 mb-1 shrink-0 rounded-2xl border border-[#d9a441]/30 bg-gradient-to-b from-[#3a0d12]/95 to-[#160405]/95 p-2 sm:p-2.5 shadow-[0_-4px_30px_rgba(0,0,0,0.6)] backdrop-blur">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* left: auto + turbo */}
              <div className="flex flex-col gap-1.5">
                {auto.active ? (
                  <button onClick={stopAuto} className="relative flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/60 bg-gradient-to-b from-rose-600/40 to-red-950/60 p-2 sm:p-2.5 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4)] transition active:scale-95">
                    <Square size={14} className="fill-rose-300" />
                    <span className="text-[10px] font-black tracking-wider">STOP</span>
                    {auto.remaining !== null && (
                      <span className="auto-badge">{auto.remaining}</span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => { sound.button(); setAutoOpen(true); }}
                    disabled={spinning && !freeActive}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/50 bg-gradient-to-b from-cyan-600/30 to-blue-900/40 p-2 sm:p-2.5 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)] transition hover:from-cyan-500/40 hover:to-blue-800/50 disabled:opacity-40 active:scale-95"
                  >
                    <Play size={14} className="fill-cyan-300" />
                    <span className="text-[10px] font-black tracking-wider">AUTO</span>
                  </button>
                )}
                <button
                  onClick={() => { sound.click(); setTurbo((t) => !t); }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border p-2 sm:p-2.5 text-[10px] font-black tracking-wider transition active:scale-95",
                    turbo
                      ? "border-amber-400/80 bg-gradient-to-b from-amber-500/40 to-yellow-900/50 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
                      : "border-purple-500/40 bg-gradient-to-b from-purple-700/25 to-purple-950/40 text-purple-200 hover:from-purple-600/35"
                  )}
                >
                  <Zap size={14} className={turbo ? "fill-amber-300 text-amber-300" : "text-purple-300"} />
                  <span>TURBO</span>
                </button>
              </div>

              {/* center: spin */}
              <div className="flex flex-col items-center">
                <button
                  onClick={spin}
                  disabled={spinning}
                  className={cn(
                    "spin-btn transition-transform active:scale-95",
                    spinning && "spin-btn-busy",
                    freeActive && "ring-4 ring-amber-400 ring-offset-2 ring-offset-black"
                  )}
                  style={{
                    background: "conic-gradient(from 180deg, #ffd700, #ff8c00, #ff0055, #ff8c00, #ffd700)",
                    boxShadow: "0 0 25px rgba(255, 140, 0, 0.6), inset 0 0 15px rgba(255, 215, 0, 0.5)"
                  }}
                  aria-label="Spin"
                >
                  <span className="spin-btn-inner" style={{ background: "radial-gradient(circle at 35% 30%, #b91c1c 0%, #7f1d1d 55%, #450a0a 100%)" }}>
                    {spinning ? (
                      <RotateCw size={30} className="animate-spin text-[#ffe9b0]" />
                    ) : freeActive ? (
                      <span className="flex flex-col items-center leading-none">
                        <span className="font-display text-2xl font-black text-[#ffe9b0]">{free?.remaining}</span>
                        <span className="text-[8px] font-black tracking-widest text-[#ffd76a]">FREE</span>
                      </span>
                    ) : (
                      <span className="flex flex-col items-center leading-none">
                        <RotateCw size={26} className="text-[#ffe9b0]" />
                        <span className="mt-0.5 font-display text-[11px] font-black tracking-widest text-[#ffd76a]">
                          SPIN
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              </div>

              {/* right: bet */}
              <div className="flex flex-col items-stretch gap-1.5">
                <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-black/60 px-1 py-1">
                  <button onClick={() => cycleBet(-1)} className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-b from-amber-500/30 to-amber-900/30 text-amber-300 hover:from-amber-500/50 transition border border-amber-500/30 active:scale-95" aria-label="Decrease bet">
                    <Minus size={14} />
                  </button>
                  <button
                    onClick={() => { if (!spinning && !freeActive) { sound.button(); setBetOpen(true); } }}
                    className="flex min-w-0 flex-1 flex-col items-center leading-none"
                  >
                    <span className="text-[8px] font-bold tracking-[0.25em] text-[#e8b64c]/70">BET</span>
                    <span className="font-display text-sm sm:text-base font-black text-[#ffe9b0]">
                      {formatMoney(freeActive ? lastBet : bet)}
                    </span>
                  </button>
                  <button onClick={() => cycleBet(1)} className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-b from-amber-500/30 to-amber-900/30 text-amber-300 hover:from-amber-500/50 transition border border-amber-500/30 active:scale-95" aria-label="Increase bet">
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (spinning || freeActive) return;
                    sound.bet();
                    setBet(BET_OPTIONS[BET_OPTIONS.length - 1]);
                  }}
                  className="rounded-lg border border-amber-400/60 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 py-1.5 text-[10px] font-black tracking-widest text-black shadow-[0_0_14px_rgba(245,158,11,0.35)] transition hover:brightness-110 active:scale-95"
                >
                  MAX BET
                </button>
              </div>
            </div>
          </div>

        </main>

        {/* ===== right desktop panel ===== */}
        <aside className="hidden w-60 flex-col gap-3 self-center xl:flex max-h-full overflow-y-auto py-1">
          <div className="panel rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy size={16} className="text-[#f5d67b]" />
              <h3 className="font-display text-xs font-black tracking-[0.2em] text-[#f5d67b]">
                LIVE WINS
              </h3>
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {feed.map((f) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-bold text-white/80">{f.name}</span>
                    <span className="font-display font-black text-[#7dff9a]">
                      {formatMoney(f.amount)}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div className="panel rounded-2xl p-4 text-[11px] text-[#e8c98a]/90">
            <h3 className="font-display mb-2 text-xs font-black tracking-[0.2em] text-[#f5d67b]">
              YOUR SESSION
            </h3>
            <div className="flex justify-between py-1">
              <span>Spins</span>
              <b className="text-white">{spinCount}</b>
            </div>
            <button
              onClick={() => { sound.button(); setHistoryOpen(true); }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[#d9a441]/40 py-1.5 text-[11px] font-black tracking-widest text-[#ffd76a] transition hover:bg-[#d9a441]/15"
            >
              FULL HISTORY <ChevronRight size={13} />
            </button>
          </div>
        </aside>
      </div>

      {/* ===== toast ===== */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="fixed bottom-36 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#ffd76a]/60 bg-gradient-to-b from-[#3a0d12] to-[#160405] px-5 py-2.5 font-display text-xs font-black tracking-widest text-[#ffd76a] shadow-[0_0_30px_rgba(217,164,65,0.4)]"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== bet modal ===== */}
      <Modal open={betOpen} onClose={() => setBetOpen(false)}>
        <ModalHeader title="BET SETTINGS" cnText="注" onClose={() => setBetOpen(false)} />
        <div className="p-4">
          <p className="text-center text-xs text-white/70">
            30 fixed lines · Line bet <b className="text-[#ffd76a]">{formatMoney(bet / 30)}</b>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {BET_OPTIONS.map((b) => (
              <button
                key={b}
                onClick={() => { sound.bet(); setBet(b); }}
                className={cn(
                  "rounded-xl border py-2.5 font-display text-sm font-black transition",
                  b === bet
                    ? "border-[#ffd76a] bg-gradient-to-b from-[#d9a441]/50 to-[#d9a441]/15 text-[#ffd76a] shadow-[0_0_16px_rgba(217,164,65,0.4)]"
                    : "border-white/10 bg-black/40 text-white/70 hover:border-[#d9a441]/50 hover:text-white",
                )}
              >
                {formatMoney(b)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <BetAmountInput value={bet} onChange={(v) => { sound.bet(); setBet(v); }} />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { sound.bet(); setBet(BET_OPTIONS[BET_OPTIONS.length - 1]); }}
              className="flex-1 rounded-xl border border-[#ffd76a]/50 py-2.5 text-xs font-black tracking-widest text-[#ffd76a]"
            >
              MAX BET
            </button>
            <button
              onClick={() => { sound.button(); setBetOpen(false); }}
              className="gold-btn flex-[2] rounded-xl py-2.5 text-xs font-black tracking-widest"
            >
              CONFIRM
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== auto modal ===== */}
      <Modal open={autoOpen} onClose={() => setAutoOpen(false)}>
        <ModalHeader title="AUTOPLAY" cnText="自" onClose={() => setAutoOpen(false)} />
        <div className="grid grid-cols-3 gap-2 p-4">
          {[10, 30, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => startAuto(n)}
              className="rounded-xl border border-white/10 bg-black/40 py-3 font-display text-lg font-black text-[#ffe9b0] transition hover:border-[#ffd76a] hover:bg-[#d9a441]/20"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => startAuto(null)}
            className="col-span-2 rounded-xl border border-[#ffd76a]/50 bg-[#d9a441]/15 py-3 font-display text-lg font-black text-[#ffd76a] transition hover:bg-[#d9a441]/30"
          >
            ∞ UNLIMITED
          </button>
        </div>
      </Modal>

      {/* ===== paytable modal ===== */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} wide>
        <ModalHeader title="PAYTABLE · RULES" cnText="表" onClose={() => setPayOpen(false)} />
        <div className="flex border-b border-[#d9a441]/30">
          {(["symbols", "lines", "rules"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { sound.click(); setPayTab(t); }}
              className={cn(
                "flex-1 py-2.5 font-display text-[11px] font-black tracking-[0.2em] transition",
                payTab === t ? "bg-[#d9a441]/15 text-[#ffd76a]" : "text-white/50 hover:text-white/80",
              )}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="max-h-[52dvh] overflow-y-auto p-4">
          {payTab === "symbols" && (
            <div className="space-y-2">
              {(Object.keys(SYMBOLS) as SymbolId[]).map((id) => {
                const m = SYMBOLS[id];
                return (
                  <div key={id} className="flex items-center gap-3 rounded-xl bg-black/30 p-2">
                    <div className="h-12 w-12 shrink-0">
                      <SlotSymbol id={id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#ffe9b0]">{m.name}</p>
                      {id === "scatter" ? (
                        <p className="text-[10px] text-white/60">
                          3+ anywhere triggers Free Spins choice · 2 grants a Single Free Spin
                        </p>
                      ) : id === "wild" ? (
                        <p className="text-[10px] text-white/60">
                          Substitutes all except Scatter · pays on its own
                        </p>
                      ) : null}
                    </div>
                    {id !== "scatter" && (
                      <div className="grid shrink-0 grid-cols-[auto_auto] gap-x-2 text-[10px]">
                        {[5, 4, 3, 2].map((c) => {
                          const pay = m.pays[c as 2 | 3 | 4 | 5];
                          if (!pay) return null;
                          return (
                            <div key={c} className="contents">
                              <span className="text-white/50">×{c}</span>
                              <span className="text-right font-display font-black text-[#ffd76a]">
                                {(pay * lineBet).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="pt-1 text-center text-[10px] text-white/40">
                Values shown for current line bet {formatMoney(lineBet)} · Wild pays included
              </p>
            </div>
          )}
          {payTab === "lines" && (
            <div>
              <p className="mb-3 text-center text-xs text-white/70">
                30 fixed paylines — wins pay left to right on adjacent reels
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PAYLINES.map((pattern, i) => (
                  <div key={i} className="rounded-lg bg-black/40 p-1.5">
                    <div className="grid grid-cols-5 gap-[2px]">
                      {Array.from({ length: 15 }).map((_, k) => {
                        const reel = k % 5;
                        const row = (k / 5) | 0;
                        const on = pattern[reel] === row;
                        return (
                          <div
                            key={k}
                            className={cn(
                              "aspect-square rounded-[2px]",
                              on ? "bg-gradient-to-b from-[#ffd76a] to-[#9c6207]" : "bg-white/10",
                            )}
                          />
                        );
                      })}
                    </div>
                    <p className="mt-1 text-center text-[9px] font-black text-white/40">{i + 1}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {payTab === "rules" && (
            <div className="space-y-3 text-xs leading-relaxed text-white/75">
              <div className="rounded-xl bg-black/30 p-3">
                <h4 className="font-display mb-1 text-[11px] font-black tracking-widest text-[#ffd76a]">HOW TO PLAY</h4>
                <p>Wins form with 3+ matching symbols (2+ for Wild, Lu Bu, Dong Zhuo, Soldier) on adjacent reels from the leftmost reel across 30 fixed lines. Diao Chan Wild substitutes for every symbol except the Phoenix Scatter.</p>
                <p>Server-prepared reels select 10 winning players per 100 distinct players. The combined return for a paid spin and all its bonus spins is at most 2× the paid stake. Only reel combinations within that limit are eligible.</p>
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <h4 className="font-display mb-1 text-[11px] font-black tracking-widest text-[#ffd76a]">FREE SPINS</h4>
                <p>3+ Scatters award an instant prize (3→2×, 4→10×, 5+→50× bet) plus a choice of bonus: <b>Diao Chan</b> 8 spins with Expanding Wilds · <b>Dong Zhuo</b> 10 spins with Wild ×4 · <b>Lu Bu</b> 12 spins with sticky Lu Bu + transforms. 4 Scatters double, 5+ quadruple all bonus wins. 2 Scatters grant a Single Free Spin with random power.</p>
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <h4 className="font-display mb-1 text-[11px] font-black tracking-widest text-[#ffd76a]">BIG WINS</h4>
                <p>BIG ≥10× · MEGA ≥25× · SUPER ≥50× · LEGENDARY ≥100× your bet (Rs.).</p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== history modal ===== */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} wide>
        <ModalHeader title="SPIN HISTORY" cnText="史" onClose={() => setHistoryOpen(false)} />
        <div className="max-h-[52dvh] overflow-y-auto p-4">
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No spins yet — good fortune awaits!</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] tracking-widest text-[#e8b64c]/70">
                  <th className="py-1 text-left font-black">#</th>
                  <th className="py-1 text-right font-black">BET</th>
                  <th className="py-1 text-right font-black">WIN</th>
                  <th className="py-1 text-right font-black">PROFIT</th>
                  <th className="py-1 text-right font-black">TIME</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className="border-t border-white/5">
                    <td className="py-1.5 text-white/60">
                      {history.length - i}
                      {h.free && <span className="ml-1 rounded bg-[#ff9d2e]/20 px-1 text-[9px] font-black text-[#ff9d2e]">FREE</span>}
                    </td>
                    <td className="py-1.5 text-right text-white/80">{formatMoney(h.bet)}</td>
                    <td className="py-1.5 text-right font-bold text-[#7dff9a]">{formatMoney(h.win)}</td>
                    <td className={cn("py-1.5 text-right font-bold", h.win - (h.free ? 0 : h.bet) >= 0 ? "text-[#7dff9a]" : "text-[#ff7b7b]")}>
                      {h.win - (h.free ? 0 : h.bet) >= 0 ? "+" + formatMoney(h.win - (h.free ? 0 : h.bet)) : "No win"}
                    </td>
                    <td className="py-1.5 text-right text-white/40">{h.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {history.length > 0 && (
            <button
              onClick={() => { sound.click(); setHistory([]); }}
              className="mt-3 w-full rounded-xl border border-white/10 py-2 text-[11px] font-black tracking-widest text-white/50 hover:text-white"
            >
              CLEAR HISTORY
            </button>
          )}
        </div>
      </Modal>

      {/* ===== free spins choice ===== */}
      <Modal open={!!pendingChoice} onClose={() => { }}>
        {pendingChoice && (
          <>
            <div className="border-b border-[#d9a441]/30 bg-black/30 px-4 py-3 text-center">
              <p className="font-cn text-lg leading-none text-[#ff9d9d]">選擇你的命運</p>
              <h2 className="gold-text font-display mt-1 text-base font-black tracking-[0.14em]">
                CHOOSE YOUR DESTINY
              </h2>
              <p className="mt-0.5 text-[11px] font-bold text-white/70">
                {pendingChoice.count} SCATTERS · BONUS WINS ×{pendingChoice.mult}
              </p>
            </div>
            <div className="space-y-2 p-4">
              {(Object.keys(FREE_SPINS) as FreeMode[]).map((mode) => {
                const m = FREE_SPINS[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => chooseFreeMode(mode)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-[#d9a441]/30 bg-black/40 p-2.5 text-left transition hover:border-[#ffd76a] hover:bg-[#d9a441]/15 hover:shadow-[0_0_24px_rgba(217,164,65,0.35)]"
                  >
                    <img
                      src={m.img}
                      alt={m.title}
                      className="h-16 w-16 shrink-0 rounded-xl border border-[#d9a441]/50 object-cover"
                      draggable={false}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-gradient-to-b from-[#e33d3d] to-[#8f1010] px-1 font-cn text-[11px] text-white">
                          {m.cn}
                        </span>
                        <p className="font-display text-sm font-black tracking-wider text-[#ffe9b0]">
                          {m.title.toUpperCase()}
                        </p>
                      </div>
                      <p className="mt-0.5 font-display text-xs font-black text-[#ffd76a]">
                        {m.spins} FREE SPINS
                      </p>
                      <p className="truncate text-[11px] text-white/60">{m.feature}</p>
                    </div>
                    <ChevronRight className="shrink-0 text-[#d9a441] transition group-hover:translate-x-1 group-hover:text-[#ffd76a]" size={20} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Modal>

      {/* ===== free spins complete ===== */}
      <Modal open={!!freeComplete} onClose={collectFree}>
        {freeComplete && (
          <div className="p-6 text-center">
            <Trophy size={44} className="mx-auto text-[#ffd76a]" />
            <p className="font-cn mt-2 text-xl text-[#ff9d9d]">恭喜發財</p>
            <h2 className="gold-text font-display mt-1 text-xl font-black tracking-[0.12em]">
              FREE SPINS COMPLETE
            </h2>
            <p className="mt-1 text-xs text-white/60">
              {freeComplete.spins} spins · {pool.enabled ? "Provisional claims · daily payout pending" : "Total win"}
            </p>
            <p className="gold-text font-display mt-1 text-4xl font-black">
              {formatMoney(freeComplete.totalWin)}
            </p>
            <button onClick={collectFree} className="gold-btn mt-4 w-full rounded-xl py-3 text-sm font-black tracking-[0.2em]">
              {pool.enabled ? "CONTINUE · PAYOUT PENDING" : "COLLECT"}
            </button>
          </div>
        )}
      </Modal>

      {/* ===== big win overlay ===== */}
      <AnimatePresence>
        {bigWin && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { sound.button(); setBigWin(null); scheduleNext(500); }}
          >
            <div className="rays absolute h-[150vmax] w-[150vmax]" />
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 14, stiffness: 200 }}
              className="relative flex flex-col items-center px-6 text-center"
            >
              <p className="font-cn text-3xl text-[#ff9d9d] drop-shadow-[0_0_20px_rgba(227,61,61,0.8)]">
                {bigWin.cn}
              </p>
              <h2 className="gold-text font-display mt-1 text-5xl font-black tracking-wide drop-shadow-[0_4px_20px_rgba(217,164,65,0.6)] sm:text-6xl">
                {pool.enabled ? "PROVISIONAL CLAIM" : bigWin.tier}
              </h2>
              <BigWinCounter amount={bigWin.amount} />
              <p className="mt-2 text-xs font-bold tracking-[0.3em] text-white/60">
                {Math.round(bigWin.amount / Math.max(1, bigWin.bet))}× YOUR BET
              </p>
              <p className="tap-continue mt-6 rounded-full border border-[#ffd76a]/50 px-6 py-2 font-display text-xs font-black tracking-[0.25em] text-[#ffd76a]">
                TAP TO CONTINUE
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BigWinCounter({ amount }: { amount: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 2500);
      const e = 1 - Math.pow(1 - p, 4);
      setV(amount * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [amount]);
  return (
    <p className="font-display mt-2 text-4xl font-black text-white drop-shadow-[0_0_25px_rgba(255,215,106,0.7)] sm:text-5xl">
      {formatMoney(v)}
    </p>
  );
}
