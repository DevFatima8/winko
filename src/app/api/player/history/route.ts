import { NextResponse } from "next/server";
import { Game, GameResult, Transaction } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { getSettings } from "@/lib/platform";
import { getWinHoldSummary } from "@/lib/winHold";
import { gameResultGameMap } from "@/lib/gameResultGames";

export async function GET(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || me.role !== "client") return NextResponse.json({ error: "Login required." }, { status: 401 });
        const slug = new URL(request.url).searchParams.get("game");
        if (slug !== null) {
            if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: "Invalid game." }, { status: 400 });
            const game = await Game.findOne({ slug }, "_id").lean();
            if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
            const limit = [30, 40, 50][Array.from(slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3];
            const results = await GameResult.find({
                userId: me.id, gameId: { $in: [String(game._id), slug] }, outcome: { $ne: "pending" },
            }).sort({ createdAt: -1 }).limit(limit).lean();
            return NextResponse.json({
                limit, plays: results.map(result => ({
                    id: String(result._id), round: result.roundNo, bet: result.betAmount,
                    payout: result.winAmount, outcome: result.outcome, at: result.createdAt,
                    poolPending: result.poolPending === true, claim: result.poolClaim ?? 0,
                })),
            }, { headers: { "Cache-Control": "no-store" } });
        }
        const [transactions, results, [totals], settings, holds] = await Promise.all([
            Transaction.find({ userId: me.id }).sort({ createdAt: -1 }).limit(100).lean(),
            GameResult.find({ userId: me.id, outcome: { $ne: "pending" } }).sort({ createdAt: -1 }).limit(100).lean(),
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