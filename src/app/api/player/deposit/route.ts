import { NextResponse } from "next/server";
import { PaymentAccount, Transaction, User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { assignPaymentAccounts, getSettings } from "@/lib/platform";
import { notifyAdmins, notifyUser } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });

    const form = await request.formData();
    const amount = Number(form.get("amount"));
    const paymentAccountId = String(form.get("paymentAccountId") ?? "").trim();
    const requestedMethod = String(form.get("paymentMethod") ?? "").trim();
    const senderNumber = String(form.get("senderNumber") ?? "").trim() || "Not provided";
    const referenceId = String(form.get("referenceId") ?? "").trim();
    const proof = form.get("proofImage");
    let proofImage: string | null = null;
    if (proof instanceof File && proof.size > 0) {
      if (!proof.type.startsWith("image/")) return NextResponse.json({ error: "Payment proof image honi chahiye." }, { status: 400 });
      if (proof.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Screenshot 2MB se chhota hona chahiye." }, { status: 400 });
      proofImage = `data:${proof.type};base64,${Buffer.from(await proof.arrayBuffer()).toString("base64")}`;
    }
    const settings = await getSettings();
    const minDeposit = Math.min(settings.wallet?.minDeposit ?? 10, 10);
    if (!Number.isFinite(amount) || amount < minDeposit) return NextResponse.json({ error: `Minimum deposit Rs. ${minDeposit} hai.` }, { status: 400 });
    if (!paymentAccountId) return NextResponse.json({ error: "Payment account select karein." }, { status: 400 });
    if (!referenceId && !proofImage) return NextResponse.json({ error: "Payment ka screenshot upload karein." }, { status: 400 });

    const user = await User.findById(me.id, "paymentDepositLimit").lean();
    if (user?.paymentDepositLimit && user.paymentDepositLimit > 0) {
      const [used] = await Transaction.aggregate<{ s: number }>([
        { $match: { userId: oid(me.id), type: "deposit", status: { $in: ["pending", "approved"] } } },
        { $group: { _id: null, s: { $sum: "$amount" } } },
      ]);
      if ((used?.s ?? 0) + amount > user.paymentDepositLimit) {
        return NextResponse.json({ error: `Payment lock active hai. Aapki total deposit limit Rs. ${user.paymentDepositLimit.toLocaleString()} hai; baqi Rs. ${Math.max(0, user.paymentDepositLimit - (used?.s ?? 0)).toLocaleString()} hai.` }, { status: 400 });
      }
    }

    const assigned = await assignPaymentAccounts(me.id);
    const account = await PaymentAccount.findById(paymentAccountId).lean();
    if (!account?.isActive) return NextResponse.json({ error: "Invalid payment account." }, { status: 400 });
    const paymentMethod = requestedMethod === "qr" ? "qr" : account.provider;
    if ((requestedMethod && requestedMethod !== paymentMethod) || assigned[paymentMethod] !== paymentAccountId ||
        (paymentMethod === "qr" && !account.qrImage)) {
      return NextResponse.json({ error: "Payment account assignment changed. Deposit page dobara kholein." }, { status: 409 });
    }

    await Transaction.create({
      userId: oid(me.id), type: "deposit", provider: account.provider, amount,
      paymentMethod,
      paymentAccountId: account._id, assignedAccountId: account._id, accountName: account.accountTitle,
      senderNumber, referenceId: referenceId || null, proofImage, method: "manual",
    });
    await notifyUser(me.id, "Purchase request received", `Your deposit request of Rs. ${amount.toLocaleString()} has been sent for admin verification.`, "info", { href: "/player/wallet" });
    await notifyAdmins("New deposit request", `${me.name} requested a deposit of Rs. ${amount.toLocaleString()} via ${account.provider}.`, "info", { href: "/admin/deposits?status=pending" });
    const referrer = await User.findById(me.id, "referredBy").lean();
    if (referrer?.referredBy) await notifyUser(String(referrer.referredBy), "New deposit request", `${me.name} requested a deposit of Rs. ${amount.toLocaleString()} via ${account.provider}.`, "info", { href: "/admin/deposits?status=pending" });
    return NextResponse.json({ success: "Deposit request submit ho gayi. Admin verify kar ke balance add karega." });
  } catch (error) {
    console.error("[player deposit]", error);
    return NextResponse.json({ error: "Deposit request submit nahi ho saki." }, { status: 500 });
  }
}