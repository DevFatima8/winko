import { patch } from "./_lr_patch.mjs";
patch("src/components/32-cards/Game.tsx", [
[`import "./32-cards.css";
`, `import "./32-cards.css";
import { LiveBetQueueBar, activationNotice, sumByKey, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`  const betsRef = useRef(bets);
  betsRef.current = bets;
`, `  const betsRef = useRef(bets);
  betsRef.current = bets;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const live = useLiveBetQueue<BetKey>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
  const money = (n: number) => \`Rs. \${n.toLocaleString()}\`;
  const labelOf = (k: BetKey) => PLAYERS.find((p) => p.key === k)?.name ?? SIDE.find((s) => s.key === k)!.name;
`],
[`  function place(k: BetKey) {
    if (phase !== "betting") return;`,
`  function place(k: BetKey) {
    if (phase !== "betting") {
      // Round is dealing/settling: queue the explicit bet for the next round (nothing deducted yet).
      const q = liveQueue.enqueue(k, chip, balanceRef.current);
      if (q.ok) { gameSfx.chip(); setLiveNotice(\`\${money(chip)} on \${labelOf(k)} queued for round #\${roundNo + 1}.\`); }
      else setLiveNotice(q.error, "error");
      return;
    }`],
[`    setTimeout(() => {
      setBets({}); setRound(null);`,
`    setTimeout(() => {
      const act = liveQueue.activate(balanceRef.current);
      if (act.total > 0) setBalance((x) => x - act.total);
      const note = activationNotice(act, money);
      if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
      setBets(sumByKey(act.accepted)); setRound(null);`],
[`onClick={() => place(p.key)} disabled={phase !== "betting"}`, `onClick={() => place(p.key)} disabled={false}`],
[`onClick={() => place(s.key)} disabled={phase !== "betting"}`, `onClick={() => place(s.key)} disabled={false}`],
[`      {/* Top bar */}
`, `      <LiveBetQueueBar
        bets={live.bets}
        total={live.total}
        notice={live.notice}
        onCancel={() => { if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted."); }}
        labelFor={labelOf}
        money={money}
      />
      {/* Top bar */}
`],
]);
