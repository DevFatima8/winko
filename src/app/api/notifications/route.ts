import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { dbConnect } from "@/lib/mongo";
import { Notification, oid } from "@/models";
import { notificationFilter } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getServerSessionUser();
    await dbConnect();
    const filter = await notificationFilter(user?.id ?? null, user?.dbRole ?? null);
    const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean();
    const userId = user ? oid(user.id) : null;
    const mapped = items.map((item) => ({
      id: String(item._id), title: item.title, body: item.body, type: item.type, audience: item.audience, href: item.href ?? null,
      at: item.createdAt, read: userId ? (item.readBy ?? []).some((id: string) => String(id) === String(userId)) : false,
    }));
    return NextResponse.json({ items: mapped, unread: mapped.filter((item) => !item.read).length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "ETIMEDOUT") console.error("[notifications:get]", error);
    return NextResponse.json({ error: "Notifications load nahi ho sakin." }, { status: 503 });
  }
}

export async function POST() {
  try {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    await Notification.updateMany({ ...await notificationFilter(user.id, user.dbRole), readBy: { $ne: oid(user.id) } }, { $addToSet: { readBy: oid(user.id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "ETIMEDOUT") console.error("[notifications:read]", error);
    return NextResponse.json({ error: "Notifications update nahi ho sakin." }, { status: 503 });
  }
}