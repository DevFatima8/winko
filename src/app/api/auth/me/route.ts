import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";

// This route always runs on the server, so it reliably reads MySQL when configured (unlike client-side model access).
export async function GET(req: Request) {
    try {
        return NextResponse.json({ user: await getServerSessionUser() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const message = /offline|network|timeout|timed out|failed to fetch|ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed/i.test(msg)
            ? "Internet connection issue. Please check your internet and try again."
            : "Session could not be verified. Please try again.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
