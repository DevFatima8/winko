import { NextResponse } from "next/server";
import { getAdminForgotPasswordRequests, replyToForgotPasswordRequest } from "@/lib/forgotPasswordRequests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
        const result = await getAdminForgotPasswordRequests(unreadOnly);
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[admin-forgot-password:get]", error);
        return NextResponse.json({ error: "Forgot password requests load nahi ho sakin." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const result = await replyToForgotPasswordRequest(body.id, body.reply);
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status });
    } catch (error) {
        console.error("[admin-forgot-password:reply]", error);
        return NextResponse.json({ error: "Reply send nahi ho saka." }, { status: 503 });
    }
}
