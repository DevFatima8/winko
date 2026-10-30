import { dbConnect } from "./mongo";
import { SupportMessage, SupportThread, User, oid } from "@/models";
import { getCurrentUser, getSessionSync } from "./auth";
import { getSettings, supportOnline } from "./platform";

const GUEST_KEY = "wx_guest";
function guestId() {
  if (typeof window === "undefined") return null;
  let g = localStorage.getItem(GUEST_KEY);
  if (!g) { g = "g_" + Math.random().toString(36).slice(2, 12); localStorage.setItem(GUEST_KEY, g); }
  return g;
}
async function identify() {
  const s = getSessionSync();
  return { userId: s?.id ?? null, guestId: s ? null : guestId(), name: s?.name ?? "Guest" };
}
async function findThread(userId: string | null, gid: string | null, create: boolean) {
  const q = userId ? { userId: oid(userId) } : { guestId: gid };
  let t = await SupportThread.findOne(q).sort({ lastMessageAt: -1 });
  if (!t && create) t = await SupportThread.create({ userId: userId ? oid(userId) : null, guestId: gid, guestName: userId ? null : "Guest" });
  return t;
}

export async function getSupportState() {
  await dbConnect();
  const settings = await getSettings();
  const online = supportOnline(settings.support);
  const { userId, guestId: gid } = await identify();
  const t = await findThread(userId, gid, false);
  const messages = t ? await SupportMessage.find({ threadId: t._id }).sort({ createdAt: 1 }).limit(200).lean() : [];
  if (t && t.unreadForUser > 0) await SupportThread.updateOne({ _id: t._id }, { $set: { unreadForUser: 0 } });
  return {
    online,
    hours: settings.support?.is247 ? "24/7" : `${settings.support?.startHour ?? 9}:00 – ${settings.support?.endHour ?? 23}:00 PKT`,
    welcome: settings.support?.welcomeMessage ?? "", offlineMessage: settings.support?.offlineMessage ?? "", links: settings.links,
    threadId: t ? String(t._id) : null,
    messages: messages.map((m) => ({ id: String(m._id), from: m.from, text: m.text, agentName: m.agentName, at: m.createdAt })),
  };
}

export async function sendSupportMessage(textRaw: string, name?: string) {
  await dbConnect();
  const text = String(textRaw ?? "").trim().slice(0, 2000);
  if (!text) return { error: "Message khali hai." };
  const { userId, guestId: gid, name: sname } = await identify();
  const t = (await findThread(userId, gid, true))!;
  if (!userId && name) await SupportThread.updateOne({ _id: t._id }, { $set: { guestName: String(name).slice(0, 60) } });
  await SupportMessage.create({ threadId: t._id, from: "user", text });
  const settings = await getSettings();
  const online = supportOnline(settings.support);
  await SupportThread.updateOne({ _id: t._id }, { $set: { lastMessage: text, lastMessageAt: new Date(), status: "open" }, $inc: { unreadForAdmin: 1 } });
  const count = await SupportMessage.countDocuments({ threadId: t._id, from: "user" });
  if (count === 1 && settings.support?.welcomeMessage) await SupportMessage.create({ threadId: t._id, from: "system", text: settings.support.welcomeMessage.replace("{name}", sname) });
  if (!online && settings.support?.offlineMessage) {
    const last = await SupportMessage.findOne({ threadId: t._id, from: "system", text: settings.support.offlineMessage }).sort({ createdAt: -1 }).lean();
    if (!last || Date.now() - new Date(last.createdAt).getTime() > 30 * 60 * 1000) await SupportMessage.create({ threadId: t._id, from: "system", text: settings.support.offlineMessage });
  }
  return { ok: true, online };
}

/* ---------- admin side ---------- */
async function canAccessAdminThread(me: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, thread: { userId: string | null; assignedTo: string | null }) {
  if (me.level >= 2) return true;
  if (thread.assignedTo && String(thread.assignedTo) !== me.id) return false;
  if (!thread.userId) return String(thread.assignedTo ?? "") === me.id;
  return !!await User.findOne({ _id: thread.userId, referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean();
}

export async function adminListThreads() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "Unauthorized" as const };
  const teamIds = me.level < 2
    ? (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id)
    : null;
  const filter = teamIds
    ? { $and: [{ $or: [{ userId: { $in: teamIds } }, { assignedTo: oid(me.id) }] }, { $or: [{ assignedTo: null }, { assignedTo: oid(me.id) }] }] }
    : {};
  const threads = await SupportThread.find(filter).sort({ lastMessageAt: -1 }).limit(150).populate<{ userId: { name: string; phone: string; username?: string } | null }>("userId", "name phone username").lean();
  return { me: { id: me.id, level: me.level }, threads: threads.map((t) => ({ id: String(t._id), name: t.userId?.name ?? t.guestName ?? "Guest", phone: t.userId?.phone ?? null, status: t.status, last: t.lastMessage, at: t.lastMessageAt, unread: t.unreadForAdmin, assignedTo: t.assignedTo ? String(t.assignedTo) : null, assignedName: t.assignedName ?? null })) };
}
export async function adminThreadMessages(id: string) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "Unauthorized" as const, status: 401 };
  const t = await SupportThread.findById(id).lean();
  if (!t) return { error: "Not found", status: 404 };
  if (!await canAccessAdminThread(me, t)) return { error: "Ye chat aapki team mein nahi hai.", status: 403 };
  const msgs = await SupportMessage.find({ threadId: oid(id) }).sort({ createdAt: 1 }).limit(300).lean();
  await SupportThread.updateOne({ _id: oid(id) }, { $set: { unreadForAdmin: 0 } });
  return { messages: msgs.map((m) => ({ id: String(m._id), from: m.from, text: m.text, agentName: m.agentName, at: m.createdAt })) };
}
export async function adminReply(threadId: string, textRaw: string) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "Unauthorized" };
  const text = String(textRaw ?? "").trim().slice(0, 2000);
  if (!text || !threadId) return { error: "Invalid" };
  const t = await SupportThread.findById(threadId).lean();
  if (!t) return { error: "Not found" };
  if (!await canAccessAdminThread(me, t)) return { error: "Ye chat aapki team mein nahi hai." };
  const shownName = me.level >= 3 ? "Support Team" : me.name;
  if (!t.assignedTo && me.level < 3) {
    await SupportThread.updateOne({ _id: t._id, assignedTo: null }, { $set: { assignedTo: oid(me.id), assignedName: me.name } });
    const claimedThread = await SupportThread.findById(t._id, "assignedTo").lean();
    if (String(claimedThread?.assignedTo ?? "") !== me.id) return { error: "Ye chat kisi aur admin ke paas hai." };
  }
  await SupportMessage.create({ threadId: oid(threadId), from: "agent", text, agentName: shownName, agentId: oid(me.id) });
  await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { lastMessage: text, lastMessageAt: new Date(), unreadForAdmin: 0, status: "open" }, $inc: { unreadForUser: 1 } });
  return { ok: true };
}
export async function adminReleaseThread(threadId: string) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin" || me.level < 2) return { error: "Unauthorized" };
  await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { assignedTo: null, assignedName: null } });
  return { ok: true };
}
