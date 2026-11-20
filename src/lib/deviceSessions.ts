import { randomUUID } from "node:crypto";
import type { DeviceSessionDoc, UserDoc } from "@/models";
import type { MultiplayerTransaction } from "./multiplayer-store";

export const DEVICE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function activeDeviceSessions(rows: DeviceSessionDoc[], now: number) {
  return rows.filter(row => !row.revokedAt &&
    (row.expiresAt ? new Date(row.expiresAt).getTime() : new Date(row.createdAt).getTime() + DEVICE_SESSION_TTL_MS) > now);
}

export async function recordDeviceLogin(tx: MultiplayerTransaction, input: {
  userId: string; sessionId: string; deviceId: string; deviceName: string; userAgent: string; ip: string | null;
}) {
  const user = await tx.get<UserDoc>("users", input.userId, true);
  if (!user || user.isActive === false) throw new Error("Active account required for device login.");
  const now = new Date(await tx.now());
  const previous = await tx.findWhere<DeviceSessionDoc>("devicesessions", { userId: input.userId, deviceId: input.deviceId }, 1);
  const id = randomUUID();
  await tx.insert("devicesessions", id, {
    _id: id, ...input, lastSeenAt: now, revokedAt: null,
    expiresAt: new Date(now.getTime() + DEVICE_SESSION_TTL_MS), createdAt: now, updatedAt: now,
  });
  if (user.role === "admin" && !previous.length) {
    const notificationId = randomUUID();
    await tx.insert("notifications", notificationId, {
      _id: notificationId, title: "Security alert: Super Admin new device login",
      body: `${user.name}${user.adminId ? ` (${user.adminId})` : ""} signed in on ${input.deviceName} at ${now.toISOString()}${input.ip ? ` | IP ${input.ip}` : ""}.`,
      type: "warning", audience: "owners", userId: null, href: "/admin/devices",
      isActive: true, readBy: [], createdAt: now, updatedAt: now,
    });
  }
}

export async function revokeAccountSessions(tx: MultiplayerTransaction, actorId: string, userId: string) {
  const actor = await tx.get<UserDoc>("users", actorId);
  if (!actor || actor.role !== "owner" || !actor.isActive) throw new Error("Agent access required.");
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user) throw new Error("Account not found.");
  const now = new Date(await tx.now());
  let afterId = "", revoked = 0;
  while (true) {
    const rows = await tx.page<DeviceSessionDoc>("devicesessions", { userId }, afterId);
    for (const row of rows) {
      if (row.revokedAt) continue;
      row.revokedAt = now;
      row.updatedAt = now;
      await tx.put("devicesessions", row._id, row);
      revoked++;
    }
    if (rows.length < 500) break;
    afterId = rows[rows.length - 1]._id;
  }
  user.sessionsRevokedAt = now;
  user.updatedAt = now;
  await tx.put("users", userId, user);
  const id = randomUUID();
  await tx.insert("adminlogs", id, {
    _id: id, actorId, actorName: actor.name, actorRole: actor.role,
    action: "logout_account_devices", target: userId, details: `${revoked} sessions revoked`,
    createdAt: now, updatedAt: now,
  });
  return revoked;
}
