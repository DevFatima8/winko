import { NextResponse } from "next/server";
import { PaymentAccount, Transaction, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { assignPaymentAccounts, getSettings, vipInfo, withdrawalCountToday, withdrawnToday } from "@/lib/platform";
import { gatewayConfig } from "@/lib/gateway";
import { getWinHoldSummary } from "@/lib/winHold";

export async function GET() {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });

        const assigned = await assignPaymentAccounts(me.id);
        const assignedIds = new Set(["jazzcash", "easypaisa", "raast"].flatMap(provider => assigned[provider] ? [assigned[provider]] : []));
        const rows = await PaymentAccount.find({ isActive: true }).sort({ createdAt: 1 }).lean();
        const accounts = rows.filter((account) => assignedIds.has(String(account._id)))
            .map((account) => ({ id: String(account._id), provider: account.provider, accountTitle: account.accountTitle, accountNumber: account.accountNumber, qrImage: account.qrImage ?? null }));
        const qr = rows.find(account => String(account._id) === assigned.qr);
        const qrAccount = qr ? { id: String(qr._id), provider: qr.provider, accountTitle: qr.accountTitle, accountNumber: qr.accountNumber, qrImage: qr.qrImage ?? null } : null;
        const settings = await getSettings();
        const { cur } = vipInfo(me.vipLevel, settings.vipLevels);
        const usedToday = await withdrawnToday(me.id);
        const withdrawalsToday = await withdrawalCountToday(me.id);
        const gateway = await gatewayConfig();
        const holds = await getWinHoldSummary(me.id);
        const [user, approvedDeposits] = await Promise.all([
            User.findById(me.id, "withdrawalAccounts firstDepositBonusTransactionId totalDeposited").lean(),
            Transaction.countDocuments({ userId: me.id, type: "deposit", status: "approved" }),
        ]);

        return NextResponse.json({
            me,
            accounts,
            qrAccount,
            firstDepositBonusEligible: approvedDeposits === 0 && !(user?.totalDeposited > 0) && !user?.firstDepositBonusTransactionId,
            withdrawalAccounts: user?.withdrawalAccounts ?? {},
            minDeposit: settings.wallet?.minDeposit ?? 10,
            limits: {
                name: `VIP ${me.vipLevel} ${cur?.name ?? ""}`,
                daily: cur?.dailyWithdrawLimit ?? 0,
                perMax: cur?.perWithdrawMax ?? 0,
                usedToday,
                withdrawalsToday,
                withdrawalsPerDay: cur?.withdrawalsPerDay ?? 0,
                min: cur?.minWithdraw ?? settings.wallet?.minWithdraw ?? 1000,
            },
            gateway: {
                enabled: gateway.enabled,
                autoWithdraw: gateway.autoWithdraw,
                label: gateway.label,
                maxPerTxn: gateway.maxPerTxn,
                minDeposit: gateway.minDeposit,
                minWithdraw: gateway.minWithdraw,
            },
            holds,
        });
    } catch (error) {
        console.error("[player wallet]", error);
        return NextResponse.json({ error: "Wallet data load nahi ho saka." }, { status: 500 });
    }
}