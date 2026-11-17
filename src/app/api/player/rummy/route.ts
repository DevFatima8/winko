import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { mysqlMultiplayerStore } from "@/lib/multiplayer-store";
import { dailyPoolLock } from "@/lib/dailyPoolRules";
import { rummyUnlockedLevel } from "@/lib/rummyProgress";

export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const unlockedLevel = await mysqlMultiplayerStore.transact(dailyPoolLock("rummy"), tx => rummyUnlockedLevel(tx, me.id));
    return NextResponse.json({ unlockedLevel }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[rummy levels]", error);
    return NextResponse.json({ error: "Rummy level progress could not be loaded. Please retry." }, { status: 503 });
  }
}
