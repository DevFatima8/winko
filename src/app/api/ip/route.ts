import { NextResponse } from "next/server";
import { requestIp } from "@/lib/requestIp";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
    return NextResponse.json({ ip: requestIp(request) }, { headers: { "Cache-Control": "no-store" } });
}