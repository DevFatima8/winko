import { patch } from "./_lr_patch.mjs";
patch("src/components/7-up-down/SevenUpDown.tsx", [
[`import "./7-up-down.css";
`, `import "./7-up-down.css";
import { LiveBetQueueBar, activationNotice, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`  const idRef = useRef(0);
`, `  const idRef = useRef(0);
  const [roundNo, setRoundNo] = useState(1);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const live = useLiveBetQueue<BetArea>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
  const money = (n: number) => \`Rs. \${n.toLocaleString()}\`;
  const areaLabel = (a: BetArea) => (a === "down" ? "7 DOWN" : a === "up" ? "7 UP" : "LUCKY 7");
`],
[`    if (phase === "betting") {
      setBets([]);
      setTimeLeft(BET_DURATION);`, `    if (phase === "betting") {
      setTimeLeft(BET_DURATION);`],
[`      if (bets.length === 0) {
        // No bets placed; reset timer instead of rolling.
        setTimeLeft(BET_DURATION);
        return;
      }
      lockAndRoll();`, `      if (bets.length === 0) {
        // No stake: keep the live table running with a spectator roll (no wallet/stats/history).
        spectatorRoll();
        return;
      }
      lockAndRoll();`],
[`    (area: BetArea) => {
      if (phase !== "betting") return;`, `    (area: BetArea) => {
      if (phase !== "betting") {
        // Round already rolling/settled: queue for the next round, nothing deducted yet.
        const q = liveQueue.enqueue(area, chipValue, balanceRef.current);
        if (q.ok) {
          play(sfx.chip);
          setLiveNotice(\`\${money(chipValue)} on \${areaLabel(area)} queued for round #\${roundNo + 1}.\`);
        } else setLiveNotice(q.error, "error");
        return;
      }`],
[`    [chipValue, balance, phase, play],
  );`, `    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chipValue, balance, phase, play, roundNo, liveQueue, setLiveNotice],
  );`],
[`  const newRound = useCallback(() => {
    setPhase("betting");
  }, []);`, `  const spectatorRoll = useCallback(() => {
    setPhase("rolling");
    play(sfx.roll);
    const dice: [number, number] = [randDie(), randDie()];
    const animStart = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - animStart >= 1300) {
        clearInterval(interval);
        setDiceValues(dice);
        setLastResult({ id: ++idRef.current, dice, total: totalFromDice(dice[0], dice[1]), bets: [], payout: 0, outcome: "tie" });
        setPhase("result");
      } else {
        setDiceValues([randDie(), randDie()]);
      }
    }, 90);
  }, [play]);

  const newRound = useCallback(() => {
    const act = liveQueue.activate(balanceRef.current);
    if (act.total > 0) setBalance((b) => b - act.total);
    setBets(act.accepted.map((q) => ({ area: q.key, amount: q.amount })));
    const note = activationNotice(act, money);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
    setRoundNo((n) => n + 1);
    setPhase("betting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQueue, setLiveNotice, setBalance]);

  // Live table: automatically start the next round shortly after each result.
  const newRoundRef = useRef(newRound);
  newRoundRef.current = newRound;
  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(() => newRoundRef.current(), 4000);
    return () => clearTimeout(id);
  }, [phase]);`],
[`                Round #{history.length + (phase !== "betting" || lastResult ? 1 : 0)}`, `                Round #{roundNo}`],
[`    <div className="seven-up-down-container h-full w-full flex flex-col min-h-0 overflow-hidden text-white">
`, `    <div className="seven-up-down-container h-full w-full flex flex-col min-h-0 overflow-hidden text-white">
      <LiveBetQueueBar
        bets={live.bets}
        total={live.total}
        notice={live.notice}
        onCancel={() => { if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted."); }}
        labelFor={areaLabel}
        money={money}
      />
`],
[`      onClick={onClick}
      disabled={!active}`, `      onClick={onClick}`],
[`      aria-label={\`Bet on \${label}\`}`, `      aria-label={active ? \`Bet on \${label}\` : \`Queue bet on \${label} for next round\`}`],
[`      {win ? (
        <p className="text-2xl font-extrabold text-emerald-300">`, `      {result.bets.length === 0 ? null : win ? (
        <p className="text-2xl font-extrabold text-emerald-300">`],
]);
