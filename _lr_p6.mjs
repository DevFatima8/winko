import { patch } from "./_lr_patch.mjs";
patch("src/components/bollywood-casino/CasinoGame.tsx", [
[`import { playSfx, type Sfx } from "./lib/sound";
`, `import { playSfx, type Sfx } from "./lib/sound";
import { LiveBetQueueBar, activationNotice, sumByKey, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`  const dealGuard = useRef(false);
`, `  const dealGuard = useRef(false);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const live = useLiveBetQueue<Zone>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
`],
[`  const newHand = useCallback(() => {
    setBets({ andar: 0, bahar: 0, joker: 0 });`,
`  const newHand = useCallback(() => {
    // Explicit bets queued during the previous hand join this hand exactly once.
    const act = liveQueue.activate(balanceRef.current);
    if (act.total > 0) setBalance((b) => b - act.total);
    setBets({ andar: 0, bahar: 0, joker: 0, ...sumByKey(act.accepted) });
    const note = activationNotice(act, fmt);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");`],
[`    setTimeLeft(BET_TIME);
    setPhase("betting");
  }, []);`, `    setTimeLeft(BET_TIME);
    setPhase("betting");
  }, [liveQueue, setLiveNotice, setBalance]);`],
[`  const startDeal = useCallback(async () => {
    if (dealGuard.current || phase !== "betting") return;
    const totalNow = bets.andar + bets.bahar + bets.joker;
    if (totalNow <= 0) return;
    dealGuard.current = true;
    setPhase("dealing");
    setBalance((b) => b - totalNow);
    sfx("deal");`,
`  /** \`spectator\`: no-stake live hand that keeps the table running without any wallet/stat/history effect. */
  const startDeal = useCallback(async (spectator = false) => {
    if (dealGuard.current || phase !== "betting") return;
    const totalNow = bets.andar + bets.bahar + bets.joker;
    if (totalNow <= 0 && !spectator) return;
    const staked = totalNow > 0;
    dealGuard.current = true;
    setPhase("dealing");
    if (staked) setBalance((b) => b - totalNow);
    sfx("deal");`],
[`    let winAmt = 0;
    if (hand.winner === "joker")`,
`    if (!staked) {
      setPhase("settled");
      dealGuard.current = false;
      return;
    }

    let winAmt = 0;
    if (hand.winner === "joker")`],
[`      if (total > 0) void startDeal();
      else setTimeLeft(BET_TIME);`,
`      void startDeal(total <= 0);`],
[`  const place = (zone: Zone) => {
    if (phase !== "betting" || balance < selChip) return;`,
`  const place = (zone: Zone) => {
    if (phase !== "betting") {
      const queued = liveQueue.enqueue(zone, selChip, balanceRef.current);
      if (queued.ok) {
        sfx("chip");
        setLiveNotice(\`\${fmt(selChip)} on \${zone.toUpperCase()} queued for the next hand.\`);
      } else setLiveNotice(queued.error, "error");
      return;
    }
    if (balance < selChip) return;`],
[`    setResetArmed(false);
    dealGuard.current = false;`,
`    setResetArmed(false);
    liveQueue.cancel();
    dealGuard.current = false;`],
[`      {confetti > 0 && <Confetti seed={confetti} />}
`, `      {confetti > 0 && <Confetti seed={confetti} />}
      <LiveBetQueueBar
        bets={live.bets}
        total={live.total}
        notice={live.notice}
        onCancel={() => {
          if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted.");
        }}
        labelFor={(k) => k.toUpperCase()}
        money={fmt}
      />
`],
]);
