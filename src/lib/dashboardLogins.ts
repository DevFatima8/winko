import type { LoginEventDoc, UserDoc } from "@/models";

type Login = Pick<LoginEventDoc, "userId" | "createdAt" | "ip" | "role">;
type LoginUser = Pick<UserDoc, "_id" | "role" | "lastLoginAt" | "lastLoginIp">;
const dayKey = (date: Date | string) => new Date(new Date(date).getTime() + 5 * 3600000).toISOString().slice(0, 10);

// Older login routes did not await the event write; use only the user's actual
// persisted last-login timestamp to fill that missing day, never invented history.
export function recordedPlayerLogins(users: readonly LoginUser[], events: readonly Login[]): Login[] {
  const rows = events.filter(event => event.role === "client" || event.role === "agent");
  const known = new Set(rows.map(event => `${event.userId}:${dayKey(event.createdAt)}`));
  for (const user of users) {
    if ((user.role !== "client" && user.role !== "agent") || !user.lastLoginAt) continue;
    const key = `${user._id}:${dayKey(user.lastLoginAt)}`;
    if (known.has(key)) continue;
    rows.push({ userId: String(user._id), createdAt: user.lastLoginAt, ip: user.lastLoginIp, role: user.role });
    known.add(key);
  }
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
