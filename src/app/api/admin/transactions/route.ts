import { NextResponse } from "next/server";
import { PaymentAccount, Transaction, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

function dateRange(params: URLSearchParams) {
    const date = params.get("date") ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const start = new Date(`${date}T00:00:00`);
        if (!Number.isNaN(start.getTime())) {
            const end = new Date(start); end.setDate(end.getDate() + 1);
            return { $gte: start, $lt: end };
        }
    }
    const week = params.get("week") ?? "";
    const match = /^(\d{4})-W(\d{2})$/.exec(week);
    if (match) {
        const year = Number(match[1]), weekNo = Number(match[2]);
        if (weekNo >= 1 && weekNo <= 53) {
            const jan4 = new Date(year, 0, 4);
            const start = new Date(jan4);
            start.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNo - 1) * 7);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start); end.setDate(end.getDate() + 7);
            return { $gte: start, $lt: end };
        }
    }
    const year = params.get("year") ?? "";
    if (/^\d{4}$/.test(year)) return { $gte: new Date(Number(year), 0, 1), $lt: new Date(Number(year) + 1, 0, 1) };
    const days = Number(params.get("days"));
    if (Number.isInteger(days) && days > 0 && days <= 3650) return { $gte: new Date(Date.now() - days * 86400000), $lt: new Date() };
    return null;
}

export async function GET(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || !isStaff(me.dbRole) || me.level < 1) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

        const params = new URL(request.url).searchParams;
        const type = params.get("type");
        if (type !== "deposit" && type !== "withdraw") return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
        const filter: Record<string, unknown> = { type };
        const status = params.get("status");
        if (["pending", "approved", "rejected"].includes(status ?? "")) filter.status = status;
        const createdAt = dateRange(params);
        if (createdAt) filter.createdAt = createdAt;

        const teamUsers = me.level < 2
            ? await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()
            : null;
        if (teamUsers) filter.userId = { $in: teamUsers.map((user) => user._id) };

        const query = params.get("q")?.trim();
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escaped, "i");
            const matchingUsers = await User.find({
                ...(teamUsers ? { referredBy: me.id, role: { $in: ["client", "agent"] } } : {}),
                $or: [{ name: regex }, { phone: regex }],
            }, "_id").lean();
            filter.$and = [{
                $or: [
                    { senderNumber: regex }, { referenceId: regex }, { provider: regex },
                    { userId: { $in: matchingUsers.map((user) => user._id) } },
                ],
            }];
        }

        const direction = params.get("order") === "asc" ? 1 : -1;
        const transactions = await Transaction.find(filter).sort({ createdAt: direction }).limit(500).lean();
        const userIds = [...new Set(transactions.map((transaction) => String(transaction.userId)))];
        const accountIds = [...new Set(transactions.flatMap((transaction) => transaction.paymentAccountId ? [String(transaction.paymentAccountId)] : []))];
        const [users, accounts] = await Promise.all([
            userIds.length ? User.find({ _id: { $in: userIds } }, "name phone").lean() : [],
            accountIds.length ? PaymentAccount.find({ _id: { $in: accountIds } }, "accountTitle accountNumber").lean() : [],
        ]);
        const userMap = new Map(users.map((user) => [String(user._id), { name: user.name, phone: user.phone }]));
        const accountMap = new Map(accounts.map((account) => [String(account._id), { accountTitle: account.accountTitle, accountNumber: account.accountNumber }]));
        const rows = transactions.map((transaction) => ({
            ...transaction,
            userId: userMap.get(String(transaction.userId)) ?? null,
            paymentAccountId: transaction.paymentAccountId ? accountMap.get(String(transaction.paymentAccountId)) ?? null : null,
        }));
        return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[admin transactions]", error);
        return NextResponse.json({ error: "Transactions load nahi ho sake." }, { status: 503 });
    }
}