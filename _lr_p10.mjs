import { patch } from "./_lr_patch.mjs";
patch("src/components/baccarat/lib/baccarat.ts", [
[`// Generate a round whose winner matches the desired outcome.`, `/** Unbiased round for no-stake live (spectator) hands. */
export function dealFairRound(): RoundResult {
  return playRound(buildDeck());
}

// Generate a round whose winner matches the desired outcome.`],
]);
patch("src/components/baccarat/Baccarat.tsx", [
[`import {
  dealRiggedRound,`, `import {
  dealFairRound,
  dealRiggedRound,`],
[`import "./baccarat.css";
`, `import "./baccarat.css";
import { LiveBetQueueBar, activationNotice, sumByKey, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`const STARTING_BALANCE = 5000;
`, `const STARTING_BALANCE = 5000;
const BET_TIME = 15;
const NEXT_ROUND_MS = 5000;
const money = (n: number) => \`Rs. \${n.toLocaleString()}\`;
const BET_LABEL: Record<BetType, string> = { player: "PLAYER", banker: "BANKER", tie: "TIE" };
`],
[`  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
`, `  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [timeLeft, setTimeLeft] = useState(BET_TIME);
  const dealingRef = useRef(false);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const live = useLiveBetQueue<BetType>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
`],
[`  function placeChip(type: BetType) {
    if (phase !== "betting") return;`, `  function placeChip(type: BetType) {
    if (phase !== "betting" || dealingRef.current) {
      // Hand already dealing/settled: queue for the next hand; nothing is charged until it opens.
      const q = liveQueue.enqueue(type, selectedChip, balanceRef.current);
      if (q.ok) {
        gameSfx.chip();
        setLiveNotice(\`\${money(selectedChip)} on \${BET_LABEL[type]} queued for the next hand.\`);
      } else setLiveNotice(q.error, "error");
      return;
    }`],
[`  function deal() {
    if (phase !== "betting" || totalBet === 0) return;
    gameSfx.deal();`, `  function deal() {
    if (phase !== "betting" || totalBet === 0 || dealingRef.current) return;
    dealingRef.current = true;
    gameSfx.deal();`],
[`  function resolveRound(result: RoundResult) {`, `  /** No-stake live hand: public result only — no wallet, sfx, personal message or result modal. */
  function spectatorDeal() {
    if (phase !== "betting" || dealingRef.current) return;
    dealingRef.current = true;
    const result = dealFairRound();
    setRound(result);
    setPhase("dealing");
    setRevealCount(0);
    setMessage("No more bets");
    setMessageType("neutral");
    const totalCards = result.playerCards.length + result.bankerCards.length;
    for (let i = 1; i <= totalCards; i++) pushTimeout(() => setRevealCount(i), i * 550);
    pushTimeout(() => {
      setMessage(\`\${BET_LABEL[result.winner]} WINS\`);
      setHistory((h) => [...h, { winner: (result.winner === "player" ? "P" : result.winner === "banker" ? "B" : "T") as HistoryEntry["winner"] }].slice(-24));
      setEndDismissed(true);
      setPhase("result");
    }, totalCards * 550 + 500);
  }

  // Live table: betting countdown, then the hand is dealt (staked) or shown to spectators.
  useEffect(() => {
    if (phase !== "betting") return;
    if (timeLeft <= 0) {
      if (totalBet > 0) deal();
      else spectatorDeal();
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const nextRoundRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(() => nextRoundRef.current(), NEXT_ROUND_MS);
    return () => clearTimeout(id);
  }, [phase]);

  function resolveRound(result: RoundResult) {`],
[`  function nextRound() {
    setBets({ player: 0, banker: 0, tie: 0 });`, `  function nextRound() {
    if (phase !== "result") return;
    dealingRef.current = false;
    // Bets queued during the last hand join this one exactly once (charged at Deal, like table chips).
    const act = liveQueue.activate(balanceRef.current);
    const note = activationNotice(act, money);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
    setBets({ player: 0, banker: 0, tie: 0, ...sumByKey(act.accepted) });
    setTimeLeft(BET_TIME);`],
[`  function resetGame() {
    timeoutsRef.current.forEach(clearTimeout);
    setBalance(STARTING_BALANCE);
    nextRound();
    setHistory([]);
  }`, `  nextRoundRef.current = nextRound;

  function resetGame() {
    timeoutsRef.current.forEach(clearTimeout);
    liveQueue.cancel();
    dealingRef.current = false;
    setBalance(STARTING_BALANCE);
    setBets({ player: 0, banker: 0, tie: 0 });
    setRound(null);
    setRevealCount(0);
    setTimeLeft(BET_TIME);
    setPhase("betting");
    setMessage("Place your bets");
    setMessageType("neutral");
    setLastNet(0);
    setHistory([]);
  }`],
[`      {/* Compact Top Bar */}
`, `      <LiveBetQueueBar
        bets={live.bets}
        total={live.total}
        notice={live.notice}
        onCancel={() => { if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted."); }}
        labelFor={(k) => BET_LABEL[k]}
        money={money}
      />
      {/* Compact Top Bar */}
`],
[`              {message}
            </div>`, `              {message}
              {phase === "betting" && \` · \${timeLeft}s\`}
            </div>`],
[`              onClick={() => placeChip("player")}
              disabled={phase !== "betting"}`, `              onClick={() => placeChip("player")}
              disabled={false}`],
[`              onClick={() => placeChip("tie")}
              disabled={phase !== "betting"}`, `              onClick={() => placeChip("tie")}
              disabled={false}`],
[`              onClick={() => placeChip("banker")}
              disabled={phase !== "betting"}`, `              onClick={() => placeChip("banker")}
              disabled={false}`],
[`              onClick={() => setSelectedChip(chip.value)}
              disabled={phase !== "betting"}`, `              onClick={() => setSelectedChip(chip.value)}`],
[`            onChange={setSelectedChip}
            disabled={phase !== "betting"}`, `            onChange={setSelectedChip}`],
]);
