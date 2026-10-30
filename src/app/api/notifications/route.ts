import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { dbConnect } from "@/lib/mongo";
import { Notification, User, oid } from "@/models";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getServerSessionUser();
    await dbConnect();
    let filter: Record<string, unknown>;
    if (!user) {
      filter = { isActive: true, audience: "all" };
    } else if (user.dbRole === "subadmin") {
      const teamIds = (await User.find({ referredBy: user.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((entry) => String(entry._id));
      filter = { isActive: true, $or: [{ audience: "all" }, { audience: "user", userId: { $in: teamIds } }] };
    } else {
      const audiences = ["all"];
      if (user.dbRole === "client") audiences.push("clients");
      if (user.dbRole === "agent") audiences.push("clients", "agents");
      if (["admin", "owner"].includes(user.dbRole)) audiences.push("admins");
      filter = { isActive: true, $or: [{ audience: { $in: audiences } }, { audience: "user", userId: oid(user.id) }] };
    }
    const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean();
    const userId = user ? oid(user.id) : null;
    const mapped = items.map((item) => ({
      id: String(item._id), title: item.title, body: item.body, type: item.type, audience: item.audience,
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
    await Notification.updateMany({ isActive: true, readBy: { $ne: oid(user.id) } }, { $addToSet: { readBy: oid(user.id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "ETIMEDOUT") console.error("[notifications:read]", error);
    return NextResponse.json({ error: "Notifications update nahi ho sakin." }, { status: 503 });
  }
}