import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getWinHoldSummary } from "@/lib/winHold";

export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client" || !me.isActive) return NextResponse.json({ error: "Active player login required." }, { status: 401 });
    return NextResponse.json(await getWinHoldSummary(me.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Player winnings]", error);
    return NextResponse.json({ error: "Winnings load nahi ho sakin." }, { status: 503 });
  }
}
