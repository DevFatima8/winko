import { dbConnect } from "./mongo";
import { User, WinHold, oid } from "@/models";
import { isMysqlEnabled } from "./mysql";
import { mysqlMultiplayerStore } from "./multiplayer-store";
import { claimWinningsTransaction, summarizeReferralCommission, summarizeWinHolds, type ClaimKind } from "./providerWinnings";

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

/** Legacy held payouts are released automatically when the player wallet is loaded. */
export async function getWinHoldSummary(userId: string) {
    await dbConnect();
    const [rows, user] = await Promise.all([
        WinHold.find({ userId: oid(userId), claimed: false }).lean(),
        User.findById(oid(userId)).lean(),
    ]);
    if (!user) throw new Error("Player account not found.");
    const now = Date.now();
    const referral = summarizeReferralCommission(user, now);
    return { ...summarizeWinHolds(rows, now), referralClaimable: referral.claimable, referralLocked: referral.locked };
}

/** Credit every unclaimed held-win amount to the user's balance and mark it claimed. */
export async function claimWinHolds(userId: string, kind: ClaimKind = "winnings") {
    await dbConnect();
    if (isMysqlEnabled()) {
        return mysqlMultiplayerStore.transact("winnings:claim", tx => claimWinningsTransaction(tx, String(userId), kind));
    }
    const now = new Date();
    const rows = kind === "referral" ? [] : await WinHold.find({ userId: oid(userId), claimed: false }).lean();
    if (rows.some(row => row.provider === "gregmorn")) throw new Error("Provider winnings require MySQL for atomic claims.");
    const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const user = await User.findById(oid(userId)).lean();
    if (!user || !user.isActive || (user.role !== "client" && user.role !== "agent")) throw new Error("Active player account required.");
    const referralSummary = kind === "referral" ? summarizeReferralCommission(user, now.getTime()) : null;
    const referral = referralSummary?.claimable ?? 0;
    const claimed = Math.round((total + referral) * 100) / 100;
    if (claimed <= 0) return { claimed: 0 };
    if (!Number.isFinite(user.balance) || user.balance < 0 || user.balance + claimed > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
    if (referralSummary && referral > 0) {
        const updated = await User.updateOneAtomic(
            { _id: oid(userId), balance: user.balance, pendingReferralCommission: user.pendingReferralCommission, isActive: true },
            { $inc: { balance: referral }, $set: {
                pendingReferralCommission: referralSummary.locked,
                pendingReferralCommissionByUnlock: referralSummary.remaining,
            } },
        );
        if (!updated.modifiedCount) throw new Error("Wallet changed during claim. Please retry.");
    }
    if (total > 0) {
        await WinHold.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { claimed: true, claimedAt: now } });
        await User.updateOne({ _id: oid(userId) }, { $inc: { balance: total } });
    }
    return { claimed };
}
