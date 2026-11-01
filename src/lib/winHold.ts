import { dbConnect } from "./mongo";
import { User, WinHold, oid } from "@/models";
import { isMysqlEnabled } from "./mysql";
import { mysqlMultiplayerStore } from "./multiplayer-store";
import { claimWinningsTransaction, pendingReferralCommission, summarizeWinHolds } from "./providerWinnings";

/** The 2% withheld from a gross win (matches outcomes.ts payoutAfterHouseShare). */
export const heldPortion = (grossPayout: number) => Math.round(Math.max(0, grossPayout) * 0.02 * 100) / 100;

/** Record the 2% held from a win as immediately claimable. */
export async function holdWinShare(userId: string, grossPayout: number) {
    const amount = heldPortion(grossPayout);
    if (amount <= 0) return;
    await dbConnect();
    const now = new Date();
    await WinHold.create({ userId: oid(userId), amount, unlockAt: now });
}

/** New provider payouts unlock at next PKT midnight; legacy holds stay immediately claimable. */
export async function getWinHoldSummary(userId: string) {
    await dbConnect();
    const [rows, user] = await Promise.all([
        WinHold.find({ userId: oid(userId), claimed: false }).lean(),
        User.findById(oid(userId)).lean(),
    ]);
    if (!user) throw new Error("Player account not found.");
    return { ...summarizeWinHolds(rows, Date.now()), referralClaimable: pendingReferralCommission(user) };
}

/** Credit every unclaimed held-win amount to the user's balance and mark it claimed. */
export async function claimWinHolds(userId: string) {
    await dbConnect();
    if (isMysqlEnabled()) {
        return mysqlMultiplayerStore.transact("winnings:claim", tx => claimWinningsTransaction(tx, String(userId)));
    }
    const now = new Date();
    const rows = (await WinHold.find({ userId: oid(userId), claimed: false }).lean())
        .filter(row => summarizeWinHolds([row], now.getTime()).claimable > 0);
    if (rows.some(row => row.provider === "gregmorn")) throw new Error("Provider winnings require MySQL for atomic claims.");
    const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const user = await User.findById(oid(userId)).lean();
    if (!user || !user.isActive || (user.role !== "client" && user.role !== "agent")) throw new Error("Active player account required.");
    const referral = pendingReferralCommission(user);
    const claimed = Math.round((total + referral) * 100) / 100;
    if (claimed <= 0) return { claimed: 0 };
    if (!Number.isFinite(user.balance) || user.balance < 0 || user.balance + claimed > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
    if (referral > 0) {
        const updated = await User.updateOneAtomic(
            { _id: oid(userId), balance: user.balance, pendingReferralCommission: user.pendingReferralCommission, isActive: true },
            { $inc: { balance: referral }, $set: { pendingReferralCommission: 0 } },
        );
        if (!updated.modifiedCount) throw new Error("Wallet changed during claim. Please retry.");
    }
    if (total > 0) {
        await WinHold.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { claimed: true, claimedAt: now } });
        await User.updateOne({ _id: oid(userId) }, { $inc: { balance: total } });
    }
    return { claimed };
}
