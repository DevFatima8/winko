/** DB bootstrap layer. Production uses MySQL; development can use the in-memory fallback. */
import { ensureMysqlReady, isMysqlEnabled } from "./mysql";

let seeded: Promise<void> | null = null;
const allowLocalFallback = process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DB_FALLBACK === "true";

export async function dbConnect() {
  if (typeof window !== "undefined") throw new Error("Browser database access is disabled. Use a server API route.");
  if (!isMysqlEnabled() && !allowLocalFallback) throw new Error("MySQL is required. Configure MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD.");
  if (!seeded) seeded = import("./seed").then(async (m) => {
    try { await ensureMysqlReady(); } catch (error) { if (!allowLocalFallback) throw error; }
    await m.seedAll();
  }).catch((e) => { seeded = null; throw e; });
  await seeded;
}

export const mongoose = null;
