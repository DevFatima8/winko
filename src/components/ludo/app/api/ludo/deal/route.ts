import { createDeal, isValidBet } from "@/lib/ludo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { bet?: unknown };
    const bet = Number(body?.bet);
    if (!isValidBet(bet)) {
      return Response.json({ error: "Invalid bet" }, { status: 400 });
    }
    const seed = Math.floor(Math.random() * 2147483646) + 1;
    return Response.json(createDeal(bet, seed));
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
}
