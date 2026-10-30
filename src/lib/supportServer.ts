import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SupportMessage, SupportThread, User, oid } from "@/models";
import { getSettings, supportOnline } from "./platform";
import { dbConnect } from "./mongo";
import { getServerSessionUser } from "./serverAuth";
import { notifyAdmins } from "./notifications";

const GUEST_COOKIE = "wx_support_guest";
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 365;

async function clientIdentity() {
    const user = await getServerSessionUser();
    if (user) return { userId: user.id, guestId: null, name: user.name, newGuestId: null as string | null };

    const cookieStore = await cookies();
    let guestId = cookieStore.get(GUEST_COOKIE)?.value;
    const newGuestId = guestId ? null : randomUUID();
    guestId ??= newGuestId!;
    return { userId: null, guestId, name: "Guest", newGuestId };
}

export function setGuestCookie(response: Response, guestId: string | null) {
    if (guestId) {
        (response as Response & { cookies: { set: (name: string, value: string, options: object) => void } }).cookies.set(GUEST_COOKIE, guestId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: GUEST_TTL_SECONDS,
        });
    }
    return response;
}

async function findClientThread(userId: string | null, guestId: string | null, create: boolean) {
    const filter = userId ? { userId: oid(userId) } : { guestId };
    let thread = await SupportThread.findOne(filter).sort({ lastMessageAt: -1 });
    if (!thread && create) {
        thread = await SupportThread.create({ userId: userId ? oid(userId) : null, guestId, guestName: userId ? null : "Guest" });
    }
    return thread;
}

export async function getClientSupportState() {
    await dbConnect();
    const identity = await clientIdentity();
    const settings = await getSettings();
    const thread = await findClientThread(identity.userId, identity.guestId, false);
    const messages = thread ? await SupportMessage.find({ threadId: thread._id }).sort({ createdAt: 1 }).limit(200).lean() : [];
    if (thread && thread.unreadForUser > 0) await SupportThread.updateOne({ _id: thread._id }, { $set: { unreadForUser: 0 } });

    return {
        guestIdToSet: identity.newGuestId,
        data: {
            online: supportOnline(settings.support),
            hours: settings.support?.is247 ? "24/7" : `${settings.support?.startHour ?? 9}:00 – ${settings.support?.endHour ?? 23}:00 PKT`,
            welcome: settings.support?.welcomeMessage ?? "",
            offlineMessage: settings.support?.offlineMessage ?? "",
            links: settings.links,
            threadId: thread ? String(thread._id) : null,
            messages: messages.map((message) => ({ id: String(message._id), from: message.from, text: message.text, agentName: message.agentName, at: message.createdAt })),
        },
    };
}

export async function sendClientSupportMessage(textRaw: string, name?: string) {
    await dbConnect();
    const text = String(textRaw ?? "").trim().slice(0, 2000);
    if (!text) return { error: "Message khali hai.", status: 400, guestIdToSet: null as string | null };

    const identity = await clientIdentity();
    const thread = (await findClientThread(identity.userId, identity.guestId, true))!;
    const authorName = !identity.userId && name ? String(name).trim().slice(0, 60) : identity.name;
    if (!identity.userId && name) await SupportThread.updateOne({ _id: thread._id }, { $set: { guestName: authorName } });
    await SupportMessage.create({ threadId: thread._id, from: "user", text });

    const settings = await getSettings();
    const online = supportOnline(settings.support);
    await SupportThread.updateOne({ _id: thread._id }, { $set: { lastMessage: text, lastMessageAt: new Date(), status: "open" }, $inc: { unreadForAdmin: 1 } });
    await notifyAdmins("New support message", `${authorName}: ${text.slice(0, 160)}`, "info", { href: "/admin/support" });
    const userMessageCount = await SupportMessage.countDocuments({ threadId: thread._id, from: "user" });
    if (userMessageCount === 1 && settings.support?.welcomeMessage) {
        await SupportMessage.create({ threadId: thread._id, from: "system", text: settings.support.welcomeMessage.replace("{name}", identity.name) });
    }
    if (!online && settings.support?.offlineMessage) {
        const previous = await SupportMessage.findOne({ threadId: thread._id, from: "system", text: settings.support.offlineMessage }).sort({ createdAt: -1 }).lean();
        if (!previous || Date.now() - new Date(previous.createdAt).getTime() > 30 * 60 * 1000) {
            await SupportMessage.create({ threadId: thread._id, from: "system", text: settings.support.offlineMessage });
        }
    }
    return { ok: true, online, guestIdToSet: identity.newGuestId };
}

async function adminUser() {
    const user = await getServerSessionUser();
    return user?.role === "admin" ? user : null;
}

export async function listAdminSupportThreads() {
    const me = await adminUser();
    if (!me) return { error: "Unauthorized", status: 401 };
    let filter: Record<string, unknown> = {};
    if (me.level < 2) {
        const teamIds = (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id);
        filter = {
            $and: [
                { $or: [{ userId: { $in: teamIds } }, { assignedTo: oid(me.id) }] },
                { $or: [{ assignedTo: null }, { assignedTo: oid(me.id) }] },
            ],
        };
    }
    const threads = await SupportThread.find(filter).sort({ lastMessageAt: -1 }).limit(150).lean();
    const userIds = threads.flatMap((thread) => thread.userId ? [String(thread.userId)] : []);
    const assignedIds = threads.flatMap((thread) => thread.assignedTo ? [String(thread.assignedTo)] : []);
    const [users, assignedUsers] = await Promise.all([
        userIds.length ? User.find({ _id: { $in: userIds } }).lean() : [],
        assignedIds.length ? User.find({ _id: { $in: assignedIds } }, "name role").lean() : [],
    ]);
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    const assignedUsersById = new Map(assignedUsers.map((user) => [String(user._id), user]));

    return {
        me: { id: me.id, level: me.level },
        threads: threads.map((thread) => {
            const client = thread.userId ? usersById.get(String(thread.userId)) : null;
            const assignedUser = thread.assignedTo ? assignedUsersById.get(String(thread.assignedTo)) : null;
            return {
                id: String(thread._id),
                name: client?.name ?? thread.guestName ?? "Guest",
                phone: client?.phone ?? null,
                status: thread.status,
                last: thread.lastMessage,
                at: thread.lastMessageAt,
                unread: thread.unreadForAdmin,
                assignedTo: thread.assignedTo ? String(thread.assignedTo) : null,
                assignedName: assignedUser?.name ?? thread.assignedName ?? null,
                assignedRole: assignedUser?.role ?? null,
            };
        }),
    };
}

async function canAccessSupportThread(me: NonNullable<Awaited<ReturnType<typeof adminUser>>>, thread: { userId: string | null; assignedTo: string | null }) {
    if (me.level >= 2) return true;
    if (thread.assignedTo && String(thread.assignedTo) !== me.id) return false;
    if (!thread.userId) return String(thread.assignedTo ?? "") === me.id;
    return !!await User.findOne({ _id: thread.userId, referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean();
}

export async function getAdminSupportMessages(threadId: string) {
    const me = await adminUser();
    if (!me) return { error: "Unauthorized", status: 401 };
    const thread = await SupportThread.findById(threadId).lean();
    if (!thread) return { error: "Not found", status: 404 };
    if (!await canAccessSupportThread(me, thread)) return { error: "Ye chat aapki team mein nahi hai.", status: 403 };
    const messages = await SupportMessage.find({ threadId: oid(threadId) }).sort({ createdAt: 1 }).limit(300).lean();
    const agentIds = [...new Set(messages.flatMap((message) => message.agentId ? [String(message.agentId)] : []))];
    const agents = agentIds.length ? await User.find({ _id: { $in: agentIds } }, "role").lean() : [];
    const agentRoles = new Map(agents.map((agent) => [String(agent._id), agent.role]));
    await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { unreadForAdmin: 0 } });
    return {
        messages: messages.map((message) => ({
            id: String(message._id),
            from: message.from,
            text: message.text,
            agentName: message.agentName,
            agentRole: message.agentId ? agentRoles.get(String(message.agentId)) ?? null : null,
            at: message.createdAt,
        })),
    };
}

export async function replyAsAdmin(threadId: string, textRaw: string) {
    const me = await adminUser();
    if (!me) return { error: "Unauthorized", status: 401 };
    const text = String(textRaw ?? "").trim().slice(0, 2000);
    if (!text || !threadId) return { error: "Invalid message", status: 400 };
    const thread = await SupportThread.findById(threadId).lean();
    if (!thread) return { error: "Not found", status: 404 };
    if (!await canAccessSupportThread(me, thread)) return { error: "Ye chat aapki team mein nahi hai.", status: 403 };
    if (!thread.assignedTo && me.level < 3) {
        await SupportThread.updateOne({ _id: thread._id, assignedTo: null }, { $set: { assignedTo: oid(me.id), assignedName: me.name } });
        const claimedThread = await SupportThread.findById(thread._id, "assignedTo").lean();
        if (String(claimedThread?.assignedTo ?? "") !== me.id) return { error: "Ye chat kisi aur admin ke paas hai.", status: 409 };
    }
    await SupportMessage.create({ threadId: oid(threadId), from: "agent", text, agentName: me.level >= 3 ? "Support Team" : me.name, agentId: oid(me.id) });
    await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { lastMessage: text, lastMessageAt: new Date(), unreadForAdmin: 0, status: "open" }, $inc: { unreadForUser: 1 } });
    return { ok: true };
}

export async function updateAdminSupportThread(threadId: string, update: { status?: "open" | "closed"; release?: boolean }) {
    const me = await adminUser();
    if (!me) return { error: "Unauthorized", status: 401 };
    const thread = await SupportThread.findById(threadId).lean();
    if (!thread) return { error: "Not found", status: 404 };
    if (update.release) {
        if (me.level < 2) return { error: "Unauthorized", status: 403 };
        await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { assignedTo: null, assignedName: null } });
    } else if (update.status) {
        if (!await canAccessSupportThread(me, thread)) return { error: "Ye chat aapki team mein nahi hai.", status: 403 };
        await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { status: update.status } });
    } else {
        return { error: "Invalid update", status: 400 };
    }
    return { ok: true };
}