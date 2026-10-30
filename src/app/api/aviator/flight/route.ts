import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import type { AviatorRoundDoc } from "@/models";
import { getMysqlPool } from "@/lib/mysql";
import { getServerSessionUser } from "@/lib/serverAuth";
import { flightAnimationSnapshot } from "@/lib/aviatorFlight";
import { isTable, TABLES } from "@/lib/aviator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const table = params.get("table") ?? "aviator";
  const round = Number(params.get("round"));
  const key = params.get("key");
  const headers = { "Cache-Control": "no-store" };
  if (!isTable(table) || !Number.isSafeInteger(round) || round < 1
    || key !== null && !/^[a-zA-Z0-9-]{1,64}$/.test(key)) {
    return NextResponse.json({ error: "Invalid flight." }, { status: 400, headers });
  }
  try {
    const me = table === "aviator-x" ? await getServerSessionUser() : null;
    const room = table === "aviator" ? "aviator:shared:v2" : `aviator-x:${me?.id ?? "guest"}`;
    const pool = await getMysqlPool();
    if (!pool) throw new Error("Live flight requires MySQL.");
    // Use the primary key for live reads; still enforce the room and round scope.
    const [rows] = await pool.query<(RowDataPacket & { data: string | AviatorRoundDoc; now: number })[]>(
      `SELECT data, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS now FROM aviatorrounds WHERE ${key ? "id = ? AND " : ""}BINARY JSON_UNQUOTE(JSON_EXTRACT(data, '$.table')) = BINARY ? AND CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.roundNo')) AS UNSIGNED) = ? LIMIT 1`,
      key ? [key, room, round] : [room, round],
    );
    if (!rows[0]) return new NextResponse(null, { status: 204, headers });
    const document: AviatorRoundDoc = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    return NextResponse.json(flightAnimationSnapshot(document, Number(rows[0].now), TABLES[table].growth, TABLES[table].maxMult), { headers });
  } catch (error) {
    console.error("[aviator flight]", error);
    return NextResponse.json({ error: "Live flight update unavailable. Reconnecting." }, { status: 503, headers });
  }
}
