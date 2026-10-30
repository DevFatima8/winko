import { NextResponse } from "next/server";
import { Game, GameResult, Transaction } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings } from "@/lib/platform";
import { getWinHoldSummary } from "@/lib/winHold";
import { gameResultGameMap } from "@/lib/gameResultGames";

export async function GET() {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const [transactions, results, [totals], settings, holds] = await Promise.all([
            Transaction.find({ userId: me.id }).sort({ createdAt: -1 }).limit(100).lean(),
            GameResult.find({ userId: me.id }).sort({ createdAt: -1 }).limit(100).lean(),
            GameResult.aggregate<{ _id: null; rounds: number; bets: number; wins: number }>([
                { $match: { userId: me.id, outcome: { $ne: "pending" }, poolPending: { $ne: true } } },
                { $group: { _id: null, rounds: { $sum: 1 }, bets: { $sum: "$betAmount" }, wins: { $sum: "$winAmount" } } },
            ]),
            getSettings(),
            getWinHoldSummary(me.id),
        ]);
        const gameIds = [...new Set(results.map((result) => String(result.gameId)))];
        const games = gameIds.length ? await Game.find({ $or: [{ _id: { $in: gameIds } }, { slug: { $in: gameIds } }] }, "slug name icon").lean() : [];
        const gameMap = gameResultGameMap(games);
        const plays = results.map((result) => ({ ...result, gameId: gameMap.get(String(result.gameId)) ?? null }));
        return NextResponse.json({
            transactions,
            plays,
            me,
            totals: { rounds: totals?.rounds ?? 0, bets: totals?.bets ?? 0, wins: totals?.wins ?? 0 },
            vipLevels: settings.vipLevels,
            holds,
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[player history]", error);
        return NextResponse.json({ error: "History load nahi ho saki." }, { status: 503 });
    }
}