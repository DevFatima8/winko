import { NextResponse } from "next/server";
import { Notification } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";

export async function GET() {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const audiences = me.dbRole === "agent" ? ["all", "clients", "agents"] : ["all", "clients"];
        const list = await Notification.find({ isActive: true, $or: [{ audience: { $in: audiences } }, { audience: "user", userId: me.id }] }).sort({ createdAt: -1 }).limit(100).lean();
        return NextResponse.json({ list }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[player notifications]", error);
        return NextResponse.json({ error: "Notifications load nahi ho sakin." }, { status: 503 });
    }
}