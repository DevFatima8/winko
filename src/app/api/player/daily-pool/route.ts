import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isDailyPoolGame } from "@/lib/dailyPoolRules";
import { playerPoolStatus } from "@/lib/dailyPoolService";
import { dailyPoolEnabled } from "@/lib/dailyPoolConfig";
import { isCardGame } from "@/lib/cardGameRules";
import { isRouletteGame, isWheelGame } from "@/lib/rouletteGameRules";
import { isSlotGame } from "@/lib/slotGameRules";

export async function GET(request: Request) {
  try {
    const user = await getServerSessionUser();
    if (!user || user.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
    const game = new URL(request.url).searchParams.get("game") ?? "";
    if (!isDailyPoolGame(game)) return NextResponse.json({ error: "Invalid daily-pool game." }, { status: 400 });
    return NextResponse.json({ ...await playerPoolStatus(user.id, game), enabled: !isCardGame(game) && !isRouletteGame(game) && !isWheelGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && game !== "aviator" && game !== "aviator-x" && dailyPoolEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[daily pool status]", error);
    return NextResponse.json({ error: "Daily pool status unavailable. Please retry." }, { status: 503 });
  }
}
