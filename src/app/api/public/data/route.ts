import { NextResponse } from "next/server";
import { Game, GameResult, HelpArticle, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { ensureHelp, getSettings, supportOnline } from "@/lib/platform";
import { dbConnect } from "@/lib/mongo";
import { GAME_SLUGS } from "@/lib/gameCatalog";
import { LOCAL_GAMES_CONNECTED } from "@/lib/gameAvailability";
import { getSiteGameCatalog } from "@/lib/siteGameCatalog";
import { PROVIDER_GAMES_VISIBLE } from "@/lib/gameAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        await dbConnect();
        const params = new URL(request.url).searchParams;
        const view = params.get("view");
        if (view === "game") {
            if (!LOCAL_GAMES_CONNECTED) return NextResponse.json({ active: false }, { status: 404 });
            const slug = params.get("slug") ?? "";
            if (!slug || !GAME_SLUGS.includes(slug)) {
                return NextResponse.json({ active: false }, { status: 404 });
            }
            let game = await Game.findOne({ slug }, "slug isActive").lean();
            if (!game) {
                const { ensureGames } = await import("@/lib/seed");
                await ensureGames();
                game = await Game.findOne({ slug }, "slug isActive").lean();
            }
            return NextResponse.json({ active: game?.isActive === true }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "help") {
            await ensureHelp();
            const [articles, settings, me] = await Promise.all([
                HelpArticle.find({ isActive: true }).sort({ category: 1, order: 1 }).lean(),
                getSettings(),
                getServerSessionUser(),
            ]);
            const seen = new Set<string>();
            const unique = articles.filter((a) => {
                const key = `${a.category}|${String(a.title).trim().toLowerCase()}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            return NextResponse.json({ articles: unique, links: settings.links, me }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "catalog" || view === "games") {
            const [catalog, me] = await Promise.all([getSiteGameCatalog(), getServerSessionUser()]);
            const games = catalog.filter(game => game.isActive && !(me?.blockedGames ?? []).includes(game.slug));
            if (view === "catalog") return NextResponse.json({ games }, { headers: { "Cache-Control": "private, no-store" } });
            return NextResponse.json({
                activeSlugs: games.filter((game) => game.isActive !== false).map((game) => game.slug),
                hotSlugs: games.filter((game) => game.isActive !== false && game.isHot === true).map((game) => game.slug),
            }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "recent-wins") {
            const gameRows = await Game.find({ slug: PROVIDER_GAMES_VISIBLE
                ? { $regex: /^gregmorn-[a-f0-9]{40}$/ } : { $in: [...GAME_SLUGS] } }, "_id slug name isActive").lean();
            const games = gameRows.filter((game) => game.isActive !== false);
            const gamesByReference = new Map(games.flatMap((game) => [
                [String(game._id), game] as const,
                [game.slug, game] as const,
            ]));
            const results = games.length ? await GameResult.find({
                gameId: { $in: [...gamesByReference.keys()] },
                userId: { $ne: null },
                outcome: "win",
                winAmount: { $gt: 0 },
            }, "gameId userId winAmount createdAt updatedAt").sort({ updatedAt: -1 }).limit(24).lean() : [];
            const userIds = [...new Set(results.map((result) => result.userId).filter((id): id is string => Boolean(id)))];
            const users = userIds.length ? await User.find({ _id: { $in: userIds } }, "_id name").lean() : [];
            const usersById = new Map(users.map((user) => [String(user._id), user]));
            const wins = results.flatMap((result) => {
                const game = gamesByReference.get(String(result.gameId));
                const name = usersById.get(String(result.userId))?.name?.trim();
                const amount = Number(result.winAmount);
                if (!game || !name || !Number.isFinite(amount) || amount <= 0) return [];
                const maskedName = `${name[0]}${"*".repeat(Math.max(1, Math.min(4, name.length - 2)))}${name.length > 1 ? name[name.length - 1] : ""}`;
                return [{
                    id: String(result._id),
                    player: maskedName,
                    gameSlug: game.slug,
                    gameName: game.name,
                    winAmount: amount,
                    createdAt: new Date(result.updatedAt ?? result.createdAt).toISOString(),
                }];
            });
            return NextResponse.json({ wins }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "invite") {
            const [settings, me] = await Promise.all([getSettings(), getServerSessionUser()]);
            return NextResponse.json({ referralCode: me?.referralCode ?? null, depositCommissionPct: settings.referral?.depositCommissionPct ?? 1.5 });
        }
        const settings = await getSettings();
        if (view === "info") {
            const me = await getServerSessionUser();
            return NextResponse.json({ settings, me, supportOnline: supportOnline(settings.support) });
        }
        if (view === "lobby") return NextResponse.json({ links: { ...settings.links, androidUrl: settings.app?.androidUrl, iosUrl: settings.app?.iosUrl }, leaderboard: (settings.leaderboard ?? []).slice(0, 3) });
        return NextResponse.json({ error: "Unknown public data view." }, { status: 404 });
    } catch (error) {
        console.error("[public data]", error);
        return NextResponse.json({ error: "Data load nahi ho saka." }, { status: 503 });
    }
}