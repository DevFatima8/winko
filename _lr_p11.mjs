import fs from "node:fs";
const f = "src/components/red-vs-black/RedVsBlackGame.tsx";
let s = fs.readFileSync(f, "utf8");
const crlf = s.includes("\r\n");
s = s.replace(/\r\n/g, "\n");
const start = s.indexOf("  const placeBet = useCallback(");
const endMarker = "  const totalWins = history.filter";
const end = s.indexOf(endMarker);
if (start < 0 || end < 0) throw new Error("markers");
const block = `  const [phase, setPhase] = useState<Phase>("betting");
  const [timeLeft, setTimeLeft] = useState(BET_TIME);
  const spinningRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const live = useLiveBetQueue<"red" | "black">();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;

  const placeBet = useCallback(
    (color: "red" | "black") => {
      if (phase !== "betting" || spinningRef.current) {
        // Card already being dealt: queue for the next round; nothing is charged until it opens.
        const other = liveQueue.bets.find((b) => b.key !== color);
        if (other) {
          setLiveNotice("Only one colour per round can be queued.", "error");
          return;
        }
        const q = liveQueue.enqueue(color, selectedChip, balanceRef.current);
        if (q.ok) {
          gameSfx.chip();
          setLiveNotice(\`Rs. \${selectedChip} on \${color.toUpperCase()} queued for the next round.\`);
        } else setLiveNotice(q.error, "error");
        return;
      }
      if (currentBet && currentBet.color !== color) {
        setWinMessage("One colour per round");
        setTimeout(() => setWinMessage(null), 2000);
        return;
      }
      if (balance < selectedChip) {
        setWinMessage("Insufficient balance!");
        setTimeout(() => setWinMessage(null), 2000);
        return;
      }
      gameSfx.chip();
      setBalance((prev) => prev - selectedChip);
      setCurrentBet((prev) => ({ color, amount: (prev?.amount ?? 0) + selectedChip }));
    },
    [phase, currentBet, balance, selectedChip, liveQueue, setLiveNotice, setBalance]
  );

  const spawnParticles = useCallback((winColor: string) => {
    const newParticles = Array.from({ length: 24 }, () => ({
      id: particleId.current++,
      x: 50 + (Math.random() - 0.5) * 40,
      y: 40 + (Math.random() - 0.5) * 30,
      color: winColor === "red" ? "#ef4444" : "#eab308",
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 2000);
  }, []);

  /** Deals one live round. \`bet === null\` is a no-stake spectator round: public card only, no wallet/stats/history. */
  const spin = useCallback(async (bet: { color: "red" | "black"; amount: number } | null) => {
    if (spinningRef.current) return;
    spinningRef.current = true;

    setIsSpinning(true);
    setPhase("spinning");
    gameSfx.deal();
    setShowResult(false);
    setCardFlipped(false);
    setResult(null);

    // Spinning delay
    await new Promise((resolve) => setTimeout(resolve, 1400));

    try {
      const suits = {
        red: ["♥", "♦"],
        black: ["♠", "♣"],
      };
      const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
      // 35% win rate house edge logic (staked rounds only)
      const winningColor: "red" | "black" = bet
        ? Math.random() < 0.35
          ? bet.color
          : bet.color === "red"
          ? "black"
          : "red"
        : Math.random() < 0.5
        ? "red"
        : "black";
      const suit = suits[winningColor][Math.floor(Math.random() * 2)];
      const value = values[Math.floor(Math.random() * values.length)];
      const isWin = !!bet && winningColor === bet.color;
      const payout = isWin && bet ? bet.amount * 2 : 0;

      const data: GameResult = {
        winningColor,
        card: { suit, value },
        isWin,
        payout,
        betAmount: bet?.amount ?? 0,
        betColor: bet?.color ?? "",
        staked: !!bet,
      };

      const otherColor = winningColor === "red" ? "black" : "red";
      setOtherCard({
        suit: suits[otherColor][Math.floor(Math.random() * 2)],
        value: values[Math.floor(Math.random() * values.length)],
      });
      gameSfx.flip();
      setCardFlipped(true);
      await new Promise((resolve) => setTimeout(resolve, 600));

      setResult(data);
      setShowResult(true);

      if (bet) {
        if (data.isWin) gameSfx.win();
        else gameSfx.lose();
        if (data.isWin) {
          setBalance((prev) => prev + data.payout);
          setWinMessage(\`You won Rs. \${data.payout}!\`);
          if (mountedRef.current) spawnParticles(data.winningColor);
        } else {
          setWinMessage("You lose");
        }

        setHistory((prev) => [
          { color: data.winningColor, card: \`\${data.card.value}\${data.card.suit}\`, isWin: data.isWin },
          ...prev.slice(0, 19),
        ]);
      }
    } catch {
      if (bet) {
        setWinMessage("Error occurred! Bet refunded.");
        setBalance((prev) => prev + bet.amount);
      }
    } finally {
      setIsSpinning(false);
      setPhase("result");
    }
  }, [spawnParticles, setBalance]);

  // Live table countdown: deal automatically, with or without a stake.
  useEffect(() => {
    if (phase !== "betting") return;
    if (timeLeft <= 0) {
      void spin(currentBet);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const newRound = useCallback(() => {
    spinningRef.current = false;
    setWinMessage(null);
    setResult(null);
    setShowResult(false);
    setCardFlipped(false);
    setOtherCard(null);
    // Bets queued during the previous deal join this round exactly once (funds re-checked now).
    const act = liveQueue.activate(balanceRef.current);
    if (act.total > 0) {
      setBalance((prev) => prev - act.total);
      setCurrentBet({ color: act.accepted[0].key, amount: act.total });
    } else setCurrentBet(null);
    const note = activationNotice(act, (n) => \`Rs. \${n.toLocaleString()}\`);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
    setTimeLeft(BET_TIME);
    setPhase("betting");
  }, [liveQueue, setLiveNotice, setBalance]);

  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(newRound, NEXT_ROUND_MS);
    return () => clearTimeout(id);
  }, [phase, newRound]);

  const resetGame = () => {
    liveQueue.cancel();
    setBalance(INITIAL_BALANCE);
    setCurrentBet(null);
    setResult(null);
    setShowResult(false);
    setHistory([]);
    setWinMessage(null);
    setCardFlipped(false);
  };

`;
s = s.slice(0, start) + block + s.slice(end);
const reps = [
  [`import "./red-vs-black.css";\n`, `import "./red-vs-black.css";\nimport { LiveBetQueueBar, activationNotice, useLiveBetQueue } from "@/components/LiveBetQueue";\n`],
  [`const INITIAL_BALANCE = 5000;\n`, `const INITIAL_BALANCE = 5000;\nconst BET_TIME = 10;\nconst NEXT_ROUND_MS = 3500;\ntype Phase = "betting" | "spinning" | "result";\n`],
  [`  betColor: string;\n}`, `  betColor: string;\n  staked: boolean;\n}`],
  [`      {/* Header & Balance Bar */}\n`, `      <LiveBetQueueBar\n        bets={live.bets}\n        total={live.total}\n        notice={live.notice}\n        onCancel={() => {\n          if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted.");\n        }}\n        labelFor={(k) => k.toUpperCase()}\n        money={(n) => \`Rs. \${n.toLocaleString()}\`}\n      />\n      {/* Header & Balance Bar */}\n`],
  [`              showResult
                ? result?.isWin`, `              showResult && result?.staked
                ? result.isWin`],
  [`          {!winMessage && !isSpinning && !currentBet && (
            <p className="text-white/40 text-xs font-semibold">Choose RED or BLACK to place bet</p>
          )}`, `          {!winMessage && phase === "betting" && (
            <p className="text-white/40 text-xs font-semibold">
              {currentBet
                ? \`Rs. \${currentBet.amount} on \${currentBet.color.toUpperCase()} · dealing in \${timeLeft}s\`
                : \`Choose RED or BLACK to place bet · next deal in \${timeLeft}s\`}
            </p>
          )}`],
  [`            onClick={() => placeBet("red")}
            disabled={isSpinning || balance < selectedChip}`, `            onClick={() => placeBet("red")}
            disabled={balance < selectedChip}`],
  [`            onClick={() => placeBet("black")}
            disabled={isSpinning || balance < selectedChip}`, `            onClick={() => placeBet("black")}
            disabled={balance < selectedChip}`],
  [`                onClick={() => setSelectedChip(value)}
                disabled={isSpinning}`, `                onClick={() => setSelectedChip(value)}`],
  [`<BetAmountInput value={selectedChip} onChange={setSelectedChip} disabled={isSpinning} />`, `<BetAmountInput value={selectedChip} onChange={setSelectedChip} />`],
];
for (const [a, b] of reps) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error("match " + n + ": " + a.slice(0, 60));
  s = s.replace(a, () => b);
}
if (crlf) s = s.replace(/\n/g, "\r\n");
fs.writeFileSync(f, s);
console.log("ok");
