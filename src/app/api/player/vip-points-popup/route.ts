import { NextResponse } from "next/server";
import { User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";

export async function POST() {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    await User.updateOne({ _id: oid(me.id) }, { $set: { vipPointsWelcomePending: false } });
    return NextResponse.json({ success: true });
}