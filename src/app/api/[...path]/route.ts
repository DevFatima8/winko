import { NextResponse } from "next/server";
import * as aviator from "@/lib/aviator";
import * as chicken from "@/lib/chicken";
import * as dash from "@/lib/chickendash";
import * as plinko from "@/lib/plinko";
import * as limbo from "@/lib/limbo";
import * as mines from "@/lib/mines";
import * as slot from "@/lib/slot777";
import * as cards from "@/lib/cards";
import * as gateway from "@/lib/gateway";
import * as notifications from "@/lib/notifications";
import * as feedback from "@/lib/feedback";
import { getServerSessionUser } from "@/lib/serverAuth";
import { DAILY_POOL_VERSION } from "@/lib/dailyPoolRules";
import { startPoolChicken, actPoolChicken } from "@/lib/dailyPoolChicken";
import { dailyPoolEnabled } from "@/lib/dailyPoolConfig";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";

type Json = Record<string, unknown>;
const errorResponse = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function dispatch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const query = url.searchParams;
    const method = request.method.toUpperCase();
    let body: Json = {};
    if (method !== "GET" && method !== "DELETE") body = await request.json().catch(() => ({}));
    const me = await getServerSessionUser();
    const userId = me?.id ?? null;
    const requirePlayer = () => me?.role === "client";
    const response = (result: unknown) => NextResponse.json(result, {
        status: result && typeof result === "object" && "error" in result && !("failed" in result) ? 400 : 200,
    });

    try {
        const startsLocalBet = method === "POST" && (
            ["/api/aviator/bet", "/api/chicken/start", "/api/chickendash/start", "/api/plinko/drop", "/api/limbo", "/api/slot777", "/api/cards/bet"].includes(path) ||
            path === "/api/mines" && body.action === "start");
        if (!LOCAL_GAMES_CONNECTED && startsLocalBet) return errorResponse(LOCAL_GAMES_UNAVAILABLE, 403);
        if (method === "POST" && (["/api/chicken/start", "/api/chickendash/start", "/api/plinko/drop", "/api/limbo"].includes(path) || path === "/api/mines" && body.action === "start") && dailyPoolEnabled()) {
            if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
            if (body.poolRulesVersion !== DAILY_POOL_VERSION) return errorResponse("Read and accept the daily-pool rules before placing a new bet.", 400);
        }
        switch (true) {
            case path === "/api/aviator/state": {
                const table = query.get("table") ?? "aviator";
                return aviator.isTable(table) ? response(await aviator.getState(userId, table)) : errorResponse("Invalid table");
            }
            case path === "/api/aviator/stats" && method === "GET": {
                if (!me) return errorResponse("Login required.", 401);
                const table = query.get("table") ?? "aviator";
                if (!aviator.isTable(table)) return errorResponse("Invalid table");
                return NextResponse.json(await aviator.flightStatistics(table, me.role === "client" ? me.id : undefined), { headers: { "Cache-Control": "no-store" } });
            }
            case path === "/api/aviator/bet" && method === "POST": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const table = String(body.table ?? "aviator");
                return aviator.isTable(table) ? response(await aviator.placeBet(me!.id, table, Number(body.amount), Number(body.slot ?? 0), body.roundNo === undefined ? undefined : Number(body.roundNo), body.queueIfClosed === true, body.autoCashout === undefined ? undefined : typeof body.autoCashout === "number" ? body.autoCashout : NaN)) : errorResponse("Invalid table");
            }
            case path === "/api/aviator/bet" && method === "DELETE": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const table = query.get("table") ?? "aviator";
                return aviator.isTable(table) ? response(await aviator.cancelBet(me!.id, table, Number(query.get("slot") ?? 0), query.has("roundNo") ? Number(query.get("roundNo")) : undefined)) : errorResponse("Invalid table");
            }
            case path === "/api/aviator/cashout" && method === "POST": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const table = String(body.table ?? "aviator");
                return aviator.isTable(table) ? response(await aviator.cashOut(me!.id, table, Number(body.slot ?? 0), body.roundNo === undefined ? undefined : Number(body.roundNo))) : errorResponse("Invalid table");
            }
            case path === "/api/chicken/state": return response(await chicken.getState(userId));
            case path === "/api/chicken/start" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await startPoolChicken(me!.id, "chicken-road-2", Number(body.amount), String(body.difficulty)));
            case path === "/api/chicken/step" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await actPoolChicken(me!.id, "chicken-road-2", "step") ?? { error: "Koi active game nahi." });
            case path === "/api/chicken/cashout" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await actPoolChicken(me!.id, "chicken-road-2", "cashout") ?? { error: "Cash out ke liye kam az kam ek lane cross karein." });
            case path === "/api/chickendash/state": return response(await dash.getState(userId));
            case path === "/api/chickendash/start" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await startPoolChicken(me!.id, "chicken-dash", Number(body.amount), String(body.level ?? "")));
            case path === "/api/chickendash/step" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await actPoolChicken(me!.id, "chicken-dash", "step") ?? { error: "Koi active game nahi." });
            case path === "/api/chickendash/cashout" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await actPoolChicken(me!.id, "chicken-dash", "cashout") ?? { error: "Cash out ke liye kam az kam ek tile cross karein." });
            case path === "/api/plinko/state": return response(await plinko.getState(userId));
            case path === "/api/plinko/drop" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await plinko.drop(me!.id, Number(body.amount), String(body.risk ?? ""), Number(body.rows), String(body.requestId ?? "")));
            case path === "/api/limbo" && method === "GET": return response(await limbo.getState(userId));
            case path === "/api/limbo" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await limbo.play(me!.id, Number(body.amount), Number(body.target), String(body.requestId ?? "")));
            case path === "/api/mines" && method === "GET": return response(await mines.getState(userId));
            case path === "/api/mines" && method === "POST": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const action = String(body.action ?? "");
                return response(action === "start" ? await mines.start(me!.id, Number(body.amount), Number(body.mines))
                    : action === "reveal" ? await mines.reveal(me!.id, Number(body.cell))
                        : action === "cashout" ? await mines.cashOut(me!.id) : { error: "Invalid action" });
            }
            case path === "/api/slot777" && method === "GET": return response(await slot.getState(userId));
            case path === "/api/slot777" && method === "POST":
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                return response(await slot.spin(me!.id, Number(body.amount), String(body.requestId ?? "")));
            case path === "/api/cards/state": {
                const table = query.get("table") ?? "";
                return cards.isTable(table) ? response(await cards.getState(userId, table)) : errorResponse("Invalid table");
            }
            case path === "/api/cards/bet" && method === "POST": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const table = String(body.table ?? "");
                const targetRound = body.targetRound === undefined || body.targetRound === null ? undefined : Number(body.targetRound);
                return cards.isTable(table) ? response(await cards.placeBet(me!.id, table, String(body.option ?? ""), Number(body.amount), targetRound, typeof body.requestId === "string" ? body.requestId : undefined)) : errorResponse("Invalid table");
            }
            case path === "/api/cards/bet" && method === "DELETE": {
                if (!requirePlayer()) return errorResponse("Khelne ke liye Login / Register karein.", 401);
                const table = query.get("table") ?? "";
                const scope = query.get("scope") === "queued" ? "queued" : "current";
                const expectedRound = query.has("roundNo") ? Number(query.get("roundNo")) : undefined;
                return cards.isTable(table) ? response(await cards.cancelBets(me!.id, table, scope, expectedRound)) : errorResponse("Invalid table");
            }
            case path === "/api/gateway" && method === "GET": {
                if (!requirePlayer()) return errorResponse("Login required.", 401);
                const id = query.get("id");
                if (!id) {
                    const config = await gateway.gatewayConfig();
                    return response({ enabled: config.enabled, autoWithdraw: config.autoWithdraw, label: config.label, maxPerTxn: config.maxPerTxn, dailyLimit: config.dailyLimit, minDeposit: config.minDeposit, minWithdraw: config.minWithdraw });
                }
                const session = await gateway.getSession(me!.id, id);
                return session ? response(session) : errorResponse("Not found", 404);
            }
            case path === "/api/gateway" && method === "POST": {
                if (!requirePlayer()) return errorResponse("Login required.", 401);
                const action = String(body.action ?? "");
                const result = action === "create" ? await gateway.createSession(me!.id, body.kind === "withdraw" ? "withdraw" : "deposit", String(body.provider) as "jazzcash" | "easypaisa", Number(body.amount), String(body.accountNumber ?? "").replace(/\s|-/g, ""), body.pin ? String(body.pin) : undefined, body.holderName ? String(body.holderName) : "", body.proofImage ? String(body.proofImage) : "", body.referenceId ? String(body.referenceId) : "")
                    : action === "sendOtp" ? await gateway.sendOtp(me!.id, String(body.id))
                        : action === "verify" ? await gateway.verifyOtp(me!.id, String(body.id), String(body.otp ?? ""))
                            : action === "cancel" ? await gateway.cancelSession(me!.id, String(body.id))
                                : { error: "Invalid action" };
                return response(result);
            }
            case path === "/api/notifications" && method === "GET": return response(await notifications.getNotifications(userId, me?.dbRole ?? null));
            case path === "/api/notifications" && method === "POST":
                return me ? response(await notifications.markAllNotificationsRead(me.id)) : errorResponse("Unauthorized", 401);
            case path === "/api/feedback" && method === "POST": return response(await feedback.submitFeedback(body as Parameters<typeof feedback.submitFeedback>[0], me));
            default: return errorResponse("Not found: " + path, 404);
        }
    } catch (error) {
        console.error("[api dispatch]", error);
        return errorResponse("Request failed.", 500);
    }
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;