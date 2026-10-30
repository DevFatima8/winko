import { patch } from "./_lr_patch.mjs";
patch("src/components/LiveBetQueue.tsx", [
[`{parts.join(" · ")} — not in the current round`, `{parts.join(" · ")} — not charged yet · joins next round only`],
]);
patch("src/components/32-cards/Game.tsx", [
[`  const balanceRef = useRef(balance);
  balanceRef.current = balance;
`, `  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
`],
[`    setTimeout(() => {
      const act = liveQueue.activate(balanceRef.current);`, `    setTimeout(() => {
      // Never activate/debit queued bets after the table has been closed.
      const act = mountedRef.current ? liveQueue.activate(balanceRef.current) : { accepted: [], rejected: [], total: 0 };`],
]);
