import { dbConnect } from "./mongo";
import { Notification, User, oid } from "@/models";
import type { NotificationDoc } from "@/models";

type NotificationType = "info" | "promo" | "warning" | "success";
type NotificationOptions = { href?: string; actorRole?: string };

export async function notifyUser(userId: string, title: string, body: string, type: NotificationType = "info", options: NotificationOptions = {}) {
  if (options.actorRole === "owner") return null;
  await dbConnect();
  const notification = await Notification.create({ title, body, type, audience: "user", userId: oid(userId), href: options.href ?? null });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wx:notification-local"));
  return notification;
}

export async function notifyAdmins(title: string, body: string, type: NotificationType = "info", options: NotificationOptions = {}) {
  if (options.actorRole === "owner") return null;
  await dbConnect();
  const notification = await Notification.create({ title, body, type, audience: "admins", userId: null, href: options.href ?? null });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wx:notification-local"));
  return notification;
}

export async function notificationFilter(userId: string | null, role: string | null): Promise<Record<string, unknown>> {
  const uid = userId ? oid(userId) : null;
  type Aud = NotificationDoc["audience"];
  const aud: Aud[] = ["all"];
  if (role === "client") aud.push("clients");
  if (role === "agent") aud.push("clients", "agents");
  if (role === "admin" || role === "owner") aud.push("admins");
  if (role === "owner") aud.push("owners");

  let q: Record<string, unknown>;
  if (role === "subadmin" && userId) {
    const teamIds = (await User.find({ referredBy: userId, role: { $in: ["client", "agent"] } }, "_id").lean()).map((u) => String(u._id));
    teamIds.push(String(userId));
    q = { isActive: true, $or: [{ audience: "all" }, { audience: "user", userId: { $in: teamIds } }] };
  } else if (uid) {
    q = { isActive: true, $or: [{ audience: { $in: aud } }, { audience: "user", userId: uid }] };
  } else {
    q = { isActive: true, audience: "all" };
  }

  return q;
}

export async function getNotifications(userId: string | null, role: string | null) {
  await dbConnect();
  const uid = userId ? oid(userId) : null;
  const list = await Notification.find(await notificationFilter(userId, role)).sort({ createdAt: -1 }).limit(30).lean<NotificationDoc[]>();
  return {
    items: list.map((n) => ({ id: String(n._id), title: n.title, body: n.body, type: n.type, audience: n.audience, href: n.href ?? null, at: n.createdAt, read: uid ? (n.readBy ?? []).some((r) => String(r) === String(uid)) : false })),
    unread: uid ? list.filter((n) => !(n.readBy ?? []).some((r) => String(r) === String(uid))).length : 0,
  };
}
export async function markAllNotificationsRead(userId: string | null) {
  if (!userId) return { ok: false };
  await dbConnect();
  const user = await User.findById(userId, "role").lean();
  if (!user) return { ok: false };
  await Notification.updateMany({ ...await notificationFilter(userId, user.role), readBy: { $ne: oid(userId) } }, { $addToSet: { readBy: oid(userId) } });
  return { ok: true };
}
