import { NextResponse } from "next/server";
import { Transaction, User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings } from "@/lib/platform";
import { createCollectionOrder, getNgPayConfig } from "@/lib/ngpay";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const provider = String(body.provider ?? "easypaisa").toLowerCase();
    const senderNumber = String(body.senderNumber ?? body.mobile ?? "").trim().replace(/\s|-/g, "");
    const direct = Boolean(body.direct);

    if (provider !== "easypaisa" && provider !== "jazzcash") {
      return NextResponse.json({ error: "Provider must be EasyPaisa or JazzCash." }, { status: 400 });
    }

    const settings = await getSettings();
    const minDeposit = Math.min(settings.wallet?.minDeposit ?? 10, 10);
    if (!Number.isFinite(amount) || amount < minDeposit) {
      return NextResponse.json({ error: `Minimum deposit Rs. ${minDeposit} hai.` }, { status: 400 });
    }

    if (direct && !senderNumber) {
      return NextResponse.json({ error: "Direct Pay ke liye apna JazzCash / Easypaisa mobile number lazmi darj karein." }, { status: 400 });
    }

    if (senderNumber && !/^03\d{9}$/.test(senderNumber)) {
      return NextResponse.json({ error: "Mobile number 03XXXXXXXXX format (11 digits) mein hona chahiye." }, { status: 400 });
    }

    // Check user deposit limit
    const user = await User.findById(me.id, "paymentDepositLimit").lean();
    if (user?.paymentDepositLimit && user.paymentDepositLimit > 0) {
      const [used] = await Transaction.aggregate<{ s: number }>([
        { $match: { userId: oid(me.id), type: "deposit", status: { $in: ["pending", "approved"] } } },
        { $group: { _id: null, s: { $sum: "$amount" } } },
      ]);
      if ((used?.s ?? 0) + amount > user.paymentDepositLimit) {
        return NextResponse.json({
          error: `Payment lock active hai. Aapki total deposit limit Rs. ${user.paymentDepositLimit.toLocaleString()} hai.`,
        }, { status: 400 });
      }
    }

    const cfg = getNgPayConfig();
    const isMockMode = !cfg.secretKey || cfg.secretKey.trim() === "";

    // Generate unique order ID (max 64 chars)
    const merchantOrderNo = `WXDEP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

    // Client IP
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") || "182.239.127.137";

    const host = request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const appUrl = `${proto}://${host}`;

    const publicBase = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost"))
      ? process.env.NEXT_PUBLIC_APP_URL
      : (host.includes("localhost") ? "https://winkox.com" : appUrl);

    const notifyUrl = `${publicBase}/api/gateway/ngpay/notify`;
    const viewUrl = `${appUrl}/player/wallet?payment=success&order=${merchantOrderNo}`;

    // Select payType according to NG-Pay documentation
    let payType: "EASYPAISA" | "JAZZ_CASH" | "EASYPAISA_DIRECT" | "JAZZ_CASH_DIRECT";
    if (provider === "easypaisa") {
      payType = direct ? "EASYPAISA_DIRECT" : "EASYPAISA";
    } else {
      payType = direct ? "JAZZ_CASH_DIRECT" : "JAZZ_CASH";
    }

    // Create pending transaction in DB
    const tx = await Transaction.create({
      userId: oid(me.id),
      type: "deposit",
      provider,
      amount,
      senderNumber: senderNumber || null,
      referenceId: merchantOrderNo,
      method: "gateway",
      status: "pending",
      adminNote: `NG-Pay Online Gateway (${payType})`,
    });

    if (isMockMode || cfg.isSimulation) {
      // Mock / Simulation mode
      return NextResponse.json({
        ok: true,
        merchantOrderNo,
        isMockMode: true,
        message: "Simulation mode: Order create ho gaya. Redirecting...",
        payUrl: `${appUrl}/player/wallet?payment=pending&order=${merchantOrderNo}`,
      });
    }

    // Call real NG-Pay gateway
    const result = await createCollectionOrder({
      merchantOrderNo,
      amount,
      payType,
      productTitle: `Winkox Rs ${amount}`,
      clientIp,
      notifyUrl,
      viewUrl,
      mobile: senderNumber,
    });

    if (!result.ok) {
      // Update transaction note
      await Transaction.updateOne({ _id: tx._id }, { $set: { adminNote: `Gateway error: ${result.error}` } });
      return NextResponse.json({
        error: result.error || "Payment gateway se connection fail ho gaya.",
        canFallbackManual: true,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      orderNo: result.orderNo,
      merchantOrderNo,
      payUrl: result.payUrl,
      payContent: result.payContent,
    });
  } catch (error) {
    console.error("[ngpay checkout error]", error);
    return NextResponse.json({
      error: "Payment checkout create nahi ho saka. Baraye meherbani Direct Manual Transfer use karein.",
      canFallbackManual: true,
    }, { status: 500 });
  }
}
