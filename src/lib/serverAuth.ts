import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { DeviceSession, Notification, User, WinHold } from "@/models";
import { claimWinHolds } from "./winHold";
import { dbConnect } from "./mongo";
import { toCurrentUser, type CurrentUser } from "./auth";
import { getPlayerDisplayId } from "./playerDisplayId";
import { mysqlMultiplayerStore } from "./multiplayer-store";
import { isMysqlEnabled } from "./mysql";
import { activeDeviceSessions, DEVICE_SESSION_TTL_MS, recordDeviceLogin } from "./deviceSessions";

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

function browserDeviceId(request: Request | undefined, fallback: string) {
    const token = request?.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("wx_device="))?.slice("wx_device=".length);
    if (!token) return fallback;
    const [id, supplied] = token.split(".");
    if (!/^[a-f0-9-]{36}$/i.test(id ?? "") || !supplied) return fallback;
    const expected = Buffer.from(signature(`device:${id}`)), actual = Buffer.from(supplied);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : fallback;
}

export function setAuthCookie(response: NextResponse, userId: string, sessionId: string, request?: Request) {
    const payload = Buffer.from(JSON.stringify({ sub: userId, sid: sessionId, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
    response.cookies.set(COOKIE_NAME, `${payload}.${signature(payload)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
    const deviceId = browserDeviceId(request, sessionId);
    response.cookies.set("wx_device", `${deviceId}.${signature(`device:${deviceId}`)}`, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
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
    sessionSecret();
    const sessionId = randomUUID();
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);
    const input = {
        userId,
        sessionId,
        deviceId: browserDeviceId(request, sessionId),
        deviceName: deviceName(userAgent),
        userAgent,
        ip,
    };
    if (isMysqlEnabled()) {
        await mysqlMultiplayerStore.transact(`security:login:${userId}`, tx => recordDeviceLogin(tx, input));
    } else {
        const [user, previous] = await Promise.all([User.findById(userId).lean(), DeviceSession.findOne({ userId, deviceId: input.deviceId }).lean()]);
        if (!user || user.isActive === false) throw new Error("Active account required for device login.");
        const device = await DeviceSession.create({ ...input, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DEVICE_SESSION_TTL_MS), revokedAt: null });
        if (user?.role === "admin" && !previous) {
            try {
                await Notification.create({ title: "Security alert: Super Admin new device login", body: `${user.name} signed in on ${input.deviceName}${ip ? ` | IP ${ip}` : ""}.`, type: "warning", audience: "owners", href: "/admin/devices" });
            } catch (error) {
                await DeviceSession.deleteOne({ _id: device._id });
                throw error;
            }
        }
    }
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
    if (session.sessionId) {
        const device = await DeviceSession.findOne({ userId: session.userId, sessionId: session.sessionId, revokedAt: null }).lean();
        if (!device || !activeDeviceSessions([device], Date.now()).length) return null;
    }
    let user = await User.findById(session.userId).lean();
    if (!user || user.isActive === false) return null;
    if ((user.role === "client" || user.role === "agent") && await WinHold.findOne({ userId: session.userId, claimed: false }, "_id").lean()) {
        await claimWinHolds(session.userId);
        user = await User.findById(session.userId).lean();
        if (!user || user.isActive === false) return null;
    }
    const current = toCurrentUser(user);
    if (current.role === "client") current.displayId = await getPlayerDisplayId(current.id);
    return current;
}