import { dbConnect } from "./mongo";
import { User, WinHold, oid } from "@/models";

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

/** Return unclaimed held-win totals; legacy holds are claimable immediately too. */
export async function getWinHoldSummary(userId: string) {
    await dbConnect();
    const rows = await WinHold.find({ userId: oid(userId), claimed: false }).lean();
    const claimable = rows.reduce((sum, row) => sum + row.amount, 0);
    return { locked: 0, claimable: Math.round(claimable * 100) / 100 };
}

/** Credit every unclaimed held-win amount to the user's balance and mark it claimed. */
export async function claimWinHolds(userId: string) {
    await dbConnect();
    const now = new Date();
    const rows = await WinHold.find({ userId: oid(userId), claimed: false }).lean();
    const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    if (total <= 0) return { claimed: 0 };
    await WinHold.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { claimed: true, claimedAt: now } });
    await User.updateOne({ _id: oid(userId) }, { $inc: { balance: total } });
    return { claimed: total };
}
