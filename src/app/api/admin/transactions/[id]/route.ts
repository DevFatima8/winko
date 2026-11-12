import { NextResponse } from "next/server";
import { AdminLog, PaymentAccount, Transaction, User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isStaff } from "@/lib/auth";
import { notifyUser } from "@/lib/notifications";
import { payDepositCommission, recomputeVip } from "@/lib/platform";
import { approveDeposit } from "@/lib/depositApproval";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getServerSessionUser();
    if (!me || !isStaff(me.dbRole) || me.level < 1) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    const note = typeof body.note === "string" ? body.note : null;
    const slip = typeof body.slipImage === "string" ? body.slipImage : "";
    if (slip && (!/^data:image\/(png|jpe?g|webp);base64,/i.test(slip) || slip.length > 1_500_000)) return NextResponse.json({ error: "Payment slip image invalid ya bohat bari hai." }, { status: 400 });
    const pending = await Transaction.findOne({ _id: oid(id), status: "pending" }).lean();
    if (!pending) return NextResponse.json({ error: "Pending request nahi mili." }, { status: 404 });
    const account = pending.paymentAccountId ? await PaymentAccount.findById(oid(pending.paymentAccountId)).lean() : null;
    if (me.level < 2) {
      const member = await User.findOne({ _id: pending.userId, referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean();
      if (!member) return NextResponse.json({ error: "Ye player aapki team mein nahi hai." }, { status: 403 });
    }
    const depositApproval = pending.type === "deposit" && decision === "approved"
      ? await approveDeposit(String(pending._id), String(pending.userId), { adminNote: note, processedById: me.id, processedByName: me.name, accountName: account?.accountTitle ?? null }, me.dbRole)
      : null;
    const updated = pending.type === "deposit" && decision === "approved" ? null : await Transaction.updateOneAtomic(
      { _id: oid(id), status: "pending" },
      { $set: { status: decision, adminNote: note, processedAt: new Date(), processedById: me.id, processedByName: me.name, accountName: account?.accountTitle ?? null, ...(slip && pending.type === "withdraw" ? { slipImage: slip } : {}) } },
    );
    const transaction = depositApproval?.transaction ?? (updated?.modifiedCount ? await Transaction.findById(oid(id)).lean() : null);
    if (!transaction) return NextResponse.json({ error: "Pending request nahi mili." }, { status: 409 });

    if (transaction.type === "deposit" && decision === "approved") {
      await recomputeVip(transaction.userId);
      await payDepositCommission(transaction.userId, transaction.amount, me.dbRole);
    }
    if (transaction.type === "withdraw" && decision === "rejected") {
      await User.updateOneAtomic({ _id: transaction.userId }, { $inc: { balance: transaction.amount } });
    }
    if (transaction.type === "withdraw" && decision === "approved") await recomputeVip(transaction.userId);

    const actionLabel = decision === "approved" ? "approved" : "rejected";
    const transactionLabel = transaction.type === "deposit" ? "Purchase/deposit" : "Withdrawal";
    await notifyUser(String(transaction.userId), `${transactionLabel} ${actionLabel}`, `Your ${transactionLabel.toLowerCase()} of Rs. ${transaction.amount.toLocaleString()} has been ${actionLabel} by admin.${note ? ` Note: ${note}` : ""}`, decision === "approved" ? "success" : "warning", { href: "/player/wallet", actorRole: me.dbRole });
    await AdminLog.create({ actorId: me.id, actorName: me.name, actorRole: me.dbRole, action: `${decision}_${transaction.type}`, target: String(transaction.userId), details: `Rs. ${transaction.amount}` });
    return NextResponse.json({ success: `${transactionLabel} ${actionLabel}.` });
  } catch (error) {
    console.error("[admin transaction]", error);
    return NextResponse.json({ error: "Transaction process nahi ho saki." }, { status: 500 });
  }
}