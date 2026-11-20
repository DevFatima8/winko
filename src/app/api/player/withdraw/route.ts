import { NextResponse } from "next/server";
import { PaymentAccount, Transaction, User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings, vipInfo, withdrawalCountToday, withdrawnToday } from "@/lib/platform";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { isWithdrawalProvider, receivingAccountError } from "@/lib/paymentMethods";

export async function GET(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const id = new URL(request.url).searchParams.get("id")?.trim();
        if (id) {
            const transaction = await Transaction.findOne({ _id: oid(id), userId: oid(me.id), type: "withdraw" }, "status adminNote").lean();
            if (!transaction) return NextResponse.json({ error: "Withdrawal request not found." }, { status: 404 });
            return NextResponse.json({ status: transaction.status, adminNote: transaction.adminNote ?? null }, { headers: { "Cache-Control": "no-store" } });
        }
        const rows = await Transaction.find({ userId: me.id, type: "withdraw" }).sort({ createdAt: -1 }).limit(100).lean();
        return NextResponse.json({ transactions: rows.map(({ _id, provider, institution, amount, status, createdAt, adminNote }) => ({ _id, provider, institution, amount, status, createdAt, adminNote })) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[withdrawal records]", error);
        return NextResponse.json({ error: "Withdrawal records load nahi ho sake." }, { status: 503 });
    }
}

export async function POST(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const form = await request.formData();
        const amount = Math.floor(Number(form.get("amount")));
        const provider = String(form.get("provider") ?? "");
        const accountNumber = String(form.get("accountNumber") ?? "").trim();
        const holderName = String(form.get("holderName") ?? form.get("accountName") ?? "").trim();
        const pin = String(form.get("pin") ?? "");
        const institution = String(form.get("institution") ?? "").trim();
        if (!isWithdrawalProvider(provider)) return NextResponse.json({ error: "Provider select karein." }, { status: 400 });
        const accountError = receivingAccountError(provider, holderName, accountNumber, institution);
        if (accountError) return NextResponse.json({ error: accountError }, { status: 400 });

        const user = await User.findById(me.id, "withdrawPin vipLevel assignedAccounts").lean();
        if (!user?.withdrawPin) return NextResponse.json({ error: "Pehle yahin Withdrawal PIN set karein." }, { status: 400 });
        if (pin !== user.withdrawPin) return NextResponse.json({ error: "Withdrawal PIN ghalat hai." }, { status: 400 });
        const settings = await getSettings();
        const { cur } = vipInfo(user.vipLevel ?? 0, settings.vipLevels);
        const min = cur?.minWithdraw ?? settings.wallet?.minWithdraw ?? 500;
        if (!Number.isFinite(amount) || amount < min) return NextResponse.json({ error: `Minimum withdraw Rs. ${min} hai.` }, { status: 400 });
        const countToday = await withdrawalCountToday(me.id);
        if (cur?.withdrawalsPerDay && countToday >= cur.withdrawalsPerDay) return NextResponse.json({ error: `Aapki VIP level (${cur.name}) par rozana ${cur.withdrawalsPerDay} withdrawals allowed hain.` }, { status: 400 });
        if (cur?.perWithdrawMax && amount > cur.perWithdrawMax) return NextResponse.json({ error: `Aapki VIP level (${cur.name}) par ek withdraw max Rs. ${cur.perWithdrawMax.toLocaleString()} hai.` }, { status: 400 });
        const today = await withdrawnToday(me.id);
        if (cur?.dailyWithdrawLimit && today + amount > cur.dailyWithdrawLimit) return NextResponse.json({ error: `Daily limit Rs. ${cur.dailyWithdrawLimit.toLocaleString()} (${cur.name}). Aaj baqi: Rs. ${Math.max(0, cur.dailyWithdrawLimit - today).toLocaleString()}. VIP level barhayein.` }, { status: 400 });

        const assignedId = (user.assignedAccounts?.[provider] as string) ?? null;
        const account = assignedId ? await PaymentAccount.findById(assignedId).lean() : null;
        const update = await User.updateOne({ _id: oid(me.id), balance: { $gte: amount } }, { $inc: { balance: -amount } });
        if (!update.modifiedCount) return NextResponse.json({ error: "Insufficient balance." }, { status: 400 });
        const transaction = await Transaction.create({
            userId: oid(me.id), type: "withdraw", provider, amount, senderNumber: accountNumber, holderName, institution,
            assignedAccountId: account?._id ? String(account._id) : null,
            paymentAccountId: account?._id ? account._id : null,
            accountName: account?.accountTitle ?? null, method: "manual",
        });
        await notifyUser(me.id, "Withdrawal request received", `Your request is in process. Amount: Rs. ${amount.toLocaleString()}.`, "info", { href: "/player/withdraw" });
        await notifyAdmins("New withdrawal request", `${me.name} requested a withdrawal of Rs. ${amount.toLocaleString()} via ${provider}.`, "warning", { href: "/admin/withdrawals?status=pending" });
        const referrer = await User.findById(me.id, "referredBy").lean();
        if (referrer?.referredBy) await notifyUser(String(referrer.referredBy), "New withdrawal request", `${me.name} requested a withdrawal of Rs. ${amount.toLocaleString()} via ${provider}.`, "warning", { href: "/admin/withdrawals?status=pending" });
        return NextResponse.json({ success: "Your request is in process", transactionId: String(transaction._id) });
    } catch (error) {
        console.error("[player withdraw]", error);
        return NextResponse.json({ error: "Withdrawal request submit nahi ho saki." }, { status: 500 });
    }
}