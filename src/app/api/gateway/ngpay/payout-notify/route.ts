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

    // Verify signature
    if (cfg.secretKey) {
      const isValid = verifyNgPaySign(body, cfg.secretKey, body.sign);
      if (!isValid) {
        console.warn("[ngpay payout-notify] Invalid signature received:", body);
        return new Response("FAIL_SIGN", { status: 400 });
      }
    }

    const merchantOrderNo = String(body.merchantOrderNo ?? "").trim();
    const orderNo = String(body.orderNo ?? "").trim();
    const status = Number(body.status); // 0 = SUCCESS, 1 = FAILED, 2/3 = PROCESSING, 99 = REFUNDED

    if (!merchantOrderNo && !orderNo) {
      return new Response("SUCCESS", { status: 200 });
    }

    const tx = await Transaction.findOne({
      $or: [
        { referenceId: merchantOrderNo },
        { referenceId: orderNo },
      ],
      type: "withdraw",
    });

    if (!tx) {
      console.warn("[ngpay payout-notify] Withdrawal transaction not found:", merchantOrderNo || orderNo);
      return new Response("SUCCESS", { status: 200 });
    }

    if (tx.status === "approved" && status === 0) {
      return new Response("SUCCESS", { status: 200 });
    }

    if (status === 0) {
      // Payout Successful
      await Transaction.updateOne(
        { _id: tx._id },
        {
          $set: {
            status: "approved",
            processedAt: new Date(),
            adminNote: "Payout settled via NG-Pay",
          },
        }
      );

      await notifyUser(
        String(tx.userId),
        "Withdrawal Completed! 💸",
        `Rs. ${tx.amount.toLocaleString()} has been sent to your ${tx.provider?.toUpperCase()} account.`,
        "success",
        { href: "/player/wallet" }
      );
    } else if (status === 1 || status === 99) {
      // Payout Failed or Refunded -> Refund balance to user
      if (tx.status !== "rejected") {
        await Transaction.updateOne(
          { _id: tx._id },
          {
            $set: {
              status: "rejected",
              processedAt: new Date(),
              adminNote: `Payout failed on gateway (status: ${status}) — balance refunded`,
            },
          }
        );

        await User.updateOne(
          { _id: oid(tx.userId) },
          { $inc: { balance: tx.amount } }
        );

        await notifyUser(
          String(tx.userId),
          "Withdrawal Refunded",
          `Your withdrawal of Rs. ${tx.amount.toLocaleString()} failed and was refunded to your game balance.`,
          "warning",
          { href: "/player/wallet" }
        );
      }
    }

    return new Response("SUCCESS", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[ngpay payout-notify error]", error);
    return new Response("ERROR", { status: 500 });
  }
}
