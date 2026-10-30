import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { dbConnect } from "@/lib/mongo";
import { Settings } from "@/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getServerSessionUser();
  if (!user || user.level < 2) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  await dbConnect();
  const settings = await Settings.findOne({ key: "main" }).lean();
  return NextResponse.json({ announcement: settings?.announcement ?? "", announcements: String(settings?.announcement ?? "").split("\n").map((s) => s.trim()).filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user || user.level < 2) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const source: unknown[] = Array.isArray(body.announcements) ? body.announcements : [body.announcement ?? ""];
  const list = source.map((s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 500)).filter(Boolean).slice(0, 100);
  const announcement = list.join("\n");
  await dbConnect();
  await Settings.updateOne({ key: "main" }, { $set: { announcement } }, { upsert: true });
  return NextResponse.json({ ok: true, announcements: list });
}