import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { DeviceSession, User } from "@/models";
import { dbConnect } from "./mongo";
import { toCurrentUser, type CurrentUser } from "./auth";
import { getPlayerDisplayId } from "./playerDisplayId";

const COOKIE_NAME = "wx_auth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret() {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET must be configured before users can log in.");
    return secret;
}

function signature(payload: string) {
    return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function setAuthCookie(response: NextResponse, userId: string, sessionId: string) {
    const payload = Buffer.from(JSON.stringify({ sub: userId, sid: sessionId, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
    response.cookies.set(COOKIE_NAME, `${payload}.${signature(payload)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
    return response;
}

export function clearAuthCookie(response: NextResponse) {
    response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
}

function readSession(token: string | undefined) {
    if (!token) return null;
    const [payload, suppliedSignature] = token.split(".");
    if (!payload || !suppliedSignature) return null;
    try {
        const expected = Buffer.from(signature(payload));
        const supplied = Buffer.from(suppliedSignature);
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
        const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; sid?: string; exp?: number };
        return typeof session.sub === "string" && typeof session.exp === "number" && session.exp > Date.now()
            ? { userId: session.sub, sessionId: typeof session.sid === "string" ? session.sid : null }
            : null;
    } catch {
        return null;
    }
}

function deviceName(userAgent: string) {
    const browser = /Edg\//.test(userAgent) ? "Edge"
        : /Firefox\//.test(userAgent) ? "Firefox"
            : /Chrome\//.test(userAgent) ? "Chrome"
                : /Safari\//.test(userAgent) ? "Safari"
                    : "Browser";
    const platform = /Android/.test(userAgent) ? "Android"
        : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
            : /Windows/.test(userAgent) ? "Windows"
                : /Mac OS/.test(userAgent) ? "macOS"
                    : /Linux/.test(userAgent) ? "Linux"
                        : "device";
    return `${browser} on ${platform}`;
}

export async function createDeviceSession(userId: string, request: Request, ip: string | null) {
    const sessionId = randomUUID();
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);
    await DeviceSession.create({
        userId,
        sessionId,
        deviceName: deviceName(userAgent),
        userAgent,
        ip,
        lastSeenAt: new Date(),
        revokedAt: null,
    });
    return sessionId;
}

export async function getCurrentDeviceSessionId() {
    const session = readSession((await cookies()).get(COOKIE_NAME)?.value);
    return session?.sessionId ?? null;
}

export async function revokeCurrentDeviceSession() {
    const session = readSession((await cookies()).get(COOKIE_NAME)?.value);
    if (!session?.sessionId) return;
    await DeviceSession.updateOne(
        { userId: session.userId, sessionId: session.sessionId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
    );
}

export async function getServerSessionUser(): Promise<CurrentUser | null> {
    const session = readSession((await cookies()).get(COOKIE_NAME)?.value);
    if (!session) return null;
    await dbConnect();
    if (session.sessionId && !await DeviceSession.findOne({ userId: session.userId, sessionId: session.sessionId, revokedAt: null }, "_id").lean()) return null;
    const user = await User.findById(session.userId).lean();
    if (!user || user.isActive === false) return null;
    const current = toCurrentUser(user);
    if (current.role === "client") current.displayId = await getPlayerDisplayId(current.id);
    return current;
}