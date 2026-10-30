import { NextResponse } from "next/server";
import { User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isAvatar } from "@/lib/avatars";

export async function POST(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { avatar?: unknown };
        if (!isAvatar(body.avatar)) return NextResponse.json({ error: "Invalid avatar." }, { status: 400 });
        await User.updateOne({ _id: oid(me.id) }, { $set: { avatar: body.avatar } });
        return NextResponse.json({ ok: true, avatar: body.avatar });
    } catch (error) {
        console.error("[player avatar]", error);
        return NextResponse.json({ error: "Avatar save nahi ho saka." }, { status: 503 });
    }
}
