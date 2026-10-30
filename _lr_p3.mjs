import { patch } from "./_lr_patch.mjs";
patch("src/components/football-studio/FootballStudioGame.tsx", [
[`import { gameSfx } from "@/lib/gameSfx";
`, `import { gameSfx } from "@/lib/gameSfx";
import { LiveBetQueueBar, activationNotice, sumByKey, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
`, `  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useLiveBetQueue<Outcome>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
`],
[`    setRoundNet(null);
    setBets({ ...EMPTY_BETS });
  }, []);`,
`    setRoundNet(null);
    // Explicit bets queued during the previous deal join this new round exactly once.
    const act = liveQueue.activate(balanceRef.current);
    if (act.total > 0) setBalance((b) => b - act.total);
    setBets({ ...EMPTY_BETS, ...sumByKey(act.accepted) });
    const note = activationNotice(act, (n) => \`Rs. \${fmt(n)}\`);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
  }, [liveQueue, setLiveNotice, setBalance]);`],
[`  const placeBet = (o: Outcome) => {
    if (!canBet) return;`,
`  const placeBet = (o: Outcome) => {
    if (!canBet) {
      const queued = liveQueue.enqueue(o, chip, balanceRef.current);
      if (queued.ok) {
        gameSfx.chip();
        setLiveNotice(\`Rs. \${fmt(chip)} on \${o} queued for the next round.\`);
      } else setLiveNotice(queued.error, "error");
      return;
    }`],
[`  const dealNow = () => {`,
`  const cancelQueue = () => {
    if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted.");
  };

  const dealNow = () => {`],
[`      {showConfetti && <Confetti />}
`, `      {showConfetti && <Confetti />}
      <LiveBetQueueBar bets={live.bets} total={live.total} notice={live.notice} onCancel={cancelQueue} labelFor={(k) => k} money={(n) => \`Rs. \${fmt(n)}\`} />
`],
]);
