import { NextResponse } from "next/server";
import { verifyGregmornSignature } from "@/lib/gregmorn";
import { GregmornWalletError, gregmornCallbackRoom, processGregmornWalletCallback, type GregmornCallbackBody } from "@/lib/gregmornWallet";
import { mysqlMultiplayerStore } from "@/lib/multiplayer-store";

export const dynamic = "force-dynamic";

function failure(login: string, duration: number, error: string, status = 400, balance = 0) {
  return NextResponse.json({
    balance,
    currency: process.env.GREGMORN_CURRENCY ?? "PKR",
    duration,
    error,
    login,
    status: "fail",
  }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) return failure("", Date.now() - startedAt, "request too large");
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 16_384) return failure("", Date.now() - startedAt, "request too large");
  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return failure("", Date.now() - startedAt, "invalid json"); }
  const login = body && typeof body === "object" && "login" in body && typeof body.login === "string" ? body.login : "";

  let validSignature = false;
  try { validSignature = verifyGregmornSignature(rawBody, request.headers.get("x-signature")); }
  catch (error) {
    console.error("[gregmorn wallet config]", error);
    return failure(login, Date.now() - startedAt, "wallet integration unavailable", 503);
  }
  if (!validSignature) return failure(login, Date.now() - startedAt, "invalid signature");
  if (!body || typeof body !== "object" || !("cmd" in body) ||
      !["getBalance", "writeBet", "rollback"].includes(String(body.cmd)) ||
      !("login" in body) || typeof body.login !== "string" ||
      (body.cmd !== "getBalance" && (!("sessionid" in body) || typeof body.sessionid !== "string")) ||
      ("sessionid" in body && body.sessionid !== null && body.sessionid !== undefined && typeof body.sessionid !== "string")) {
    return failure(login, Date.now() - startedAt, "invalid callback request");
  }

  const callback = {
    ...body,
    sessionid: "sessionid" in body && typeof body.sessionid === "string" ? body.sessionid : "",
  } as GregmornCallbackBody;
  try {
    const room = callback.sessionid ? gregmornCallbackRoom(callback.sessionid) : gregmornCallbackRoom(`balance:${login}`);
    const result = await mysqlMultiplayerStore.transact(room, tx =>
      processGregmornWalletCallback(tx, callback));
    return NextResponse.json({
      balance: result.balance,
      currency: result.currency,
      duration: Date.now() - startedAt,
      error: "",
      login,
      status: "success",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof GregmornWalletError)) console.error("[gregmorn wallet callback]", error);
    return failure(login, Date.now() - startedAt,
      error instanceof GregmornWalletError ? error.message : "wallet transaction failed",
      error instanceof GregmornWalletError ? 400 : 503,
      error instanceof GregmornWalletError ? error.balance ?? 0 : 0);
  }
}
