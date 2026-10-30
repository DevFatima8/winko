import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { isStaff } from "@/lib/auth";
import { getMysqlPool } from "@/lib/mysql";
import { getServerSessionUser } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || !isStaff(me.dbRole) || me.level < 1) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    const pool = await getMysqlPool();
    if (!pool) throw new Error("MySQL unavailable.");
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.type')) AS type, COUNT(*) AS count
       FROM transactions t
       WHERE JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.status')) = 'pending'
       AND JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.type')) IN ('deposit', 'withdraw')
       ${me.level < 2 ? `AND JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.userId')) IN (
         SELECT u.id FROM users u
         WHERE JSON_UNQUOTE(JSON_EXTRACT(u.data, '$.referredBy')) = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(u.data, '$.role')) IN ('client', 'agent')
       )` : ""}
       GROUP BY JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.type'))`,
      me.level < 2 ? [me.id] : [],
    );
    const counts = { deposits: 0, withdrawals: 0 };
    for (const row of rows) {
      if (row.type === "deposit") counts.deposits = Number(row.count);
      if (row.type === "withdraw") counts.withdrawals = Number(row.count);
    }
    return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin pending payments]", error);
    return NextResponse.json({ error: "Pending payment counts load nahi ho sake." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
