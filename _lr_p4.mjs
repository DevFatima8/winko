import { patch } from "./_lr_patch.mjs";
patch("src/components/speed-baccarat/BetSpot.tsx", [
[`  disabled?: boolean;
  size?: "lg" | "sm";`, `  disabled?: boolean;
  /** Still clickable while disabled so the click can queue a bet for the next round. */
  queueable?: boolean;
  size?: "lg" | "sm";`],
[`export default function BetSpot({ meta, amount, disabled, size = "lg", state = null, onClick, onClear }: Props) {`,
`export default function BetSpot({ meta, amount, disabled, queueable, size = "lg", state = null, onClick, onClear }: Props) {`],
[`        disabled={disabled}
        aria-label={\`Bet \${meta.label}\`}`,
`        disabled={disabled && !queueable}
        aria-label={disabled && queueable ? \`Queue \${meta.label} for next round\` : \`Bet \${meta.label}\`}`],
]);
const F = "src/components/speed-baccarat/SpeedBaccaratGame.tsx";
patch(F, [
[`import { sound } from "./lib/sound";
`, `import { sound } from "./lib/sound";
import { LiveBetQueueBar, activationNotice, sumByKey, useLiveBetQueue } from "@/components/LiveBetQueue";
`],
[`  const toastId = useRef(0);
`, `  const toastId = useRef(0);
  const live = useLiveBetQueue<BetKey>();
  const { queue: liveQueue, setNotice: setLiveNotice } = live;
`],
[`      if (phase !== "betting") {
        sound.deny();
        pushToast("Bets are closed — wait for the next shoe call", "info");
        return;
      }
      if (amount > balanceRef.current) {`,
`      if (phase !== "betting") {
        const queued = liveQueue.enqueue(key, amount, balanceRef.current);
        if (queued.ok) {
          sound.chip();
          setLiveNotice(\`\${money(amount)} on \${BET_META[key].label} queued for the next hand.\`);
        } else {
          sound.deny();
          setLiveNotice(queued.error, "error");
        }
        return;
      }
      if (amount > balanceRef.current) {`],
[`    [phase, chip, pushToast],
  );`, `    [phase, chip, pushToast, liveQueue, setLiveNotice],
  );`],
[`    if (autoRef.current) {
      const previous = lastBets ?? EMPTY_BETS;
      const total = totalStake(previous);
      if (total > 0 && total <= balanceRef.current) {
        setBets(previous);
        setBalance((b) => Math.round((b - total) * 100) / 100);
        sound.chip();
      } else if (total > balanceRef.current) {
        setAuto(false);
        pushToast("Auto-bet off — balance below previous stake", "lose");
      }
    }
`, `    let reserved = 0;
    if (autoRef.current) {
      const previous = lastBets ?? EMPTY_BETS;
      const total = totalStake(previous);
      if (total > 0 && total <= balanceRef.current) {
        setBets(previous);
        setBalance((b) => Math.round((b - total) * 100) / 100);
        reserved = total;
        sound.chip();
      } else if (total > balanceRef.current) {
        setAuto(false);
        pushToast("Auto-bet off — balance below previous stake", "lose");
      }
    }

    // Explicit bets queued during the previous hand join this hand exactly once.
    const act = liveQueue.activate(balanceRef.current - reserved);
    if (act.total > 0) {
      const add = sumByKey(act.accepted);
      setBets((prev) => {
        const next = { ...prev };
        (Object.keys(add) as BetKey[]).forEach((k) => {
          next[k] = Math.round((next[k] + (add[k] ?? 0)) * 100) / 100;
        });
        return next;
      });
      setBalance((b) => Math.round((b - act.total) * 100) / 100);
      sound.chip();
    }
    const note = activationNotice(act, money);
    if (note) setLiveNotice(note, act.rejected.length ? "error" : "info");
`],
[`    <div className="speed-baccarat-game w-full h-full overflow-hidden flex flex-col px-1 sm:px-2 md:px-3">
`, `    <div className="speed-baccarat-game w-full h-full overflow-hidden flex flex-col px-1 sm:px-2 md:px-3">
    <LiveBetQueueBar
      bets={live.bets}
      total={live.total}
      notice={live.notice}
      onCancel={() => {
        if (liveQueue.cancel().length) setLiveNotice("Queued bets cancelled — nothing was deducted.");
      }}
      labelFor={(k) => BET_META[k].label}
      money={money}
    />
`],
]);
let s = (await import("node:fs")).readFileSync(F, "utf8");
const before = s.split("disabled={locked}\r\n").length - 1;
console.log("disabled={locked} occurrences", before);
