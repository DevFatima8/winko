import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { DeviceSession, User, type DeviceSessionDoc, type UserDoc } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { activeDeviceSessions } from "@/lib/deviceSessions";
import { getMysqlPool, isMysqlEnabled } from "@/lib/mysql";

export async function GET(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (me?.dbRole !== "owner") return NextResponse.json({ error: "Agent access required." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const filter = q ? { $or: [{ name: pattern }, { username: pattern }, { adminId: pattern }, { phone: pattern }] } : {};
    const pool = isMysqlEnabled() ? await getMysqlPool() : null;
    if (isMysqlEnabled() && !pool) throw new Error("Device database unavailable.");
    let users: UserDoc[], total: number;
    if (pool) {
      const where = q ? `WHERE ${["name", "username", "adminId", "phone"].map(field =>
        `LOCATE(LOWER(?), LOWER(JSON_UNQUOTE(JSON_EXTRACT(data, '$.${field}')))) > 0`).join(" OR ")}` : "";
      const values = q ? [q, q, q, q] : [];
      const [[accounts], [counts]] = await Promise.all([
        pool.execute<(RowDataPacket & { data: string | UserDoc })[]>(`SELECT data FROM users ${where} ORDER BY created_at DESC, id ASC LIMIT 50 OFFSET ${(page - 1) * 50}`, values),
        pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM users ${where}`, values),
      ]);
      users = accounts.map(row => typeof row.data === "string" ? JSON.parse(row.data) as UserDoc : row.data);
      total = Number(counts[0].total);
    } else {
      const accounts = await User.find(filter).sort({ createdAt: -1, _id: 1 }).lean();
      total = accounts.length;
      users = accounts.slice((page - 1) * 50, page * 50);
    }
    const ids = users.map(user => String(user._id));
    let rows: DeviceSessionDoc[] = [];
    if (ids.length && pool) {
      const [result] = await pool.execute<(RowDataPacket & { data: string | DeviceSessionDoc })[]>(
        `SELECT data FROM devicesessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      rows = result.map(row => typeof row.data === "string" ? JSON.parse(row.data) as DeviceSessionDoc : row.data);
    } else if (ids.length) {
      rows = await DeviceSession.find({ userId: { $in: ids } }).lean();
    }
    const active = activeDeviceSessions(rows, Date.now());
    return NextResponse.json({
      page, total, users: users.map(user => {
        const latest = new Map<string, DeviceSessionDoc>();
        if (user.isActive !== false) for (const row of active) {
          if (String(row.userId) !== String(user._id)) continue;
          const key = row.deviceId ?? row.sessionId;
          const previous = latest.get(key);
          if (!previous || new Date(row.lastSeenAt).getTime() > new Date(previous.lastSeenAt).getTime()) latest.set(key, row);
        }
        return {
          id: String(user._id), name: user.name, username: user.username, adminId: user.adminId, role: user.role,
          deviceCount: latest.size,
          devices: [...latest.values()].map(row => ({
            deviceName: row.deviceName, ip: row.ip, lastSeenAt: row.lastSeenAt,
          })),
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin devices]", error);
    return NextResponse.json({ error: "Devices load nahi ho sakin. Dobara try karein." }, { status: 503 });
  }
}
