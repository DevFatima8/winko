import { NextResponse } from "next/server";
import { isAllowedGameOrigin } from "@/lib/requestOrigin";
import { createForgotPasswordRequest, getForgotPasswordRequestReply } from "@/lib/forgotPasswordRequests";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    if (!isAllowedGameOrigin(request)) return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
    try {
        const body = await request.json().catch(() => ({}));
        const result = await createForgotPasswordRequest({ phone: body.phone, accountId: body.accountId, name: body.name });
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[forgot-password:post]", error);
        return NextResponse.json({ error: "Request submit nahi ho saki. Dobara koshish karein." }, { status: 503 });
    }
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const result = await getForgotPasswordRequestReply(url.searchParams.get("requestNo"), token);
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[forgot-password:get]", error);
        return NextResponse.json({ error: "Request status load nahi ho saka." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
