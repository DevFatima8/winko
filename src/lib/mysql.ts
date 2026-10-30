import mysql, { type Pool } from "mysql2/promise";
import type { EventEmitter } from "events";

export type MysqlConfig = {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
};

const COLLECTIONS = [
    "users",
    "loginevents",
    "devicesessions",
    "paymentaccounts",
    "transactions",
    "games",
    "gameresults",
    "aviatorrounds",
    "chickengames",
    "chickendashes",
    "plinkobets",
    "cardrounds",
    "cardbets",
    "settings",
    "notifications",
    "supportthreads",
    "supportmessages",
    "helparticles",
    "commissions",
    "adminlogs",
    "feedbacks",
    "gatewaysessions",
    "minesgames",
    "winholds",
    "multiplayerrooms",
    "multiplayerrequests",
    "multiplayerlocks",
    "dailypools",
    "dailypoolentries",
    "gregmornsessions",
    "gregmorntransactions",
];

// Ridexd-nextjs approach: Use single DATABASE_URL or fallback to individual vars
let databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
if (!databaseUrl) {
    const host = process.env.MYSQL_HOST || process.env.DB_HOST || process.env.DATABASE_HOST;
    const user = process.env.MYSQL_USER || process.env.DB_USER || process.env.DATABASE_USER;
    const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
    const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || process.env.DATABASE_NAME;
    const port = process.env.MYSQL_PORT || process.env.DB_PORT || process.env.DATABASE_PORT || "3306";
    if (host && user && password && database) {
        databaseUrl = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    }
}

const globalForDb = globalThis as typeof globalThis & {
  __winkoxMysqlPool?: Pool;
  __winkoxInitPromise?: Promise<boolean>;
};

// Exact Ridexd-nextjs pool creation
export const pool =
  globalForDb.__winkoxMysqlPool ??
  (databaseUrl ? mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 6,
    maxIdle: 6,
    idleTimeout: 540000,
    queueLimit: 0,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    connectTimeout: 20000,
  }) : null);

if (pool) {
  globalForDb.__winkoxMysqlPool = pool;
}

if (pool && !(pool as unknown as EventEmitter).listenerCount("error")) {
    (pool as unknown as EventEmitter).on("error", (err: Error) => {
        console.error("[mysql] pool error:", err.message);
    });
}

function tableName(name: string) {
    return `\`${name.replace(/`/g, "")}\``;
}

export function getMysqlConfig(): MysqlConfig | null {
    if (!databaseUrl) return null;
    return { host: "uri", port: 3306, user: "uri", password: "uri", database: "uri", ssl: false };
}

export function isMysqlEnabled(): boolean {
    return Boolean(pool);
}

const MYSQL_RETRY_DELAY = Number(process.env.MYSQL_RETRY_DELAY || 10000);
let initFailure: { error: unknown; retryAt: number } | null = null;
const initializedTables = new Set<string>();
const tableInitPromises = new Map<string, Promise<void>>();

function ensureTableExists(collection: string): Promise<void> {
    if (!pool) return Promise.reject(new Error("MySQL pool is unavailable."));
    if (initializedTables.has(collection)) return Promise.resolve();

    const existing = tableInitPromises.get(collection);
    if (existing) return existing;

    const promise = pool.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName(collection)} (
          id VARCHAR(64) PRIMARY KEY,
          data JSON NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => {
        initializedTables.add(collection);
    }).catch((error: unknown) => {
        tableInitPromises.delete(collection);
        throw error;
    });

    tableInitPromises.set(collection, promise);
    return promise;
}

const verifiedTables = new Set<string>();

export async function getMysqlPool(): Promise<Pool | null> {
    if (pool) {
        await ensureMysqlReady();
    }
    return pool;
}

export async function ensureMysqlReady(): Promise<boolean> {
    if (!pool) {
        throw new Error("DATABASE_URL is required (mysql://user:password@host:3306/database)");
    }

    if (globalForDb.__winkoxInitPromise) return globalForDb.__winkoxInitPromise;
    if (initFailure && Date.now() < initFailure.retryAt) throw initFailure.error;

    const promise = (async () => {
        try {
            const tablesToVerify = COLLECTIONS.filter((table) => !verifiedTables.has(table));
            await Promise.all(tablesToVerify.map(async (table) => {
                await pool.execute(`
          CREATE TABLE IF NOT EXISTS ${tableName(table)} (
            id VARCHAR(64) PRIMARY KEY,
            data JSON NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                verifiedTables.add(table);
            }));
        } catch (error) {
            initFailure = { error, retryAt: Date.now() + MYSQL_RETRY_DELAY };
            throw error;
        }
        initFailure = null;
        return true;
    })();

    globalForDb.__winkoxInitPromise = promise;
    try {
        return await promise;
    } catch (e) {
        globalForDb.__winkoxInitPromise = undefined;
        throw e;
    }
}

export async function ensureMysqlTable(collection: string, strict = false): Promise<void> {
    if (verifiedTables.has(collection)) return;
    const active = strict ? await ensureMysqlReady() : await ensureMysqlReady().catch(() => false);
    if (!active || !pool) {
        if (strict) throw new Error("MySQL pool is unavailable.");
        return;
    }
    if (!verifiedTables.has(collection)) {
        await pool.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName(collection)} (
          id VARCHAR(64) PRIMARY KEY,
          data JSON NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `).catch((err) => {
            if (strict) throw err;
            console.warn(`[mysql] ensure table ${collection} warning:`, err.message);
      });
        verifiedTables.add(collection);
    }
}
