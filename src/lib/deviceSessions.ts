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
