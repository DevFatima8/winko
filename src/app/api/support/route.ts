import { NextResponse } from "next/server";
import { getClientSupportState, sendClientSupportMessage, setGuestCookie } from "@/lib/supportServer";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const { data, guestIdToSet } = await getClientSupportState();
        return setGuestCookie(NextResponse.json(data, { headers: { "Cache-Control": "no-store" } }), guestIdToSet);
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== "ETIMEDOUT") console.error("[support:get]", error);
        return NextResponse.json({ error: "Support abhi load nahi ho saka." }, { status: 503 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const result = await sendClientSupportMessage(String(body.text ?? ""), body.name ? String(body.name) : undefined);
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
        return setGuestCookie(NextResponse.json({ ok: result.ok, online: result.online }), result.guestIdToSet);
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== "ETIMEDOUT") console.error("[support:post]", error);
        return NextResponse.json({ error: "Message bheja nahi ja saka." }, { status: 503 });
    }
}