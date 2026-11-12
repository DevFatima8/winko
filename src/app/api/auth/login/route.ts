import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { ensureMysqlReady } from "@/lib/mysql";
import { User, LoginEvent, AdminLog, oid } from "@/models";
import { verifyPassword, isStaff } from "@/lib/auth";
import { assignPaymentAccounts, genReferralCode, genUsername } from "@/lib/platform";
import { ensureAdmin } from "@/lib/seed";
import { createDeviceSession, setAuthCookie } from "@/lib/serverAuth";

async function retryTransientDbError<T>(operation: () => T | PromiseLike<T>): Promise<Awaited<T>> {
    try {
        return await operation();
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (!["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "PROTOCOL_CONNECTION_LOST"].includes(code ?? "")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
        return await operation();
    }
}

// This route always runs on the server, so it reliably uses MySQL when configured (unlike client-side actions).
export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const rawLogin = String(form.get("phone") ?? "").trim();
        const password = String(form.get("password") ?? "");
        const loginIp = String(form.get("loginIp") ?? "").trim() || null;

        try { await ensureMysqlReady(); } catch { await dbConnect(); }

        const idLike = /^WX[-\s]?(ADM|SYS)/i.test(rawLogin);
        const login = idLike
            ? rawLogin.toUpperCase().replace(/\s/g, "").replace(/^WX(ADM|SYS)/, "WX-$1").replace(/^(WX-(?:ADM|SYS))-?(\d+)$/, (_m, a, d) => `${a}-${String(parseInt(d, 10)).padStart(4, "0")}`)
            : rawLogin.replace(/\s|-/g, "");
        const userFilter = idLike ? { adminId: login } : /^03\d{9}$/.test(login) ? { phone: login } : { username: login.toLowerCase() };
        let u = await retryTransientDbError(() => User.findOne(userFilter));
        const adminLogin = idLike
            || login.toLowerCase() === (process.env.SUPER_ADMIN_USERNAME || "superadmin").toLowerCase()
            || login === (process.env.SUPER_ADMIN_PHONE || "03000000000");
        if (!u && adminLogin) {
            await ensureAdmin();
            u = await User.findOne(userFilter);
        }
        if (!u || !(await verifyPassword(password, u.passwordHash))) return NextResponse.json({ error: "Phone/username/ID ya password ghalat hai." });
        if (!u.isActive) return NextResponse.json({ error: "Aapka account block hai. Support se rabta karein." });
        u.lastLoginAt = new Date();
        if (loginIp) { u.lastLoginIp = loginIp; u.historicalIps = [...new Set([...(u.historicalIps ?? []), loginIp])].slice(-20); }
        if (!u.referralCode) u.referralCode = genReferralCode(u.name);
        if (!u.username) u.username = genUsername(u.name, u.phone);
        const saved = await User.updateOneAtomic(
            { _id: String(u._id), passwordHash: u.passwordHash, totpSecret: u.totpSecret ?? null, totpLastStep: u.totpLastStep ?? null },
            { $set: { lastLoginAt: u.lastLoginAt, ...(loginIp ? { lastLoginIp: u.lastLoginIp, historicalIps: u.historicalIps } : {}), referralCode: u.referralCode, username: u.username } },
        );
        if (!saved.modifiedCount) return NextResponse.json({ error: "Account settings changed. Dobara login karein." }, { status: 409 });

        const role = isStaff(u.role) ? "admin" : "client";
        if (role === "admin") {
            if (u.role !== "owner") void AdminLog.create({ actorId: oid(u._id), actorName: u.name, actorRole: u.role, action: "login", target: "", details: "" }).catch(() => { });
        } else {
            void assignPaymentAccounts(String(u._id)).catch(() => { });
        }
        const sessionId = await createDeviceSession(String(u._id), req, loginIp);
        await LoginEvent.create({ userId: String(u._id), ip: loginIp, role: u.role });
        return setAuthCookie(NextResponse.json({ id: String(u._id), role, name: u.name }), String(u._id), sessionId, req);
    } catch (e) {
        console.error("[login]", e);
        const errMsg = e instanceof Error ? e.message : String(e);
        const message = /offline|network|timeout|timed out|failed to fetch|ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed/i.test(errMsg)
            ? "Internet connection issue. Please check your internet and try again."
            : "Server is temporarily unavailable. Please try again in a moment.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
