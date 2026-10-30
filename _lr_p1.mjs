import { patch } from "./_lr_patch.mjs";
patch("src/lib/cards.ts", [
[`const r2 = (n: number) => Math.round(n * 100) / 100;
`, `const r2 = (n: number) => Math.round(n * 100) / 100;

export type BetTarget = { roundNo: number; queued: boolean };

/** Round that an explicit bet submitted at \`now\` belongs to: the open round, otherwise the next round (N+1). */
export function betTargetFor(r: { roundNo: number; status: string; bettingEndsAt: Date | string | number }, now = Date.now()): BetTarget {
  const open = r.status === "betting" && now <= new Date(r.bettingEndsAt).getTime() - CLOSE_GRACE_MS;
  return open ? { roundNo: r.roundNo, queued: false } : { roundNo: r.roundNo + 1, queued: true };
}
`],
[`  const [myBets, totals, history, me] = await Promise.all([
    uid ? CardBet.find({ userId: uid, table, roundNo: round.roundNo }).sort({ createdAt: 1 }).lean() : [],`,
`  const [myBets, queuedBets, totals, history, me] = await Promise.all([
    uid ? CardBet.find({ userId: uid, table, roundNo: round.roundNo }).sort({ createdAt: 1 }).lean() : [],
    uid ? CardBet.find({ userId: uid, table, roundNo: round.roundNo + 1, status: "pending" }).sort({ createdAt: 1 }).lean() : [],`],
[`    myTotal: myBets.reduce((s, b) => s + b.amount, 0),
    myExpected,`,
`    myTotal: myBets.reduce((s, b) => s + b.amount, 0),
    myExpected,
    queued: {
      roundNo: round.roundNo + 1,
      bets: queuedBets.map((b) => ({ option: b.option, amount: b.amount })),
      total: queuedBets.reduce((s, b) => s + b.amount, 0),
    },`],
[`export async function placeBet(userId: string, table: Table, option: string, amount: number) {`,
`/**
 * Places an explicit bet. While the current round is open it joins that round; once betting has closed
 * (reveal running or the last grace window) it is reserved for the next round (N+1) and can never settle in N.
 * \`targetRound\` is the round the client intended; a mismatch is rejected without touching the balance.
 */
export async function placeBet(userId: string, table: Table, option: string, amount: number, targetRound?: number) {`],
[`    if (r.status !== "betting" || Date.now() > new Date(r.bettingEndsAt).getTime() - CLOSE_GRACE_MS) return { error: "Betting band ho gayi. Agla round wait karein." };
    const uid = oid(userId);
    const upd = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
    if (!upd.modifiedCount) return { error: "Insufficient balance. Pehle deposit karein." };
    await CardBet.create({ userId: uid, table, roundNo: r.roundNo, option, amount });
    const gid = await gameIdFor(table);
    await GameResult.updateOne(
      { gameId: gid, roundNo: r.roundNo, userId: uid },
      { $inc: { betAmount: amount }, $setOnInsert: { outcome: "pending", winAmount: 0, resultData: \`\${TABLES[table].name} · round #\${r.roundNo} · waiting\` } },
      { upsert: true },
    );
    return { ok: true };`,
`    const target = betTargetFor(r);
    if (targetRound !== undefined && targetRound !== target.roundNo) {
      return {
        error: target.queued
          ? \`Round #\${r.roundNo} ki betting band ho gayi. Agle round #\${target.roundNo} ke liye dobara bet lagayein.\`
          : \`Round badal gaya — ab round #\${target.roundNo} ki betting chal rahi hai. Dobara bet lagayein.\`,
        roundChanged: true,
        roundNo: target.roundNo,
      };
    }
    const uid = oid(userId);
    const upd = await User.updateOne({ _id: uid, balance: { $gte: amount } }, { $inc: { balance: -amount } });
    if (!upd.modifiedCount) return { error: "Insufficient balance. Pehle deposit karein." };
    await CardBet.create({ userId: uid, table, roundNo: target.roundNo, option, amount });
    const gid = await gameIdFor(table);
    await GameResult.updateOne(
      { gameId: gid, roundNo: target.roundNo, userId: uid },
      { $inc: { betAmount: amount }, $setOnInsert: { outcome: "pending", winAmount: 0, resultData: \`\${TABLES[table].name} · round #\${target.roundNo} · \${target.queued ? "queued for next round" : "waiting"}\` } },
      { upsert: true },
    );
    return { ok: true, roundNo: target.roundNo, queued: target.queued };`],
[`export async function cancelBets(userId: string, table: Table) {
  return withTable(table, async (r) => {
    if (r.status !== "betting") return { error: "Ab cancel nahi ho sakta." };
    const uid = oid(userId);
    const bets = await CardBet.find({ userId: uid, table, roundNo: r.roundNo, status: "pending" }).lean();
    if (!bets.length) return { error: "Is round mein koi bet nahi." };
    const total = bets.reduce((s, b) => s + b.amount, 0);
    await CardBet.deleteMany({ _id: { $in: bets.map((b) => b._id) } });
    await GameResult.deleteOne({ gameId: await gameIdFor(table), roundNo: r.roundNo, userId: uid });
    await User.updateOne({ _id: uid }, { $inc: { balance: total } });
    return { ok: true, refunded: total };
  });
}`,
`/** Cancels the caller's pending bets for the open round ("current") or the reserved next round ("queued"). */
export async function cancelBets(userId: string, table: Table, scope: "current" | "queued" = "current") {
  return withTable(table, async (r) => {
    const queued = scope === "queued";
    if (!queued && r.status !== "betting") return { error: "Ab cancel nahi ho sakta." };
    const roundNo = queued ? r.roundNo + 1 : r.roundNo;
    const uid = oid(userId);
    const bets = await CardBet.find({ userId: uid, table, roundNo, status: "pending" }).lean();
    if (!bets.length) return { error: queued ? "Agle round ke liye koi queued bet nahi (shayad round shuru ho chuka hai)." : "Is round mein koi bet nahi." };
    const total = bets.reduce((s, b) => s + b.amount, 0);
    await CardBet.deleteMany({ _id: { $in: bets.map((b) => b._id) } });
    await GameResult.deleteOne({ gameId: await gameIdFor(table), roundNo, userId: uid });
    await User.updateOne({ _id: uid }, { $inc: { balance: total } });
    return { ok: true, refunded: total, roundNo, queued };
  });
}`],
]);
patch("src/app/api/[...path]/route.ts", [
[`return cards.isTable(table) ? response(await cards.placeBet(me!.id, table, String(body.option ?? ""), Number(body.amount))) : errorResponse("Invalid table");`,
`const targetRound = body.targetRound === undefined || body.targetRound === null ? undefined : Number(body.targetRound);
                return cards.isTable(table) ? response(await cards.placeBet(me!.id, table, String(body.option ?? ""), Number(body.amount), targetRound)) : errorResponse("Invalid table");`],
[`return cards.isTable(table) ? response(await cards.cancelBets(me!.id, table)) : errorResponse("Invalid table");`,
`const scope = query.get("scope") === "queued" ? "queued" : "current";
                return cards.isTable(table) ? response(await cards.cancelBets(me!.id, table, scope)) : errorResponse("Invalid table");`],
]);
