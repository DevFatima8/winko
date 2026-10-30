import { NextResponse } from "next/server";
import { clearAuthCookie, revokeCurrentDeviceSession } from "@/lib/serverAuth";

export async function POST() {
  await revokeCurrentDeviceSession();
  return clearAuthCookie(NextResponse.json({ ok: true }));
}