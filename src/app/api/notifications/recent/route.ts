import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { Notification, oid } from "@/models";
import { FIRST_DEPOSIT_BONUS_TITLE } from "@/lib/depositApproval";

export async function GET() {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ notification: null }, { status: 401 });
    await dbConnect();
    const notification = await Notification.findOne({ audience: "user", userId: oid(me.id), type: "success", title: { $in: ["Congratulations! Referral earning received", FIRST_DEPOSIT_BONUS_TITLE] }, isActive: true }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ notification: notification ? { id: String(notification._id), title: notification.title, body: notification.body, createdAt: notification.createdAt } : null });
}