import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { ensureMysqlTable, getMysqlPool } from "./mysql";

export type MultiplayerTable = "users" | "devicesessions" | "notifications" | "paymentaccounts" | "transactions" | "games" | "gameresults" | "winholds" | "multiplayerrooms" | "multiplayerrequests" | "aviatorrounds" | "cardrounds" | "cardbets" | "chickengames" | "chickendashes" | "minesgames" | "plinkobets" | "dailypools" | "dailypoolentries" | "gregmornsessions" | "gregmorntransactions";
export type JsonDocument = { _id?: string } & object;
export type MultiplayerFilters = Record<string, string | number | boolean | null>;
export type MultiplayerSort = { field: string; direction: "asc" | "desc" };
export interface MultiplayerTransaction {
  now(): Promise<number>;
  playerUserId(displayId: string): Promise<string | null>;
  get<T extends JsonDocument>(table: MultiplayerTable, id: string, lock?: boolean): Promise<T | null>;
  put<T extends JsonDocument>(table: MultiplayerTable, id: string, document: T): Promise<void>;
  insert<T extends JsonDocument>(table: MultiplayerTable, id: string, document: T): Promise<void>;
  find<T extends JsonDocument>(table: MultiplayerTable, field: string, value: string, limit?: number): Promise<T[]>;
  findWhere<T extends JsonDocument>(table: MultiplayerTable, exactFilters: MultiplayerFilters, limit?: number, sort?: MultiplayerSort): Promise<T[]>;
  remove(table: MultiplayerTable, id: string): Promise<void>;
  page<T extends JsonDocument>(table: MultiplayerTable, exactFilters: MultiplayerFilters, afterId?: string): Promise<T[]>;
}
export interface MultiplayerStore {
  transact<T>(room: string, fn: (tx: MultiplayerTransaction) => Promise<T>): Promise<T>;
}
type DataRow = RowDataPacket & { data: string | object };
const parse = <T,>(row: DataRow): T => (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as T;
const allowedTables = new Set<MultiplayerTable>(["users", "devicesessions", "notifications", "paymentaccounts", "transactions", "games", "gameresults", "winholds", "multiplayerrooms", "multiplayerrequests", "aviatorrounds", "cardrounds", "cardbets", "chickengames", "chickendashes", "minesgames", "plinkobets", "dailypools", "dailypoolentries", "gregmornsessions", "gregmorntransactions"]);
function tableName(table: MultiplayerTable) {
  if (!allowedTables.has(table)) throw new Error("Unsupported multiplayer collection.");
  return `\`${table}\``;
}
function fieldPath(field: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(field)) throw new Error("Unsupported document field.");
  return `JSON_EXTRACT(data, '$.${field}')`;
}
function boundedLimit(limit: number) {
  if (!Number.isFinite(limit)) throw new Error("Invalid document query limit.");
  return Math.max(1, Math.min(1000, Math.floor(limit)));
}
function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return ("fatal" in error && error.fatal === true) ||
    ("code" in error && typeof error.code === "string" &&
      ["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"].includes(error.code));
}
async function readyConnection(pool: Pool): Promise<PoolConnection> {
  for (let attempt = 0; ; attempt++) {
    const connection = await pool.getConnection();
    try {
      await connection.ping();
      // No financial work has run yet, so a connection lost during BEGIN can be replaced safely.
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      return connection;
    } catch (error) {
      connection.destroy();
      if (attempt > 0 || !isConnectionError(error)) throw error;
      console.warn("[multiplayer store] Replacing unavailable database connection.");
    }
  }
}
function transaction(connection: PoolConnection): MultiplayerTransaction {
  return {
    async playerUserId(displayId) {
      if (!/^[1-9]\d{6}$/.test(displayId)) return null;
      const [rows] = await connection.query<(RowDataPacket & { user_id: string })[]>(
        "SELECT user_id FROM player_display_ids WHERE random_id = ? LIMIT 2",
        [Number(displayId)],
      );
      if (rows.length > 1) throw new Error("Player display ID mapping is ambiguous.");
      return rows[0]?.user_id ?? null;
    },
    async now() {
      const [rows] = await connection.query<(RowDataPacket & { now: number })[]>("SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS now");
      return Number(rows[0].now);
    },
    async get<T>(table: MultiplayerTable, id: string, lock = false) {
      const [rows] = await connection.query<DataRow[]>(`SELECT data FROM ${tableName(table)} WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
      return rows[0] ? parse<T>(rows[0]) : null;
    },
    async put(table, id, document) {
      await connection.execute(`INSERT INTO ${tableName(table)} (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`, [id, JSON.stringify(document)]);
    },
    async insert(table, id, document) {
      await connection.execute(`INSERT INTO ${tableName(table)} (id, data) VALUES (?, ?)`, [id, JSON.stringify(document)]);
    },
    async remove(table, id) {
      await connection.execute(`DELETE FROM ${tableName(table)} WHERE id = ?`, [id]);
    },
    async page<T>(table: MultiplayerTable, filters: MultiplayerFilters, afterId = "") {
      const values: (string | number | boolean | null)[] = [];
      const predicates = Object.entries(filters).map(([field, value]) => {
        if (value === null || typeof value !== "string") throw new Error("Pagination filters must be strings.");
        values.push(value);
        return `BINARY JSON_UNQUOTE(${fieldPath(field)}) = BINARY ?`;
      });
      values.push(afterId);
      const [rows] = await connection.query<DataRow[]>(`SELECT data FROM ${tableName(table)} WHERE ${[...predicates, "id > ?"].join(" AND ")} ORDER BY id ASC LIMIT 500`, values);
      return rows.map(row => parse<T>(row));
    },
    async find<T>(table: MultiplayerTable, field: string, value: string, limit = 100) {
      const bound = boundedLimit(limit);
      const [rows] = await connection.query<DataRow[]>(`SELECT data FROM ${tableName(table)} WHERE JSON_UNQUOTE(${fieldPath(field)}) = ? LIMIT ${bound}`, [value]);
      return rows.map(row => parse<T>(row));
    },
    async findWhere<T>(table: MultiplayerTable, exactFilters: MultiplayerFilters, limit = 100, sort?: MultiplayerSort) {
      if (!exactFilters || typeof exactFilters !== "object" || Array.isArray(exactFilters)) throw new Error("Invalid document filters.");
      const entries = Object.entries(exactFilters);
      if (entries.length > 32) throw new Error("Too many document filters.");
      const values: (string | number)[] = [];
      const predicates = entries.map(([field, value]) => {
        const path = fieldPath(field);
        if (value !== null && !["string", "number", "boolean"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid exact filter value.");
        // MariaDB compares extracted JSON strings differently from MySQL.
        // Compare typed scalar values instead of two JSON expressions.
        if (value === null) return `JSON_TYPE(${path}) = 'NULL'`;
        if (typeof value === "number") {
          values.push(value);
          return `(JSON_TYPE(${path}) IN ('INTEGER', 'DOUBLE', 'DECIMAL') AND CAST(JSON_UNQUOTE(${path}) AS DECIMAL(65,20)) = ?)`;
        }
        values.push(String(value));
        return `(JSON_TYPE(${path}) = '${typeof value === "boolean" ? "BOOLEAN" : "STRING"}' AND BINARY JSON_UNQUOTE(${path}) = BINARY ?)`;
      });
      if (sort && sort.direction !== "asc" && sort.direction !== "desc") throw new Error("Unsupported document sort direction.");
      const sortPath = sort ? fieldPath(sort.field) : null;
      const order = sort
        ? `CASE WHEN JSON_TYPE(${sortPath}) IN ('INTEGER', 'DOUBLE', 'DECIMAL') THEN CAST(JSON_UNQUOTE(${sortPath}) AS DECIMAL(65,20)) END ${sort.direction.toUpperCase()}, JSON_UNQUOTE(${sortPath}) ${sort.direction.toUpperCase()}, id ASC`
        : "id ASC";
      const [rows] = await connection.query<DataRow[]>(`SELECT data FROM ${tableName(table)}${predicates.length ? ` WHERE ${predicates.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ${boundedLimit(limit)}`, values);
      return rows.map(row => parse<T>(row));
    },
  };
}

/** The InnoDB room row is held until every financial write commits on this same connection. */
export const mysqlMultiplayerStore: MultiplayerStore = {
  async transact<T>(room: string, fn: (tx: MultiplayerTransaction) => Promise<T>): Promise<T> {
    if (!/^[a-z0-9:-]{1,64}$/.test(room)) throw new Error("Invalid room lock.");
    const pool = await getMysqlPool();
    if (!pool) throw new Error("Multiplayer requires the configured MySQL database.");
    // A hot-reloaded worker may retain a pool whose global initialization predates these tables.
    for (const table of ["multiplayerlocks", "multiplayerrooms", "multiplayerrequests", "dailypools", "dailypoolentries"]) {
      await ensureMysqlTable(table, true);
    }
    // Reconnect only before starting work; replaying a transaction could duplicate a payout.
    const connection = await readyConnection(pool);
    try {
      await connection.execute("INSERT INTO multiplayerlocks (id, data) VALUES (?, '{}') ON DUPLICATE KEY UPDATE id = VALUES(id)", [room]);
      await connection.query("SELECT id FROM multiplayerlocks WHERE id = ? FOR UPDATE", [room]);
      const result = await fn(transaction(connection));
      await connection.commit();
      return result;
    } catch (error) {
      if (isConnectionError(error)) {
        connection.destroy();
      } else {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          connection.destroy();
          console.error("[multiplayer store] Transaction rollback failed.", rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  },
};
