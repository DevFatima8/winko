import { NextResponse } from "next/server";
import { AdminLog, Commission, Feedback, Game, GameResult, LoginEvent, Notification, PaymentAccount, SupportThread, Transaction, User } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isStaff } from "@/lib/auth";
import { ensureHelp, getSettings } from "@/lib/platform";
import { getProviderCatalog } from "@/lib/gregmornCatalog";
import { gameResultGameMap } from "@/lib/gameResultGames";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const response = await loadData(request);
    const privateFields = new Set(["passwordHash", "totpSecret", "totpPendingSecret", "totpPendingUntil", "totpLastStep", "securityAnswerHash", "securityFailures", "securityLockedUntil"]);
    const text = await response.text();
    const body = text ? JSON.stringify(JSON.parse(text), (key, value) => privateFields.has(key) ? undefined : value) : null;
    return new Response(body, { status: response.status, headers: response.headers });
}

async function loadData(request: Request) {
    try {
        const me = await getServerSessionUser();
        if (!me || !isStaff(me.dbRole) || me.level < 1) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
        const params = new URL(request.url).searchParams;
        const view = params.get("view");

        if (view === "dashboard-detail") {
            const metric = params.get("metric") ?? "";
            const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
            const pageSize = 30;
            const todayMetrics = new Set(["today-payments", "today-earnings", "repeat-players", "today-logins", "login-earners", "repeat-earners"]);
            const period = params.get("period") ?? (todayMetrics.has(metric) ? "today" : "all");
            const now = new Date();
            const pktNow = new Date(now.getTime() + 5 * 3600000);
            const todayStart = new Date(Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), pktNow.getUTCDate()) - 5 * 3600000);
            const todayEnd = new Date(todayStart.getTime() + 86400000);
            let rangeStart: Date | null = null;
            let rangeEnd: Date | null = null;
            let rangeLabel = "All time";
            if (period === "today") {
                rangeStart = todayStart; rangeEnd = todayEnd; rangeLabel = "Today";
            } else if (period === "yesterday") {
                rangeStart = new Date(todayStart.getTime() - 86400000); rangeEnd = todayStart; rangeLabel = "Yesterday";
            } else if (period === "week") {
                rangeStart = new Date(todayStart.getTime() - 6 * 86400000); rangeEnd = todayEnd; rangeLabel = "Last 7 days";
            } else if (period === "month") {
                rangeStart = new Date(Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), 1) - 5 * 3600000); rangeEnd = todayEnd; rangeLabel = "This month";
            } else if (period === "year") {
                rangeStart = new Date(Date.UTC(pktNow.getUTCFullYear(), 0, 1) - 5 * 3600000); rangeEnd = todayEnd; rangeLabel = "This year";
            } else if (period === "days") {
                const days = Math.min(3650, Math.max(1, Number.parseInt(params.get("days") ?? "7", 10) || 7));
                rangeStart = new Date(todayStart.getTime() - (days - 1) * 86400000); rangeEnd = todayEnd; rangeLabel = `Last ${days} days`;
            } else if (period === "date") {
                const requestedDate = params.get("date") ?? "";
                if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
                    return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
                }
                const [year, month, day] = requestedDate.split("-").map(Number);
                const utcDate = new Date(Date.UTC(year, month - 1, day));
                if (utcDate.toISOString().slice(0, 10) !== requestedDate) {
                    return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
                }
                rangeStart = new Date(utcDate.getTime() - 5 * 3600000); rangeEnd = new Date(rangeStart.getTime() + 86400000); rangeLabel = requestedDate;
            } else if (period !== "all") {
                return NextResponse.json({ error: "Unknown date filter." }, { status: 400 });
            }
            const dateFilter = rangeStart ? { createdAt: { $gte: rangeStart, $lt: rangeEnd! } } : {};
            const scopedUsers = me.level < 2
                ? await User.find({ role: { $in: ["client", "agent"] }, referredBy: me.id }).lean()
                : [];
            const teamIds = scopedUsers.map((user) => String(user._id));
            const userRowsMetric = ["total-users", "wallet-balance", "agents"].includes(metric);
            const transactionMetrics = new Set(["today-payments", "total-deposits", "total-withdrawals", "net-cash", "pending-requests"]);
            const resultMetrics = new Set(["today-earnings", "repeat-players", "login-earners", "repeat-earners", "house-profit", "game-rounds", "total-bets", "total-payouts"]);
            const loginMetrics = new Set(["today-logins", "login-earners", "repeat-earners"]);
            const transactionFilter: Record<string, unknown> = {
                ...(me.level < 2 ? { userId: { $in: teamIds } } : {}),
                ...dateFilter,
                ...(metric === "today-payments" || metric === "total-deposits" ? { status: "approved", type: "deposit" } : {}),
                ...(metric === "total-withdrawals" ? { status: "approved", type: "withdraw" } : {}),
                ...(metric === "pending-requests" ? { status: "pending" } : {}),
                ...(metric === "net-cash" ? { status: "approved", type: { $in: ["deposit", "withdraw"] } } : {}),
            };
            const eventUserFilter = me.level < 2 ? { userId: { $in: teamIds } } : {};
            const usersFilter = {
                role: { $in: ["client", "agent"] },
                ...(me.level < 2 ? { referredBy: me.id } : {}),
                ...dateFilter,
            };
            const [users, transactions, results, logins, threads, gameRows] = await Promise.all([
                userRowsMetric
                    ? me.level < 2 ? Promise.resolve(scopedUsers.filter((user) => !rangeStart || (new Date(user.createdAt) >= rangeStart && new Date(user.createdAt) < rangeEnd!))) : User.find(usersFilter).sort({ createdAt: -1 }).lean()
                    : Promise.resolve([]),
                transactionMetrics.has(metric) ? Transaction.find(transactionFilter).sort({ createdAt: -1 }).lean() : Promise.resolve([]),
                resultMetrics.has(metric)
                    ? GameResult.find({ ...eventUserFilter, ...dateFilter }).sort({ createdAt: -1 }).lean()
                    : Promise.resolve([]),
                loginMetrics.has(metric)
                    ? LoginEvent.find({ ...eventUserFilter, ...dateFilter, role: { $in: ["client", "agent"] } }).sort({ createdAt: -1 }).lean()
                    : Promise.resolve([]),
                metric === "support-chats"
                    ? SupportThread.find({
                        ...(me.level < 2 ? { userId: { $in: teamIds } } : {}),
                        status: "open",
                        ...(rangeStart ? { lastMessageAt: { $gte: rangeStart, $lt: rangeEnd! } } : {}),
                    }).sort({ lastMessageAt: -1 }).lean()
                    : Promise.resolve([]),
                resultMetrics.has(metric) ? Game.find().lean() : Promise.resolve([]),
            ]);
            if (request.signal.aborted) return new Response(null, { status: 499 });
            const gameMap = gameResultGameMap(gameRows);
            const isInRange = (date: Date | string) => !rangeStart || (new Date(date) >= rangeStart && new Date(date) < rangeEnd!);
            const approved = transactions.filter((row) => row.status === "approved");
            const deposits = approved.filter((row) => row.type === "deposit");
            const withdrawals = approved.filter((row) => row.type === "withdraw");
            const pendingRows = transactions.filter((row) => row.status === "pending");
            const todayResults = results.filter((row) => row.outcome !== "pending" && isInRange(row.createdAt));
            const todayLogins = logins.filter((row) => isInRange(row.createdAt));
            const todayLoginIds = [...new Set(todayLogins.map((row) => String(row.userId)))];
            const referencedUserIds = [...new Set([
                ...transactions.map((row) => String(row.userId ?? "")),
                ...results.map((row) => String(row.userId ?? "")),
                ...logins.map((row) => String(row.userId ?? "")),
                ...threads.map((row) => String(row.userId ?? "")),
            ].filter(Boolean))];
            const mappedUsers = me.level < 2
                ? scopedUsers
                : referencedUserIds.length ? await User.find({ _id: { $in: referencedUserIds } }).lean() : [];
            if (request.signal.aborted) return new Response(null, { status: 499 });
            const usersById = new Map([...users, ...mappedUsers].map((user) => [String(user._id), user]));
            const signupIds = new Set([...usersById.values()]
                .filter((user) => todayLogins.some((login) =>
                    String(login.userId) === String(user._id) &&
                    new Date(login.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }) === new Date(user.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
                ))
                .map((user) => String(user._id)));
            const repeatLoginIds = todayLoginIds.filter((id) => !signupIds.has(id));
            const winnerIds = new Set(todayResults.filter((row) => row.outcome === "win" && row.winAmount > 0 && row.userId).map((row) => String(row.userId)));
            const repeatWinnerIds = repeatLoginIds.filter((id) => winnerIds.has(id));
            let completedResults = results.filter((row) => row.outcome !== "pending");
            if (metric === "repeat-players" && rangeStart && todayResults.length) {
                const selectedIds = [...new Set(todayResults.map((row) => String(row.userId ?? "")).filter(Boolean))];
                const previous = await GameResult.find({
                    userId: { $in: selectedIds },
                    createdAt: { $lt: rangeStart },
                    outcome: { $ne: "pending" },
                }).lean();
                completedResults = [...completedResults, ...previous];
            }
            if (request.signal.aborted) return new Response(null, { status: 499 });
            const todayPlayerIds = [...new Set(todayResults.map((row) => String(row.userId ?? "")).filter(Boolean))];
            const previousPlayerIds = rangeStart
                ? new Set(completedResults.filter((row) => !isInRange(row.createdAt)).map((row) => String(row.userId ?? "")).filter(Boolean))
                : new Set([...completedResults.reduce((counts, row) => {
                    const id = String(row.userId ?? "");
                    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
                    return counts;
                }, new Map<string, number>())].filter(([, count]) => count > 1).map(([id]) => id));
            const repeatPlayerIds = todayPlayerIds.filter((id) => previousPlayerIds.has(id));
            const repeatEarners = repeatWinnerIds;
            const userMap = usersById;

            const dateText = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : "";
            const personName = (id: string | null | undefined) => id ? userMap.get(String(id))?.name ?? "Unknown player" : "—";
            const personPhone = (id: string | null | undefined) => id ? userMap.get(String(id))?.phone ?? "—" : "—";
            const transactionRows = (rows: typeof transactions) => rows.map((row) => ({
                date: dateText(row.createdAt), user: personName(row.userId), phone: personPhone(row.userId),
                type: row.type, provider: row.provider, amount: Number(row.amount ?? 0), status: row.status,
                reference: row.referenceId ?? "—",
            }));
            const resultRows = (rows: typeof results) => rows.map((row) => ({
                date: dateText(row.createdAt), user: personName(row.userId), phone: personPhone(row.userId),
                game: gameMap.get(String(row.gameId))?.name ?? "Unknown game", round: row.roundNo ?? "—",
                bet: Number(row.betAmount ?? 0), payout: Number(row.winAmount ?? 0),
                profit: Number(row.betAmount ?? 0) - Number(row.winAmount ?? 0), outcome: row.outcome,
            }));
            const userRows = (rows: typeof users) => rows.map((user) => ({
                user: user.name, phone: user.phone, role: user.role, balance: Number(user.balance ?? 0),
                status: user.isActive === false ? "Blocked" : "Active", registered: dateText(user.createdAt),
                lastLogin: dateText(user.lastLoginAt),
            }));
            const loginRows = (ids: string[]) => ids.map((id) => {
                const events = todayLogins.filter((login) => String(login.userId) === id);
                const user = userMap.get(id);
                return {
                    user: user?.name ?? "Unknown player", phone: user?.phone ?? "—", role: user?.role ?? "—",
                    logins: events.length, lastLogin: dateText(events[0]?.createdAt),
                    playerType: signupIds.has(id) ? "New player" : "Repeat player",
                    wonToday: winnerIds.has(id) ? "Yes" : "No",
                };
            });
            const resultUserRows = (ids: string[]) => ids.map((id) => {
                const user = userMap.get(id);
                const plays = todayResults.filter((row) => String(row.userId) === id);
                return {
                    user: user?.name ?? "Unknown player", phone: user?.phone ?? "—",
                    todayRounds: plays.length, bets: plays.reduce((sum, row) => sum + Number(row.betAmount ?? 0), 0),
                    payouts: plays.reduce((sum, row) => sum + Number(row.winAmount ?? 0), 0),
                    registered: dateText(user?.createdAt),
                };
            });
            const accountRows = (rows: typeof transactions) => transactionRows(rows);
            const allResultsTotalBet = results.reduce((sum, row) => sum + Number(row.betAmount ?? 0), 0);
            const allResultsTotalPayout = results.reduce((sum, row) => sum + Number(row.winAmount ?? 0), 0);
            const allTodayBet = todayResults.reduce((sum, row) => sum + Number(row.betAmount ?? 0), 0);
            const allTodayPayout = todayResults.reduce((sum, row) => sum + Number(row.winAmount ?? 0), 0);
            const allTodayDeposits = deposits;

            let title = "";
            let description = "";
            let rows: Record<string, string | number>[] = [];
            let summaries: { label: string; value: string | number }[] = [];
            let columns: { key: string; label: string }[] = [];

            switch (metric) {
                case "total-users":
                    title = "All Users";
                    description = `Client and agent accounts registered in ${rangeLabel.toLowerCase()}, within your admin access.`;
                    rows = userRows(users);
                    summaries = [{ label: "Users in range", value: users.length }, { label: "Active", value: users.filter((user) => user.isActive !== false).length }, { label: "Blocked", value: users.filter((user) => user.isActive === false).length }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "balance", label: "Wallet" }, { key: "status", label: "Status" }, { key: "registered", label: "Registered" }, { key: "lastLogin", label: "Last login" }];
                    break;
                case "today-payments":
                    title = `Approved Deposits — ${rangeLabel}`;
                    description = `Successful player deposits received in ${rangeLabel.toLowerCase()}.`;
                    rows = transactionRows(allTodayDeposits);
                    summaries = [{ label: "Deposits", value: allTodayDeposits.length }, { label: "Received", value: allTodayDeposits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }, { label: "Period", value: rangeLabel }];
                    columns = [{ key: "date", label: "Time" }, { key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount" }, { key: "reference", label: "Reference" }];
                    break;
                case "today-earnings":
                    title = `Game Earnings — ${rangeLabel}`;
                    description = `Completed game rounds with bet, payout and house result for ${rangeLabel.toLowerCase()}.`;
                    rows = resultRows(todayResults);
                    summaries = [{ label: "Rounds", value: todayResults.length }, { label: "Bets", value: allTodayBet }, { label: "Payouts", value: allTodayPayout }, { label: "Net earned", value: allTodayBet - allTodayPayout }];
                    columns = [{ key: "date", label: "Time" }, { key: "user", label: "User" }, { key: "game", label: "Game" }, { key: "round", label: "Round" }, { key: "bet", label: "Bet" }, { key: "payout", label: "Payout" }, { key: "profit", label: "House" }, { key: "outcome", label: "Result" }];
                    break;
                case "repeat-players":
                    title = `Repeat Players — ${rangeLabel}`;
                    description = `Players who played in ${rangeLabel.toLowerCase()} and also have a previous completed game round.`;
                    rows = resultUserRows(repeatPlayerIds);
                    summaries = [{ label: "Repeat players", value: repeatPlayerIds.length }, { label: "Players in range", value: todayPlayerIds.length }, { label: "Rounds in range", value: todayResults.length }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "registered", label: "Registered" }, { key: "todayRounds", label: "Rounds today" }, { key: "bets", label: "Bets today" }, { key: "payouts", label: "Payouts today" }];
                    break;
                case "today-logins":
                    title = `Logins — ${rangeLabel}`;
                    description = `Unique players with a recorded login in ${rangeLabel.toLowerCase()}.`;
                    rows = loginRows(todayLoginIds);
                    summaries = [{ label: "Unique players", value: todayLoginIds.length }, { label: "Login events", value: todayLogins.length }, { label: "Repeat logins", value: repeatLoginIds.length }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "logins", label: "Events" }, { key: "lastLogin", label: "Last login" }, { key: "playerType", label: "Player type" }];
                    break;
                case "login-earners":
                    title = `Login Earners — ${rangeLabel}`;
                    description = `Players who logged in in ${rangeLabel.toLowerCase()} and had a winning game result in the same period.`;
                    rows = loginRows(todayLoginIds.filter((id) => winnerIds.has(id)));
                    summaries = [{ label: "Winning users", value: winnerIds.size }, { label: "Logged-in users", value: todayLoginIds.length }, { label: "Earner rate", value: `${todayLoginIds.length ? (winnerIds.size / todayLoginIds.length * 100).toFixed(1) : "0.0"}%` }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "logins", label: "Login events" }, { key: "lastLogin", label: "Last login" }, { key: "wonToday", label: "Won today" }];
                    break;
                case "repeat-earners":
                    title = `Repeat Login Earners — ${rangeLabel}`;
                    description = `Returning players who logged in and won in ${rangeLabel.toLowerCase()}.`;
                    rows = loginRows(repeatEarners);
                    summaries = [{ label: "Repeat earners", value: repeatEarners.length }, { label: "Repeat logins", value: repeatLoginIds.length }, { label: "Earner rate", value: `${repeatLoginIds.length ? (repeatEarners.length / repeatLoginIds.length * 100).toFixed(1) : "0.0"}%` }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "logins", label: "Login events" }, { key: "lastLogin", label: "Last login" }, { key: "wonToday", label: "Won today" }];
                    break;
                case "total-deposits":
                    title = `Approved Deposits — ${rangeLabel}`;
                    description = `Approved deposit records and player payment references for ${rangeLabel.toLowerCase()}.`;
                    rows = accountRows(deposits);
                    summaries = [{ label: "Transactions", value: deposits.length }, { label: "Total amount", value: deposits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }, { label: "Period", value: rangeLabel }];
                    columns = [{ key: "date", label: "Date" }, { key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount" }, { key: "reference", label: "Reference" }];
                    break;
                case "total-withdrawals":
                    title = `Approved Withdrawals — ${rangeLabel}`;
                    description = `Approved withdrawals sent to players in ${rangeLabel.toLowerCase()}.`;
                    rows = accountRows(withdrawals);
                    summaries = [{ label: "Transactions", value: withdrawals.length }, { label: "Total amount", value: withdrawals.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }, { label: "Pending", value: pendingRows.filter((row) => row.type === "withdraw").length }];
                    columns = [{ key: "date", label: "Date" }, { key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount" }, { key: "reference", label: "Reference" }];
                    break;
                case "net-cash":
                    title = `Net Cash Flow — ${rangeLabel}`;
                    description = `Approved deposits minus approved withdrawals for ${rangeLabel.toLowerCase()}.`;
                    rows = [...deposits, ...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((row) => ({
                        ...transactionRows([row])[0],
                        flow: row.type === "deposit" ? "Cash in" : "Cash out",
                    }));
                    summaries = [{ label: "Deposits", value: deposits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }, { label: "Withdrawals", value: withdrawals.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }, { label: "Net cash", value: deposits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) - withdrawals.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) }];
                    columns = [{ key: "date", label: "Date" }, { key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "flow", label: "Flow" }, { key: "amount", label: "Amount" }, { key: "provider", label: "Provider" }];
                    break;
                case "wallet-balance":
                    title = `Players' Wallet Balances — ${rangeLabel}`;
                    description = `Current wallet balance for clients and agents registered in ${rangeLabel.toLowerCase()}.`;
                    rows = userRows([...users].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0)));
                    summaries = [{ label: "Combined balance", value: users.reduce((sum, user) => sum + Number(user.balance ?? 0), 0) }, { label: "Accounts", value: users.length }, { label: "Active payment accounts", value: (await PaymentAccount.find({ isActive: true, ...(me.level < 2 ? { ownerId: me.id } : {}) }).lean()).length }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "balance", label: "Wallet balance" }, { key: "status", label: "Status" }];
                    break;
                case "pending-requests":
                    title = `Pending Requests — ${rangeLabel}`;
                    description = `Deposit and withdrawal requests created in ${rangeLabel.toLowerCase()} that are still waiting for a decision.`;
                    rows = transactionRows(pendingRows);
                    summaries = [{ label: "All pending", value: pendingRows.length }, { label: "Deposits", value: pendingRows.filter((row) => row.type === "deposit").length }, { label: "Withdrawals", value: pendingRows.filter((row) => row.type === "withdraw").length }];
                    columns = [{ key: "date", label: "Date" }, { key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "type", label: "Type" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount" }, { key: "reference", label: "Reference" }];
                    break;
                case "house-profit":
                case "game-rounds":
                case "total-bets":
                case "total-payouts":
                    title = metric === "house-profit" ? "Game House Profit" : metric === "game-rounds" ? "All Game Rounds" : metric === "total-bets" ? "All Bets" : "All Payouts";
                    description = `Game round records with the player's stake, payout and result for ${rangeLabel.toLowerCase()}.`;
                    rows = resultRows(results);
                    summaries = [{ label: "Rounds", value: results.length }, { label: "Total bets", value: allResultsTotalBet }, { label: "Total payouts", value: allResultsTotalPayout }, { label: "House profit", value: allResultsTotalBet - allResultsTotalPayout }];
                    columns = [{ key: "date", label: "Date" }, { key: "user", label: "User" }, { key: "game", label: "Game" }, { key: "round", label: "Round" }, { key: "bet", label: "Bet" }, { key: "payout", label: "Payout" }, { key: "profit", label: "House" }, { key: "outcome", label: "Result" }];
                    break;
                case "agents":
                    title = `Agents — ${rangeLabel}`;
                    description = `Agent accounts registered in ${rangeLabel.toLowerCase()}, within your team or platform scope.`;
                    rows = userRows(users.filter((user) => user.role === "agent"));
                    summaries = [{ label: "Agents", value: rows.length }, { label: "Active", value: users.filter((user) => user.role === "agent" && user.isActive !== false).length }, { label: "Blocked", value: users.filter((user) => user.role === "agent" && user.isActive === false).length }];
                    columns = [{ key: "user", label: "Agent" }, { key: "phone", label: "Phone" }, { key: "balance", label: "Wallet" }, { key: "status", label: "Status" }, { key: "registered", label: "Registered" }, { key: "lastLogin", label: "Last login" }];
                    break;
                case "support-chats": {
                    title = "Open Support Chats";
                    description = `Open conversations last updated in ${rangeLabel.toLowerCase()}.`;
                    const openThreads = threads.filter((thread) => thread.status === "open");
                    rows = openThreads.map((thread) => ({
                        user: thread.userId ? personName(thread.userId) : thread.guestName ?? "Guest",
                        phone: thread.userId ? personPhone(thread.userId) : "Guest",
                        lastMessage: thread.lastMessage ?? "—", lastMessageAt: dateText(thread.lastMessageAt),
                        unread: Number(thread.unreadForAdmin ?? 0), assigned: thread.assignedName ?? "Unassigned",
                        status: Number(thread.unreadForAdmin ?? 0) > 0 ? "Unread" : "Open",
                    }));
                    summaries = [{ label: "Open chats", value: openThreads.length }, { label: "Unread", value: openThreads.filter((thread) => thread.unreadForAdmin > 0).length }, { label: "Assigned", value: openThreads.filter((thread) => !!thread.assignedTo).length }];
                    columns = [{ key: "user", label: "User" }, { key: "phone", label: "Phone" }, { key: "lastMessage", label: "Latest message" }, { key: "lastMessageAt", label: "Updated" }, { key: "assigned", label: "Assigned to" }, { key: "status", label: "Status" }];
                    break;
                }
                default:
                    return NextResponse.json({ error: "Unknown dashboard metric." }, { status: 400 });
            }
            const totalRows = rows.length;
            const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
            return NextResponse.json({
                metric, title, description, period, rangeLabel, summaries, columns, rows: pageRows,
                page, pageSize, totalRows, hasMore: page * pageSize < totalRows,
            }, { headers: { "Cache-Control": "no-store" } });
        }

        if (view === "feedback") {
            const status = params.get("status");
            const teamIds = me.level < 2
                ? (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id)
                : null;
            const filter: Record<string, unknown> = status && ["new", "reviewed", "resolved"].includes(status) ? { status } : {};
            if (teamIds) filter.userId = { $in: teamIds };
            const direction = params.get("order") === "asc" ? 1 : -1;
            const [list, counts] = await Promise.all([
                Feedback.find(filter).sort({ createdAt: direction }).limit(300).lean(),
                Feedback.aggregate<{ _id: string; c: number }>([
                    ...(teamIds ? [{ $match: { userId: { $in: teamIds } } }] : []),
                    { $group: { _id: "$status", c: { $sum: 1 } } },
                ]),
            ]);
            return NextResponse.json({ list, counts }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "games") {
            const [catalog, gameRows, stats, blocked] = await Promise.all([
                getProviderCatalog(),
                Game.find({ slug: { $regex: /^gregmorn-[a-f0-9]{40}$/ } }).lean(),
                GameResult.aggregate<{ _id: string; c: number; bet: number; win: number }>([{ $group: { _id: "$gameId", c: { $sum: 1 }, bet: { $sum: "$betAmount" }, win: { $sum: "$winAmount" } } }]),
                User.aggregate<{ _id: string; c: number }>([{ $unwind: "$blockedGames" }, { $group: { _id: "$blockedGames", c: { $sum: 1 } } }]),
            ]);
            const gamesBySlug = new Map<string, typeof gameRows>();
            for (const game of gameRows) {
                const key = game.slug.trim().toLowerCase();
                if (!key) continue;
                const group = gamesBySlug.get(key) ?? [];
                group.push(game);
                gamesBySlug.set(key, group);
            }
            const statsByGameId = new Map(stats.map((stat) => [String(stat._id), stat]));
            const games = catalog.map((providerGame) => {
                const group = gamesBySlug.get(providerGame.slug) ?? [];
                const gameStats = group.reduce((total, game) => {
                    const stat = statsByGameId.get(String(game._id));
                    return { c: total.c + (stat?.c ?? 0), bet: total.bet + (stat?.bet ?? 0), win: total.win + (stat?.win ?? 0) };
                }, { c: 0, bet: 0, win: 0 });
                return {
                    _id: providerGame.slug,
                    slug: providerGame.slug,
                    name: providerGame.title,
                    category: providerGame.provider,
                    icon: "",
                    imageUrl: providerGame.imageUrl,
                    isActive: providerGame.isActive,
                    isHot: providerGame.isHot,
                    stats: gameStats,
                };
            });
            return NextResponse.json({ games, stats, blocked, level: me.level }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "settings") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            return NextResponse.json({ settings: await getSettings() }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "dashboard") {
            const now = new Date();
            const pktNow = new Date(now.getTime() + 5 * 3600000);
            const start = new Date(Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), pktNow.getUTCDate()) - 5 * 3600000);
            const end = new Date(start.getTime() + 86400000);
            const weekStart = new Date(start.getTime() - 6 * 86400000);
            const users = await User.find({
                role: { $in: ["client", "agent"] },
                ...(me.level < 2 ? { referredBy: me.id } : {}),
            }).sort({ createdAt: -1 }).lean();
            const teamIds = users.map((user) => user._id);
            const [transactions, results, logins, paymentAccounts, threads] = await Promise.all([
                Transaction.find(me.level < 2 ? { userId: { $in: teamIds } } : {}).lean(),
                GameResult.find(me.level < 2 ? { userId: { $in: teamIds } } : {}).sort({ createdAt: -1 }).lean(),
                LoginEvent.find({
                    createdAt: { $gte: weekStart, $lt: end },
                    role: { $in: ["client", "agent"] },
                    ...(me.level < 2 ? { userId: { $in: teamIds.map(String) } } : {}),
                }).lean(),
                PaymentAccount.find({ isActive: true, ...(me.level < 2 ? { ownerId: me.id } : {}) }, "_id").lean(),
                SupportThread.find(me.level < 2 ? { userId: { $in: teamIds.map(String) } } : {}).lean(),
            ]);
            const approved = transactions.filter((row) => row.status === "approved");
            const deposits = approved.filter((row) => row.type === "deposit");
            const withdrawals = approved.filter((row) => row.type === "withdraw");
            const pendingRows = transactions.filter((row) => row.status === "pending");
            const completedResults = results.filter((row) => row.outcome !== "pending");
            const todayResults = completedResults.filter((row) => new Date(row.createdAt) >= start && new Date(row.createdAt) < end);
            const previousResults = completedResults.filter((row) => new Date(row.createdAt) < start);
            const todayDeposits = deposits.filter((row) => new Date(row.createdAt) >= start && new Date(row.createdAt) < end);
            const todayUsers = users.filter((row) => new Date(row.createdAt) >= start && new Date(row.createdAt) < end);
            const earlierPlayerIds = new Set(previousResults.map((row) => String(row.userId)).filter(Boolean));
            const todayPlayerIds = [...new Set(todayResults.map((row) => String(row.userId)).filter(Boolean))];
            const repeatedIds = new Set(todayPlayerIds.filter((id) => earlierPlayerIds.has(id)));
            const userMap = new Map(users.map((user) => [String(user._id), user]));
            const repeatedPlayers = todayPlayerIds.filter((id) => repeatedIds.has(id)).map((id) => {
                const user = userMap.get(id);
                const latest = todayResults.find((row) => String(row.userId) === id);
                return user ? { id, name: user.name, phone: user.phone, registrationIp: user.registrationIp, registeredAt: user.createdAt, playedAt: latest?.createdAt ?? null } : null;
            }).filter(Boolean);
            const statsRows = Array.from({ length: 7 }, (_, offset) => {
                const day = new Date(start.getTime() - (6 - offset) * 86400000);
                const next = new Date(day.getTime() + 86400000);
                const dayLogins = logins.filter((row) => new Date(row.createdAt) >= day && new Date(row.createdAt) < next);
                const loginIds = [...new Set(dayLogins.map((row) => String(row.userId)))];
                const signupIds = new Set(users.filter((user) => new Date(user.createdAt) >= day && new Date(user.createdAt) < next).map((user) => String(user._id)));
                const repeatIds = loginIds.filter((id) => !signupIds.has(id));
                const dayResults = completedResults.filter((row) => new Date(row.createdAt) >= day && new Date(row.createdAt) < next);
                const winnerIds = new Set(dayResults.filter((row) => row.outcome === "win" && row.winAmount > 0 && row.userId).map((row) => String(row.userId)));
                const repeatWinnerIds = repeatIds.filter((id) => winnerIds.has(id));
                const bet = dayResults.reduce((sum, row) => sum + row.betAmount, 0);
                const payout = dayResults.reduce((sum, row) => sum + row.winAmount, 0);
                return { key: day.toISOString().slice(0, 10), date: day, logins: loginIds.length, repeats: repeatIds.length, repeatPct: loginIds.length ? (repeatIds.length / loginIds.length) * 100 : 0, winners: winnerIds.size, earningPct: loginIds.length ? (winnerIds.size / loginIds.length) * 100 : 0, repeatEarningPct: repeatIds.length ? (repeatWinnerIds.length / repeatIds.length) * 100 : 0, bet, payout, earned: bet - payout };
            });
            const gameIds = [...new Set(results.slice(0, 8).map((row) => String(row.gameId)))];
            const recentGames = gameIds.length ? await Game.find({ $or: [{ _id: { $in: gameIds } }, { slug: { $in: gameIds } }] }, "slug name icon").lean() : [];
            const gameMap = gameResultGameMap(recentGames);
            const recentResults = results.slice(0, 8).map((row) => ({ ...row, gameId: gameMap.get(String(row.gameId)) ?? null, userId: userMap.get(String(row.userId)) ? { name: userMap.get(String(row.userId))!.name } : null }));
            const recentUsers = users.slice(0, 6);
            const pendingUserIds = [...new Set(pendingRows.slice(0, 6).map((row) => String(row.userId)))];
            const pendingUsers = pendingUserIds.length ? await User.find({ _id: { $in: pendingUserIds } }, "name").lean() : [];
            const pendingUserMap = new Map(pendingUsers.map((user) => [String(user._id), { name: user.name }]));
            const pendingTx = pendingRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6).map((row) => ({ ...row, userId: pendingUserMap.get(String(row.userId)) ?? null }));
            const totalUsers = users.length;
            const sumBalance = users.reduce((sum, user) => sum + (user.balance ?? 0), 0);
            const betTotal = results.reduce((sum, row) => sum + row.betAmount, 0);
            const winTotal = results.reduce((sum, row) => sum + row.winAmount, 0);
            return NextResponse.json({
                me,
                totalUsers,
                todayUsers: todayUsers.length,
                totalDeposits: deposits.reduce((sum, row) => sum + row.amount, 0),
                totalWithdrawals: withdrawals.reduce((sum, row) => sum + row.amount, 0),
                pending: pendingRows.length,
                activeAccounts: paymentAccounts.length,
                balance: sumBalance,
                resultStats: { c: results.length, bet: betTotal, win: winTotal },
                todayDeposits,
                todayResults,
                todaySignups: todayUsers,
                repeatedPlayers,
                statsRows,
                agents: users.filter((user) => user.role === "agent").length,
                openChats: threads.filter((thread) => thread.status === "open").length,
                unreadChats: threads.filter((thread) => thread.unreadForAdmin > 0).length,
                recentResults, recentUsers, pendingTx,
            }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "account") return NextResponse.json({ me }, { headers: { "Cache-Control": "no-store" } });
        if (view === "user-game-restrictions") {
            const id = params.get("id");
            if (!id) return NextResponse.json({ error: "User ID required." }, { status: 400 });
            const user = await User.findById(id, "name username phone role referredBy blockedGames").lean();
            if (!user || isStaff(user.role)) return NextResponse.json({ error: "User not found." }, { status: 404 });
            const canOperate = me.level >= 2 || String(user.referredBy ?? "") === me.id;
            if (!canOperate) return NextResponse.json({ error: "User not found." }, { status: 404 });
            const games = (await getProviderCatalog()).map(game => ({
                slug: game.slug, name: game.title, icon: "", imageUrl: game.imageUrl,
            }));
            return NextResponse.json({
                user: { id: String(user._id), name: user.name, username: user.username, phone: user.phone },
                games,
                blockedGames: [...new Set(user.blockedGames ?? [])].filter(slug => games.some(game => game.slug === slug)),
                canOperate,
            }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "users") {
            const role = params.get("role");
            const filter: Record<string, unknown> = { role: { $nin: ["owner", "admin", "subadmin"] } };
            if (me.level < 2) filter.referredBy = me.id;
            if (role === "agent" || role === "client") filter.role = role;
            const q = params.get("q")?.trim();
            if (q) {
                const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
                filter.$or = [{ name: pattern }, { phone: pattern }, { username: pattern }, { referralCode: pattern }];
            }
            const direction = params.get("order") === "asc" ? 1 : -1;
            const users = await User.find(filter).sort({ name: direction, createdAt: direction === 1 ? -1 : 1 }).limit(500).lean();
            if (me.level < 2) {
                return NextResponse.json({ users: users.map(({ passwordPlain, withdrawPin, registrationIp, ...user }) => user), canSee: false, canOperate: true }, { headers: { "Cache-Control": "no-store" } });
            }
            return NextResponse.json({ users, canSee: true, canOperate: true }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "user") {
            const id = params.get("id");
            if (!id) return NextResponse.json({ error: "User ID required." }, { status: 400 });
            const user = await User.findById(id).lean();
            if (!user || isStaff(user.role)) return NextResponse.json({ error: "User not found." }, { status: 404 });
            const canOperate = me.level >= 2 || String(user.referredBy ?? "") === me.id;
            if (!canOperate) return NextResponse.json({ error: "User not found." }, { status: 404 });
            const [transactions, results, team, commissions, settings, referrer] = await Promise.all([
                Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
                GameResult.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
                User.find({ referredBy: user._id }).sort({ createdAt: -1 }).lean(),
                Commission.find({ beneficiaryId: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
                getSettings(),
                user.referredBy ? User.findById(user.referredBy, "name phone role").lean() : null,
            ]);
            const gameIds = [...new Set(results.map((result) => String(result.gameId)))];
            const sourceIds = [...new Set(commissions.map((commission) => String(commission.fromUserId)))];
            const [gameRows, sourceUsers] = await Promise.all([
                gameIds.length ? Game.find({ $or: [{ _id: { $in: gameIds } }, { slug: { $in: gameIds } }] }, "slug name icon").lean() : [],
                sourceIds.length ? User.find({ _id: { $in: sourceIds } }, "name").lean() : [],
            ]);
            const gameMap = gameResultGameMap(gameRows);
            const sourceMap = new Map(sourceUsers.map((source) => [String(source._id), { name: source.name }]));
            const safeUser = me.level >= 2 ? user : (({ passwordHash, passwordPlain, withdrawPin, registrationIp, lastLoginIp, historicalIps, ...visible }) => visible)(user);
            return NextResponse.json({
                user: safeUser, transactions,
                plays: results.map((result) => ({ ...result, gameId: gameMap.get(String(result.gameId)) ?? null })),
                team,
                commissions: commissions.map((commission) => ({ ...commission, fromUserId: sourceMap.get(String(commission.fromUserId)) ?? null })),
                settings, referrer, canSee: me.level >= 2, canOperate, canDelete: me.level >= 3,
            }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "records") {
            const teamIds = me.level < 2
                ? (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id)
                : null;
            const transactions = await Transaction.find(teamIds ? { userId: { $in: teamIds } } : {}).lean();
            const counts = new Map<string, { _id: { type: string; status: string }; c: number; s: number }>();
            const byProviderMap = new Map<string, { _id: { p: string; type: string }; s: number; c: number }>();
            const gatewayMap = new Map<string, { _id: string; s: number; c: number }>();
            const dailyMap = new Map<string, { _id: { d: string; type: string }; s: number; c: number }>();
            const depositorMap = new Map<string, { _id: string; s: number; c: number }>();
            for (const transaction of transactions) {
                const key = `${transaction.type}|${transaction.status}`;
                const grouped = counts.get(key) ?? { _id: { type: transaction.type, status: transaction.status }, c: 0, s: 0 };
                grouped.c++; grouped.s += transaction.amount; counts.set(key, grouped);
                if (transaction.status !== "approved") continue;
                const providerKey = `${transaction.provider}|${transaction.type}`;
                const provider = byProviderMap.get(providerKey) ?? { _id: { p: transaction.provider, type: transaction.type }, s: 0, c: 0 };
                provider.s += transaction.amount; provider.c++; byProviderMap.set(providerKey, provider);
                if (transaction.method === "gateway") {
                    const gw = gatewayMap.get(transaction.type) ?? { _id: transaction.type, s: 0, c: 0 };
                    gw.s += transaction.amount; gw.c++; gatewayMap.set(transaction.type, gw);
                }
                const pktDay = new Date(new Date(transaction.createdAt).getTime() + 5 * 3600000).toISOString().slice(0, 10);
                const dayKey = `${pktDay}|${transaction.type}`;
                const day = dailyMap.get(dayKey) ?? { _id: { d: pktDay, type: transaction.type }, s: 0, c: 0 };
                day.s += transaction.amount; day.c++; dailyMap.set(dayKey, day);
                if (transaction.type === "deposit") {
                    const depositor = depositorMap.get(String(transaction.userId)) ?? { _id: String(transaction.userId), s: 0, c: 0 };
                    depositor.s += transaction.amount; depositor.c++; depositorMap.set(String(transaction.userId), depositor);
                }
            }
            const daily = [...dailyMap.values()].sort((a, b) => b._id.d.localeCompare(a._id.d)).slice(0, 60);
            const topGroups = [...depositorMap.values()].sort((a, b) => b.s - a.s).slice(0, 10);
            const users = topGroups.length ? await User.find({ _id: { $in: topGroups.map((row) => row._id) } }, "name phone").lean() : [];
            const userMap = new Map(users.map((user) => [String(user._id), { name: user.name, phone: user.phone }]));
            const topDep = topGroups.map((row) => ({ ...row, user: userMap.has(row._id) ? [userMap.get(row._id)] : [] }));
            const playerRows = await User.find(teamIds ? { _id: { $in: teamIds } } : { role: { $in: ["client", "agent"] } }, "name phone createdAt referredBy").lean();
            const refIds = [...new Set(playerRows.flatMap((player) => player.referredBy ? [String(player.referredBy)] : []))];
            const refUsers = refIds.length ? await User.find({ _id: { $in: refIds } }, "name role").lean() : [];
            const refMap = new Map(refUsers.map((user) => [String(user._id), { name: user.name, role: user.role }]));
            const players = playerRows.map((player) => ({
                id: String(player._id), name: player.name, phone: player.phone, joinedAt: player.createdAt,
                referrer: player.referredBy ? refMap.get(String(player.referredBy)) ?? null : null,
            }));
            const deposits = transactions
                .filter((transaction) => transaction.type === "deposit" && transaction.status === "approved")
                .map((transaction) => ({ userId: String(transaction.userId), amount: transaction.amount, at: transaction.createdAt }));
            return NextResponse.json({ agg: [...counts.values()], daily, byProvider: [...byProviderMap.values()], gwAgg: [...gatewayMap.values()], topDep, players, deposits }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "agents") {
            const teamFilter = me.level < 2 ? { referredBy: me.id } : {};
            const [agents, referrals, totals, commissions] = await Promise.all([
                User.find({ role: "agent", ...teamFilter }).sort({ commissionEarned: -1 }).lean(),
                User.find(me.level < 2 ? { referredBy: me.id } : { referredBy: { $ne: null } }, "referredBy totalDeposited").lean(),
                Commission.aggregate<{ _id: string; s: number }>([
                    ...(me.level < 2 ? [{ $match: { beneficiaryId: me.id } }] : []),
                    { $group: { _id: "$kind", s: { $sum: "$amount" } } },
                ]),
                Commission.find(me.level < 2 ? { beneficiaryId: me.id } : {}).sort({ createdAt: -1 }).limit(40).lean(),
            ]);
            const referralStats = new Map<string, { _id: string; c: number; dep: number }>();
            for (const user of referrals) {
                const key = String(user.referredBy);
                const row = referralStats.get(key) ?? { _id: key, c: 0, dep: 0 };
                row.c += 1; row.dep += user.totalDeposited ?? 0; referralStats.set(key, row);
            }
            const refStats = [...referralStats.values()];
            const topReferrers = refStats.map((row) => row._id);
            const [topRef, parties] = await Promise.all([
                topReferrers.length ? User.find({ _id: { $in: topReferrers }, role: "client" }).sort({ commissionEarned: -1 }).limit(15).lean() : [],
                commissions.length ? User.find({ _id: { $in: [...new Set(commissions.flatMap((row) => [String(row.beneficiaryId), String(row.fromUserId)]))] } }, "name role").lean() : [],
            ]);
            const partyMap = new Map(parties.map((user) => [String(user._id), { name: user.name, role: user.role }]));
            const recent = commissions.map((row) => ({ ...row, beneficiaryId: partyMap.get(String(row.beneficiaryId)) ?? null, fromUserId: { name: partyMap.get(String(row.fromUserId))?.name ?? "-" } }));

            // Per sub-admin ledger: who they referred and each player's money flow.
            const subAdmins = await User.find(me.level < 2 ? { _id: me.id } : { role: "subadmin" }).sort({ createdAt: 1 }).lean();
            const subIds = subAdmins.map((sub) => String(sub._id));
            const team = subIds.length ? await User.find({ referredBy: { $in: subIds }, role: { $in: ["client", "agent"] } }, "name phone referredBy balance totalDeposited createdAt isActive").lean() : [];
            const teamIdList = team.map((player) => String(player._id));
            const teamTx = teamIdList.length ? await Transaction.find({ userId: { $in: teamIdList } }, "userId type status amount createdAt").lean() : [];
            const money = new Map<string, { dep: number; depC: number; wd: number; wdC: number; pend: number; firstDep: string | null }>();
            for (const tx of teamTx) {
                const row = money.get(String(tx.userId)) ?? { dep: 0, depC: 0, wd: 0, wdC: 0, pend: 0, firstDep: null };
                if (tx.status === "pending") row.pend++;
                if (tx.status === "approved") {
                    if (tx.type === "deposit") {
                        row.dep += tx.amount; row.depC++;
                        const at = new Date(tx.createdAt).toISOString();
                        if (!row.firstDep || at < row.firstDep) row.firstDep = at;
                    } else { row.wd += tx.amount; row.wdC++; }
                }
                money.set(String(tx.userId), row);
            }
            const teamRows = team.map((player) => ({
                id: String(player._id), name: player.name, phone: player.phone, subAdminId: String(player.referredBy), balance: player.balance ?? 0,
                isActive: player.isActive !== false, joinedAt: player.createdAt, ...(money.get(String(player._id)) ?? { dep: 0, depC: 0, wd: 0, wdC: 0, pend: 0, firstDep: null }),
            }));
            const subAdminRows = subAdmins.map((sub) => {
                const members = teamRows.filter((player) => player.subAdminId === String(sub._id));
                return {
                    id: String(sub._id), name: sub.name, phone: sub.phone, referralCode: sub.referralCode ?? null, balance: sub.balance ?? 0,
                    commissionEarned: sub.commissionEarned ?? 0, isActive: sub.isActive !== false, createdAt: sub.createdAt,
                    players: members.length, depositors: members.filter((player) => player.depC > 0).length,
                    deposits: members.reduce((s, player) => s + player.dep, 0), withdrawals: members.reduce((s, player) => s + player.wd, 0),
                    pending: members.reduce((s, player) => s + player.pend, 0),
                };
            });
            const unassigned = me.level >= 2 ? await User.countDocuments({ role: "client", referredBy: null }) : 0;
            return NextResponse.json({ agents, refStats, totals, recent, topRef, subAdmins: subAdminRows, team: teamRows, unassigned }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "help") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            await ensureHelp();
            const list = await (await import("@/models")).HelpArticle.find().sort({ category: 1, order: 1 }).lean();
            return NextResponse.json({ list }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "logs") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            const filter: Record<string, unknown> = me.level >= 3 ? {} : { actorRole: { $in: ["subadmin", "admin"] } };
            const q = params.get("q")?.trim();
            if (q) {
                const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const pattern = new RegExp(escaped, "i");
                filter.$or = [{ actorName: pattern }, { action: pattern }, { target: pattern }, { details: pattern }];
            }
            const direction = params.get("order") === "asc" ? 1 : -1;
            const logs = await AdminLog.find(filter).sort({ createdAt: direction }).limit(500).lean();
            return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "vipBetPoints") {
            const filter: Record<string, unknown> = { role: "client" };
            if (me.level < 2) filter.referredBy = me.id;
            const q = params.get("q")?.trim();
            if (q) {
                const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
                filter.$or = [{ name: pattern }, { phone: pattern }, { username: pattern }];
            }
            const direction = params.get("order") === "asc" ? 1 : -1;
            const users = await User.find(filter, "name phone username vipBetPoints createdAt").sort({ name: direction, createdAt: direction === 1 ? -1 : 1 }).limit(500).lean();
            return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "notifications") {
            if (me.level < 2) {
                const teamIds = (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id);
                const [list, total] = await Promise.all([
                    Notification.find({ audience: "user", userId: { $in: teamIds } }).sort({ createdAt: -1 }).limit(100).lean(),
                    Promise.resolve(teamIds.length),
                ]);
                return NextResponse.json({ list, total, level: me.level }, { headers: { "Cache-Control": "no-store" } });
            }
            const [list, total] = await Promise.all([
                Notification.find().sort({ createdAt: -1 }).limit(100).lean(),
                User.countDocuments({ role: { $nin: ["owner", "admin", "subadmin"] } }),
            ]);
            return NextResponse.json({ list, total, level: me.level }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "payments") {
            const accFilter = me.level >= 2 ? {} : { ownerId: me.id };
            const myAccounts = await PaymentAccount.find(accFilter, "_id").lean();
            const ids = myAccounts.map((account) => account._id);
            const teamIds = me.level < 2
                ? (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id)
                : null;
            const [accounts, stats] = await Promise.all([
                PaymentAccount.find(accFilter).sort({ createdAt: -1 }).lean(),
                Transaction.aggregate<{ _id: string | null; total: number; c: number }>([
                    { $match: { type: "deposit", status: "approved", ...(teamIds ? { userId: { $in: teamIds } } : me.level < 2 ? { paymentAccountId: { $in: ids } } : {}) } },
                    { $group: { _id: "$paymentAccountId", total: { $sum: "$amount" }, c: { $sum: 1 } } },
                ]),
            ]);
            return NextResponse.json({ accounts, stats, level: me.level }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "results") {
            const teamIds = me.level < 2
                ? (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id)
                : null;
            const [rows, games] = await Promise.all([
                GameResult.find(teamIds ? { userId: { $in: teamIds } } : {}).sort({ createdAt: -1 }).limit(500).lean(),
                Game.find().lean(),
            ]);
            const userIds = [...new Set(rows.flatMap((row) => row.userId ? [String(row.userId)] : []))];
            const gameMap = gameResultGameMap(games);
            const users = userIds.length ? await User.find({ _id: { $in: userIds } }, "name phone").lean() : [];
            const userMap = new Map(users.map((user) => [String(user._id), { name: user.name, phone: user.phone }]));
            const results = rows.map((row) => ({ ...row, gameId: gameMap.get(String(row.gameId)) ?? null, userId: row.userId ? userMap.get(String(row.userId)) ?? null : null }));
            return NextResponse.json({ rows: results, games }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "staff") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            const roles = me.level >= 3 ? ["admin", "subadmin"] : ["subadmin"];
            const [staff, chatStats, actStats] = await Promise.all([
                User.find({ role: { $in: roles } }).sort({ role: 1, createdAt: 1 }).lean(),
                SupportThread.aggregate<{ _id: string; c: number }>([{ $match: { assignedTo: { $ne: null } } }, { $group: { _id: "$assignedTo", c: { $sum: 1 } } }]),
                AdminLog.aggregate<{ _id: string; c: number; last: Date }>([{ $group: { _id: "$actorId", c: { $sum: 1 }, last: { $max: "$createdAt" } } }]),
            ]);
            return NextResponse.json({ staff, chatStats, actStats, me }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "vip") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            const [settings, dist] = await Promise.all([
                getSettings(),
                User.aggregate<{ _id: number; c: number }>([{ $match: { role: { $nin: ["owner", "admin", "subadmin"] } } }, { $group: { _id: "$vipLevel", c: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
            ]);
            return NextResponse.json({ levels: settings.vipLevels, dist }, { headers: { "Cache-Control": "no-store" } });
        }
        if (view === "leaderboard") {
            if (me.level < 2) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
            const settings = await getSettings();
            return NextResponse.json({ entries: (settings.leaderboard ?? []).slice(0, 3) }, { headers: { "Cache-Control": "no-store" } });
        }
        return NextResponse.json({ error: "Unknown admin data view." }, { status: 404 });
    } catch (error) {
        console.error("[admin data]", error);
        return NextResponse.json({ error: "Admin data load nahi ho raha." }, { status: 503 });
    }
}