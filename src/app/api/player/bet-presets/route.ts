import { NextResponse } from "next/server";
import { oid, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { normalizeBetPresets } from "@/lib/betPresets";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { betPresets?: unknown };
    const betPresets = normalizeBetPresets(body.betPresets);
    if (!betPresets) return NextResponse.json({ error: "Enter five different amounts from 0.01 to 50,000." }, { status: 400 });
    const result = await User.updateOne({ _id: oid(me.id) }, { $set: { betPresets } });
    if (result.matchedCount === 0) return NextResponse.json({ error: "Player account was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, betPresets });
  } catch (error) {
    console.error("[player bet presets]", error);
    return NextResponse.json({ error: "Bet amounts save nahi ho sakin." }, { status: 503 });
  }
}
