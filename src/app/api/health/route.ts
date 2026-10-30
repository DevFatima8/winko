import { NextResponse } from "next/server";
import { getMysqlConfig, getMysqlPool, isMysqlEnabled } from "@/lib/mysql";

export const dynamic = "force-dynamic";

export async function GET() {
    const config = getMysqlConfig();
    if (!isMysqlEnabled() || !config) {
        return NextResponse.json({ status: "error", mode: "mysql", error: "MySQL environment variables are missing" }, { status: 503 });
    }

    try {
        const pool = await getMysqlPool();
        if (!pool) throw new Error("MySQL pool was not created");
        await pool.query("SELECT 1");
        return NextResponse.json({ status: "ok", mode: "mysql", database: config.database, host: config.host });
    } catch (error) {
        return NextResponse.json({ status: "error", mode: "mysql", error: error instanceof Error ? error.message : "MySQL connection failed" }, { status: 503 });
    }
}
