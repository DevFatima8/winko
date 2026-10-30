import "dotenv/config";
import mysql from "mysql2/promise";

const cfg = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: (process.env.MYSQL_SSL || "true").toLowerCase() !== "false" ? { rejectUnauthorized: false } : undefined,
};

const COLLECTIONS = [
    "users", "loginevents", "paymentaccounts", "transactions", "games", "gameresults",
    "aviatorrounds", "chickengames", "chickendashes", "plinkobets", "cardrounds", "cardbets",
    "settings", "notifications", "supportthreads", "supportmessages", "helparticles",
    "commissions", "adminlogs", "feedbacks", "gatewaysessions", "minesgames", "winholds",
];

const pool = mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 5, charset: "utf8mb4" });

try {
    const conn = await pool.getConnection();
    console.log("Connected to MySQL:", cfg.host, cfg.database);
    conn.release();

    for (const table of COLLECTIONS) {
        await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`${table}\` (
        id VARCHAR(64) PRIMARY KEY,
        data JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    }
    console.log("All tables ensured:", COLLECTIONS.length);

    for (const table of ["supportthreads", "supportmessages"]) {
        const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
        const columnNames = new Set(columns.map((column) => column.Field));
        const missing = ["id", "data", "created_at", "updated_at"].filter((column) => !columnNames.has(column));
        if (missing.length) throw new Error(`Missing ${table} column(s): ${missing.join(", ")}`);
        console.log(`${table} columns verified: id, data, created_at, updated_at`);
    }

    const [settingsRows] = await pool.query("SELECT data FROM `settings`");
    const settingsDocs = settingsRows.map((row) => typeof row.data === "string" ? JSON.parse(row.data || "{}") : row.data);
    const mainSettings = settingsDocs.find((doc) => doc.key === "main");
    console.log("Leaderboard storage status:", JSON.stringify({
        mainSettingsFound: Boolean(mainSettings),
        vipLevelCount: Array.isArray(mainSettings?.vipLevels) ? mainSettings.vipLevels.length : null,
        leaderboardEntryCount: Array.isArray(mainSettings?.leaderboard) ? mainSettings.leaderboard.length : null,
    }));

    const [rows] = await pool.query("SHOW TABLES");
    console.log("Tables in database:", rows.map((r) => Object.values(r)[0]));
} catch (e) {
    console.error("MYSQL TEST FAILED:", e && (e.stack || e.message || JSON.stringify(e)));
    console.error("code:", e?.code, "errno:", e?.errno, "sqlState:", e?.sqlState, "address:", e?.address, "port:", e?.port);
    process.exitCode = 1;
} finally {
    await pool.end();
}
