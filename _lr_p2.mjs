import { patch } from "./_lr_patch.mjs";
patch("src/components/CardTable.tsx", [
[`  myTotal: number; myExpected: number;
`, `  myTotal: number; myExpected: number;
  queued?: { roundNo: number; bets: { option: string; amount: number }[]; total: number };
`],
[`  const post = async (method: "POST" | "DELETE", body?: unknown) => {
    setBusy(true);
    const r = await localApi(\`/api/cards/bet\${method === "DELETE" ? \`?table=\${table}\` : ""}\`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    setBusy(false);
    return j;
  };

  const bet = async (option: string, amount = chip) => {
    if (busy) return;
    if (amount < 50) {
      setMsg({ t: "err", m: "Minimum bet is Rs. 50. Please place at least 50." });
      return;
    }
    const j = await post("POST", { table, option, amount });
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg(null);
    refresh();
  };
  const cancel = async () => {
    const j = await post("DELETE");
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg({ t: "info", m: \`Bets cancel — \${money(j.refunded)} wapas.\` });
    refresh();
  };`,
`  const post = async (method: "POST" | "DELETE", body?: unknown, scope?: "queued") => {
    setBusy(true);
    try {
      const r = await localApi(\`/api/cards/bet\${method === "DELETE" ? \`?table=\${table}\${scope ? \`&scope=\${scope}\` : ""}\` : ""}\`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return await r.json().catch(() => ({ error: "Server response samajh nahi aaya. Dobara try karein." }));
    } catch {
      return { error: "Network error — bet nahi lagi. Dobara try karein." };
    } finally {
      setBusy(false);
    }
  };

  const bet = async (option: string, amount = chip) => {
    if (busy) return;
    if (amount < 50) {
      setMsg({ t: "err", m: "Minimum bet is Rs. 50. Please place at least 50." });
      return;
    }
    const s = stRef.current;
    if (!s) return;
    if (amount > s.balance) {
      setMsg({ t: "err", m: "Insufficient balance. Pehle deposit karein." });
      return;
    }
    // Bets after the current round closes are explicitly targeted at the next round (N+1).
    const open = s.round.status === "betting" && Date.now() + offset < s.round.bettingEndsAt - 600;
    const targetRound = open ? s.round.roundNo : s.round.roundNo + 1;
    const j = await post("POST", { table, option, amount, targetRound });
    if (j.error) setMsg({ t: "err", m: j.error });
    else if (j.queued) setMsg({ t: "info", m: \`\${money(amount)} \${s.config.options[option]?.label ?? option} round #\${j.roundNo} ke liye queue ho gaya — current round mein settle nahi hoga.\` });
    else setMsg(null);
    refresh();
  };
  const cancel = async () => {
    const j = await post("DELETE");
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg({ t: "info", m: \`Bets cancel — \${money(j.refunded)} wapas.\` });
    refresh();
  };
  const cancelQueued = async () => {
    if (busy) return;
    const j = await post("DELETE", undefined, "queued");
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg({ t: "info", m: \`Queued bets cancel — \${money(j.refunded)} wapas.\` });
    refresh();
  };`],
[`  const myBy = (o: string) => st.myBets.filter((b) => b.option === o).reduce((s, b) => s + b.amount, 0);
`, `  const myBy = (o: string) => st.myBets.filter((b) => b.option === o).reduce((s, b) => s + b.amount, 0);
  const queued = st.queued && st.queued.total > 0 ? st.queued : null;
  const queuedBy = (o: string) => (queued ? queued.bets.filter((b) => b.option === o).reduce((s, b) => s + b.amount, 0) : 0);
`],
[`              const z = ZONE[o]; const cfg = st.config.options[o]; const tot = st.totals[o]; const mine = myBy(o);`,
`              const z = ZONE[o]; const cfg = st.config.options[o]; const tot = st.totals[o]; const mine = myBy(o); const next = queuedBy(o);`],
[`                  disabled={!inBetting || busy}
                  onClick={() => bet(o)}`,
`                  disabled={busy}
                  onClick={() => bet(o)}
                  title={inBetting ? undefined : \`Betting band — tap karke agle round #\${round.roundNo + 1} ke liye queue karein\`}`],
[`                    ) : (
                      <span className="text-[9px] font-bold text-white/80">{inBetting ? \`Tap: +\${chip}\` : "—"}</span>
                    )}`,
`                    ) : next > 0 ? (
                      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-white">Next round: {money(next)}</span>
                    ) : (
                      <span className="text-[9px] font-bold text-white/80">{inBetting ? \`Tap: +\${chip}\` : \`Queue next: +\${chip}\`}</span>
                    )}`],
[`              <span>Min {st.config.min} · Max {st.config.max.toLocaleString()}</span>
            </div>
`, `              <span>Min {st.config.min} · Max {st.config.max.toLocaleString()}</span>
            </div>
            {queued && (
              <div role="status" className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-[#38bdf8] bg-[#0c4a6e] px-2.5 py-1 text-[10px] text-[#e0f2fe]">
                <span>
                  Queued for round #{queued.roundNo}: <b className="text-white">{money(queued.total)}</b>{" "}
                  <span className="text-[#bae6fd]">({opts.filter((o) => queuedBy(o) > 0).map((o) => \`\${st.config.options[o].label} \${queuedBy(o)}\`).join(", ")})</span>
                </span>
                <button disabled={busy} onClick={cancelQueued} className="shrink-0 rounded bg-[#dc2626] hover:bg-[#b91c1c] border border-[#ef4444] px-2 py-0.5 text-[10px] font-black text-white disabled:opacity-40 cursor-pointer">Cancel queued</button>
              </div>
            )}
`],
]);
