import { getServerSessionUser } from "@/lib/serverAuth";
import { dbConnect } from "@/lib/mongo";
import { Notification, User, oid } from "@/models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function notificationFilter(user: Awaited<ReturnType<typeof getServerSessionUser>>) {
  if (!user) return null;
  const userId = oid(user.id);
  if (user.dbRole === "subadmin") {
    const teamIds = (await User.find({ referredBy: user.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((entry) => String(entry._id));
    return { isActive: true, $or: [{ audience: "all" }, { audience: "user", userId: { $in: teamIds } }] };
  }
  const audiences: string[] = ["all"];
  if (user.dbRole === "client") audiences.push("clients");
  if (user.dbRole === "agent") audiences.push("clients", "agents");
  if (["admin", "owner"].includes(user.dbRole)) audiences.push("admins");
  return { isActive: true, $or: [{ audience: { $in: audiences } }, { audience: "user", userId }] };
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let polling = false;
  const user = await getServerSessionUser();
  const filter = await notificationFilter(user);
  const known = new Set<string>();
  let seeded = false;
  let previousAnnouncement: string | null = null;
  let previousVersion: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (type: string, data: unknown) => {
        if (!stopped) controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const poll = async () => {
        if (stopped || polling) return;
        polling = true;
        try {
          await dbConnect();
          const settings = await (await import("@/lib/platform")).getSettings();
          const announcement = settings.announcement ?? "";
          const version = `${settings.updatedAt ? new Date(settings.updatedAt as unknown as string).getTime() : 0}`;
          if (previousVersion !== null && previousVersion !== version) send("refresh", { at: Date.now() });
          previousVersion = version;
          if (previousAnnouncement !== announcement) {
            previousAnnouncement = announcement;
            send("announcement", announcement);
          }
          if (!filter) return;
          const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(40).lean();
          if (!seeded) {
            notifications.forEach((item) => known.add(String(item._id)));
            seeded = true;
            return;
          }
          const fresh = notifications.filter((item) => !known.has(String(item._id))).reverse();
          for (const item of fresh) {
            known.add(String(item._id));
            send("notification", {
              id: String(item._id), title: item.title, body: item.body, type: item.type,
              audience: item.audience, href: item.href ?? null, at: item.createdAt, read: false,
            });
          }
          if (known.size > 500) {
            const keep = new Set(notifications.map((item) => String(item._id)));
            known.clear();
            keep.forEach((id) => known.add(id));
          }
        } catch (error: any) {
          if (error?.code !== "ECONNRESET" && error?.code !== "ENETUNREACH") {
            console.error("[events:poll]", error?.message || error);
          }
        } finally {
          polling = false;
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      void poll();
      timer = setInterval(() => void poll(), 20000);
      heartbeat = setInterval(() => {
        if (!stopped) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15000);
      request.signal.addEventListener("abort", () => {
        stopped = true;
        if (timer) clearInterval(timer);
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { }
      }, { once: true });
    },
    cancel() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}