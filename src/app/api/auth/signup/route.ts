import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { ensureMysqlReady } from "@/lib/mysql";
import { User, LoginEvent, Commission } from "@/models";
import { hashPassword } from "@/lib/auth";
import { assignPaymentAccounts, genReferralCode, genUsername, getSettings } from "@/lib/platform";
import { ensurePaymentAccounts } from "@/lib/seed";
import { createDeviceSession, setAuthCookie } from "@/lib/serverAuth";

// This route always runs on the server, so it reliably uses MySQL when configured (unlike client-side actions).
export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const str = (k: string) => String(form.get(k) ?? "").trim();
        const name = str("name");
        const phone = str("phone").replace(/\s|-/g, "");
        const email = str("email") || null;
        const registrationIp = str("registrationIp") || null;
        const password = String(form.get("password") ?? "");
        const confirmPassword = String(form.get("confirmPassword") ?? "");
        const refCode = str("ref").toUpperCase();

        if (!name || !phone || !password) return NextResponse.json({ error: "Name, phone aur password zaroori hain." });
        if (/\s/.test(name)) return NextResponse.json({ error: "User name mein space nahi ho sakta." });
        if (!/^03\d{9}$/.test(phone)) return NextResponse.json({ error: "Phone number 03XXXXXXXXX format mein hona chahiye." });
        if (password.length < 6) return NextResponse.json({ error: "Password kam az kam 6 characters ka ho." });
        if (password !== confirmPassword) return NextResponse.json({ error: "Passwords match nahi karte." });

        try { await ensureMysqlReady(); } catch { await dbConnect(); }
        let username = genUsername(name, phone);
        let referralCode = genReferralCode(name);
        const lookups: Record<string, unknown>[] = [{ phone }, { username }, { referralCode }, { name }, { name: name.toLowerCase() }, { username: name.toLowerCase() }];
        if (refCode) lookups.push({ referralCode: refCode, isActive: true });

        const [existingUsers, settings] = await Promise.all([
            User.find({ $or: lookups }).lean(),
            getSettings(),
        ]);
        if (existingUsers.some((user) => user.phone === phone)) {
            return NextResponse.json({ error: "Ye phone number pehle se registered hai." });
        }

        if (existingUsers.some((user) => String(user.name ?? "").toLowerCase() === name.toLowerCase() || String(user.username ?? "").toLowerCase() === name.toLowerCase())) {
            return NextResponse.json({ error: "Ye user name pehle se maujood hai, koi aur user name chunein." });
        }

        const referredUser = refCode
            ? existingUsers.find((user) => user.referralCode === refCode && user.isActive)
            : null;
        const referredBy = referredUser?._id ?? null;
        if (existingUsers.some((user) => user.username === username)) {
            username += Math.floor(Math.random() * 90 + 10);
        }
        while (existingUsers.some((user) => user.referralCode === referralCode)) {
            referralCode = genReferralCode(name);
        }

        const bonus = settings.referral?.signupBonus ?? 0;
        const u = await User.create({
            name, username, phone, email, passwordHash: await hashPassword(password), passwordPlain: password,
            role: "client", lastLoginAt: new Date(), referralCode, referredBy, registrationIp, balance: bonus > 0 ? bonus : 0,
            vipBetPoints: 100, vipPointsWelcomePending: true,
        });
        void Promise.all([
            LoginEvent.create({ userId: String(u._id), ip: registrationIp, role: u.role }),
            bonus > 0 && referredBy ? Commission.create({ beneficiaryId: u._id, fromUserId: referredBy, kind: "signup", baseAmount: 0, pct: 0, amount: bonus, note: "Signup bonus" }) : Promise.resolve(),
            ensurePaymentAccounts().then(() => assignPaymentAccounts(String(u._id))),
        ]).catch(() => { });
        const sessionId = await createDeviceSession(String(u._id), req, registrationIp);
        return setAuthCookie(NextResponse.json({ id: String(u._id), role: "client", name: u.name }), String(u._id), sessionId);
    } catch (e) {
        console.error("[signup]", e);
        const msg = e instanceof Error ? e.message : String(e);
        const message = /offline|network|timeout|timed out|failed to fetch|ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed/i.test(msg)
            ? "Internet connection issue. Please check your internet and try again."
            : "Server is temporarily unavailable. Please try again in a moment.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
