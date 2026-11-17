import { NextResponse } from "next/server";
import { AdminLog, oid, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { normalizeBetPresets } from "@/lib/betPresets";
import { isStaff } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "admin" || me.level < 1) return NextResponse.json({ error: "Admin login required." }, { status: 403 });
    const body = await request.json().catch(() => null) as { userId?: unknown; betPresets?: unknown } | null;
    const betPresets = normalizeBetPresets(body?.betPresets);
    if (typeof body?.userId !== "string" || !body.userId.trim() || !betPresets) {
      return NextResponse.json({ error: "Player ID and five different amounts from 10 to 100,000 are required." }, { status: 400 });
    }
    const player = await User.findById(body.userId, "role referredBy").lean();
    if (!player || isStaff(player.role) || (me.level < 2 && String(player.referredBy ?? "") !== me.id)) {
      return NextResponse.json({ error: "Player not found or outside your team." }, { status: 404 });
    }
    const result = await User.updateOne({ _id: oid(body.userId) }, { $set: { betPresets } });
    if (!result.matchedCount) return NextResponse.json({ error: "Player account was not found." }, { status: 404 });
    await AdminLog.create({
      actorId: oid(me.id), actorName: me.name, actorRole: me.dbRole,
      action: "set_player_bet_presets", target: body.userId, details: betPresets.join(", "),
    });
    return NextResponse.json({ ok: true, betPresets });
  } catch (error) {
    console.error("[admin bet presets]", error);
    return NextResponse.json({ error: "Bet amounts save nahi ho sakin." }, { status: 503 });
  }
}
