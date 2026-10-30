import { randomInt } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "@/lib/mysql";

let tableReady: Promise<void> | undefined;

export async function getPlayerDisplayId(userId: string): Promise<string> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL is required to assign player display IDs.");
  if (!tableReady) {
    tableReady = (async () => {
      await pool.execute(`
      CREATE TABLE IF NOT EXISTS player_display_ids (
        display_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL UNIQUE,
        random_id INT UNSIGNED NULL UNIQUE
      ) AUTO_INCREMENT = 1000000
      `);
      const [columns] = await pool.execute<RowDataPacket[]>(
        "SHOW COLUMNS FROM player_display_ids LIKE 'random_id'",
      );
      if (columns.length === 0) {
        try {
          await pool.execute("ALTER TABLE player_display_ids ADD COLUMN random_id INT UNSIGNED NULL UNIQUE");
        } catch (error) {
          // Another server may have added the column during initialization.
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ER_DUP_FIELDNAME") throw error;
        }
      }
    })().catch((error: unknown) => {
      tableReady = undefined;
      throw error;
    });
  }
  await tableReady;
  const readId = async () => (await pool.execute<(RowDataPacket & { random_id: number | null })[]>(
    "SELECT random_id FROM player_display_ids WHERE user_id = ?",
    [userId],
  ))[0];
  const existing = await readId();
  if (existing.length === 0) {
    // The unique user key also makes concurrent first requests share one permanent ID.
    await pool.execute(
      "INSERT INTO player_display_ids (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId],
    );
  }
  let id = existing[0]?.random_id;
  for (let attempt = 0; id == null && attempt < 20; attempt++) {
    try {
      await pool.execute(
        "UPDATE player_display_ids SET random_id = ? WHERE user_id = ? AND random_id IS NULL",
        [randomInt(1000000, 10000000), userId],
      );
    } catch (error) {
      // A collision with another player's ID requires a new random candidate.
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ER_DUP_ENTRY") throw error;
    }
    id = (await readId())[0]?.random_id;
  }
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1000000 || id > 9999999) {
    throw new Error("A unique seven-digit player display ID could not be assigned.");
  }
  return String(id);
}
