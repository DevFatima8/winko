import { NextResponse } from "next/server";
import { getAdminSupportMessages, listAdminSupportThreads, replyAsAdmin, updateAdminSupportThread } from "@/lib/supportServer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const threadId = new URL(request.url).searchParams.get("thread");
        const result = threadId ? await getAdminSupportMessages(threadId) : await listAdminSupportThreads();
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[admin-support:get]", error);
        return NextResponse.json({ error: "Support inbox load nahi ho saka." }, { status: 503 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const result = await replyAsAdmin(String(body.threadId ?? ""), String(body.text ?? ""));
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status });
    } catch (error) {
        console.error("[admin-support:post]", error);
        return NextResponse.json({ error: "Reply bheja nahi ja saka." }, { status: 503 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const statusValue = body.status === "open" || body.status === "closed" ? body.status : undefined;
        const result = await updateAdminSupportThread(String(body.threadId ?? ""), { status: statusValue, release: body.action === "release" });
        const status = "status" in result && typeof result.status === "number" ? result.status : 200;
        return NextResponse.json(result, { status });
    } catch (error) {
        console.error("[admin-support:patch]", error);
        return NextResponse.json({ error: "Chat update nahi ho saka." }, { status: 503 });
    }
}