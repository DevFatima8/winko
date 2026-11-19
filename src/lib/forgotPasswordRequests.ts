import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ForgotPasswordRequest } from "@/models";
import { dbConnect } from "@/lib/mongo";
import { getServerSessionUser } from "@/lib/serverAuth";

const TOKEN_BYTES = 32;
const MAX_REPLY_LENGTH = 2000;

function cleanText(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength) : "";
}

function tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export async function createForgotPasswordRequest(input: { phone?: unknown; accountId?: unknown; name?: unknown }) {
    const phone = cleanText(input.phone, 24).replace(/[\s()-]/g, "");
    const accountId = cleanText(input.accountId, 50);
    const name = cleanText(input.name, 80);
    const digits = phone.replace(/\D/g, "");
    if (!/^\+?[0-9][0-9\s()-]{6,23}$/.test(phone) || digits.length < 7 || digits.length > 15) {
        return { error: "Valid phone number likhein.", status: 400 } as const;
    }
    if (!accountId && !name) return { error: "Account ID ya apna naam likhein.", status: 400 } as const;

    await dbConnect();
    const recent = await ForgotPasswordRequest.countDocuments({ phone, createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } });
    if (recent >= 3) return { error: "Is number se abhi kafi requests aa chuki hain. Baad mein dobara koshish karein.", status: 429 } as const;

    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const requestNo = `FP-${randomInt(1_000_000_000, 10_000_000_000)}`;
    await ForgotPasswordRequest.create({
        requestNo,
        phone,
        accountId: accountId || null,
        name: name || null,
        trackingTokenHash: tokenHash(token),
    });
    return { ok: true, requestNo, token } as const;
}

export async function getForgotPasswordRequestReply(requestNoRaw: unknown, tokenRaw: unknown) {
    const requestNo = cleanText(requestNoRaw, 24).toUpperCase();
    const token = typeof tokenRaw === "string" ? tokenRaw : "";
    if (!/^FP-\d{10}$/.test(requestNo) || token.length < 40 || token.length > 60) {
        return { error: "Request nahi mili.", status: 404 } as const;
    }
    await dbConnect();
    const request = await ForgotPasswordRequest.findOne({ requestNo }).lean();
    const suppliedHash = Buffer.from(tokenHash(token), "hex");
    const savedHash = Buffer.from(request?.trackingTokenHash ?? "0".repeat(64), "hex");
    if (!request || savedHash.length !== suppliedHash.length || !timingSafeEqual(savedHash, suppliedHash)) {
        return { error: "Request nahi mili.", status: 404 } as const;
    }
    return { ok: true, status: request.status, reply: request.adminReply, repliedAt: request.repliedAt } as const;
}

async function authorizedAdmin() {
    const user = await getServerSessionUser();
    return user?.role === "admin" && user.level >= 2 ? user : null;
}

export async function getAdminForgotPasswordRequests(unreadOnly: boolean) {
    const admin = await authorizedAdmin();
    if (!admin) return { error: "Unauthorized", status: 403 } as const;
    await dbConnect();
    if (unreadOnly) {
        return { unread: await ForgotPasswordRequest.countDocuments({ status: "pending" }) } as const;
    }
    const [pending, replied] = await Promise.all([
        ForgotPasswordRequest.find({ status: "pending" }).sort({ createdAt: -1 }).limit(200).lean(),
        ForgotPasswordRequest.find({ status: "replied" }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const requests = [...pending, ...replied];
    return {
        requests: requests.map((request) => ({
            id: String(request._id),
            requestNo: request.requestNo,
            phone: request.phone,
            accountId: request.accountId,
            name: request.name,
            status: request.status,
            adminReply: request.adminReply,
            createdAt: request.createdAt,
            repliedAt: request.repliedAt,
        })),
    } as const;
}

export async function replyToForgotPasswordRequest(idRaw: unknown, replyRaw: unknown) {
    const admin = await authorizedAdmin();
    if (!admin) return { error: "Unauthorized", status: 403 } as const;
    const id = cleanText(idRaw, 64);
    const reply = cleanText(replyRaw, MAX_REPLY_LENGTH);
    if (!id || !reply) return { error: "Request aur reply dono zaroori hain.", status: 400 } as const;
    await dbConnect();
    const request = await ForgotPasswordRequest.findById(id).lean();
    if (!request) return { error: "Request nahi mili.", status: 404 } as const;
    const result = await ForgotPasswordRequest.updateOneAtomic(
        { _id: id, status: "pending" },
        { $set: { status: "replied", adminReply: reply, repliedAt: new Date(), repliedById: admin.id, repliedByName: admin.name } },
    );
    if (!result.matchedCount) return { error: "Is request ka jawab pehle hi diya ja chuka hai.", status: 409 } as const;
    return { ok: true } as const;
}
