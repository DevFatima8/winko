import { NextResponse } from "next/server";
import { Transaction, User, oid } from "@/models";
import { verifyNgPaySign, getNgPayConfig } from "@/lib/ngpay";
import { notifyUser } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const rawText = await request.text();
    let body: Record<string, any> = {};
    try {
      body = JSON.parse(rawText);
    } catch {
      return new Response("INVALID_JSON", { status: 400 });
    }

    const cfg = getNgPayConfig();

    // Verify signature if secret key is configured
    if (cfg.secretKey) {
      const isValid = verifyNgPaySign(body, cfg.secretKey, body.sign);
      if (!isValid) {
        console.warn("[ngpay notify] Invalid signature received:", body);
        return new Response("FAIL_SIGN", { status: 400 });
      }
    }

    const merchantOrderNo = String(body.merchantOrderNo ?? "").trim();
    const orderNo = String(body.orderNo ?? "").trim();
    const status = Number(body.status); // 0 = SUCCESS, 1 = FAILED, 2/3 = PENDING, 99 = REFUNDED

    if (!merchantOrderNo && !orderNo) {
      return new Response("SUCCESS", { status: 200 });
    }

    // Find corresponding transaction
    const tx = await Transaction.findOne({
      $or: [
        { referenceId: merchantOrderNo },
        { referenceId: orderNo },
      ],
      type: "deposit",
    });

    if (!tx) {
      console.warn("[ngpay notify] Transaction not found for order:", merchantOrderNo || orderNo);
      return new Response("SUCCESS", { status: 200 }); // Acknowledge to prevent spam retries
    }

    if (tx.status === "approved") {
      // Idempotency: Already processed
      return new Response("SUCCESS", { status: 200 });
    }

    if (status === 0) {
      // Payment Successful!
      await Transaction.updateOne(
        { _id: tx._id, status: "pending" },
        {
          $set: {
            status: "approved",
            processedAt: new Date(),
            adminNote: `Verified & auto-credited via NG-Pay (${body.payType || tx.provider})`,
          },
        }
      );

      // Atomically credit user balance
      await User.updateOne(
        { _id: oid(tx.userId) },
        { $inc: { balance: tx.amount } }
      );

      await notifyUser(
        String(tx.userId),
        "Payment Approved! 💰",
        `Rs. ${tx.amount.toLocaleString()} has been credited to your Winkox wallet via ${tx.provider?.toUpperCase()}.`,
        "success",
        { href: "/player/wallet" }
      );

      console.log(`[ngpay notify] Order ${merchantOrderNo} approved. User ${tx.userId} credited Rs. ${tx.amount}`);
    } else if (status === 1) {
      // Payment Failed
      await Transaction.updateOne(
        { _id: tx._id, status: "pending" },
        {
          $set: {
            status: "rejected",
            processedAt: new Date(),
            adminNote: "Payment failed on gateway",
          },
        }
      );
    }

    // NG-Pay strictly expects string "SUCCESS"
    return new Response("SUCCESS", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[ngpay notify error]", error);
    return new Response("ERROR", { status: 500 });
  }
}
