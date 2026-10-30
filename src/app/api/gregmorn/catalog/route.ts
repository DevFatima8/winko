import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getProviderCatalog } from "@/lib/gregmornCatalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await getServerSessionUser();
  const currency = new URL(request.url).searchParams.get("currency") ?? process.env.GREGMORN_CURRENCY ?? "PKR";
  try {
    const games = (await getProviderCatalog(currency)).filter(game => game.isActive && !(me?.blockedGames ?? []).includes(game.slug));
    return NextResponse.json({ currency, games }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gregmorn game catalogue is unavailable.";
    console.error("[gregmorn catalog]", message);
    return NextResponse.json({ error: "Provider games are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
