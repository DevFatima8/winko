import { NextResponse } from "next/server";
import { DeviceSession } from "@/models";
import { getCurrentDeviceSessionId, getServerSessionUser } from "@/lib/serverAuth";

export async function GET() {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentSessionId = await getCurrentDeviceSessionId();
    const sessions = await DeviceSession.find({ userId: me.id, revokedAt: null })
        .sort({ lastSeenAt: -1 })
        .lean();

    return NextResponse.json({
        currentSessionId,
        devices: sessions.map(({ sessionId, deviceName, userAgent, ip, lastSeenAt }) => ({
            sessionId,
            deviceName,
            userAgent,
            ip,
            lastSeenAt,
        })),
    });
}

export async function DELETE(request: Request) {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { sessionId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (typeof body.sessionId !== "string" || !body.sessionId) {
        return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const result = await DeviceSession.updateOne(
        { userId: me.id, sessionId: body.sessionId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
    );
    if (!result.modifiedCount) return NextResponse.json({ error: "Device session not found" }, { status: 404 });

    const currentSessionId = await getCurrentDeviceSessionId();
    const response = NextResponse.json({ ok: true });
    if (currentSessionId === body.sessionId) {
        const { clearAuthCookie } = await import("@/lib/serverAuth");
        return clearAuthCookie(response);
    }
    return response;
}
