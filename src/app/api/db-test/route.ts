import { NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/mysql";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const pool = await getMysqlPool();
        if (!pool) {
            return NextResponse.json({ error: "Pool is null, databaseUrl is probably missing in .env" }, { status: 500 });
        }
        
        // Try a simple query
        const [rows] = await pool.execute("SELECT 1 AS connected");
        
        return NextResponse.json({ 
            success: true, 
            message: "Database connection successful!", 
            result: rows 
        });
    } catch (error: any) {
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
