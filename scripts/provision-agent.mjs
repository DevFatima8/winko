import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
const host = process.env.MYSQL_HOST || process.env.DB_HOST || process.env.DATABASE_HOST;
const user = process.env.MYSQL_USER || process.env.DB_USER || process.env.DATABASE_USER;
const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || process.env.DATABASE_NAME;
if (!url && !(host && user && password && database)) throw new Error("Configure the deployment MySQL database first.");
const connection = await mysql.createConnection(url ? { uri: url } : {
  host, user, password, database,
  port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || process.env.DATABASE_PORT || 3306),
});
let locked = false;
try {
  const [lock] = await connection.execute("SELECT GET_LOCK('winkox-single-agent-provision', 10) AS acquired");
  if (Number(lock[0]?.acquired) !== 1) throw new Error("Agent provisioning is already running. Retry later.");
  locked = true;
  const [owners] = await connection.execute("SELECT id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.adminId')) AS loginId FROM users WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) = 'owner'");
  if (owners.length > 1) throw new Error("Multiple owner accounts already exist. No account was created or changed.");
  if (owners.length === 1) {
    console.log(`One top-level Agent/owner already exists (${owners[0].loginId ?? owners[0].id}). No second account created and no password changed.`);
  } else if (process.argv.includes("--check")) {
    console.log("No owner exists. Ready to create exactly one new Agent account. Existing staff and player data will be preserved.");
  } else {
    const username = (process.env.AGENT_USERNAME || "platformagent").trim().toLowerCase();
    const adminId = (process.env.AGENT_ADMIN_ID || "WX-SYS-0001").trim().toUpperCase();
    const initialPassword = process.env.AGENT_PASSWORD || randomBytes(18).toString("base64url");
    if (!/^[a-z][a-z0-9_]{3,39}$/.test(username)) throw new Error("AGENT_USERNAME must be 4-40 letters/digits/underscores, beginning with a letter.");
    if (!/^WX-SYS-\d{4}$/.test(adminId)) throw new Error("AGENT_ADMIN_ID must use WX-SYS-0001 format.");
    if (initialPassword.length < 12) throw new Error("AGENT_PASSWORD must be at least 12 characters.");
    const id = "platform-owner";
    const phone = "ADM-PLATFORM-OWNER";
    await connection.beginTransaction();
    const [conflicts] = await connection.execute(
      "SELECT id FROM users WHERE id = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.username')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.adminId')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) = ? FOR UPDATE",
      [id, username, adminId, phone],
    );
    if (conflicts.length) throw new Error("Agent login/ID conflicts with an existing account. No existing account was changed.");
    const now = new Date().toISOString();
    const account = {
      _id: id, name: "Agent", username, adminId, phone, role: "owner",
      passwordHash: `plain:${initialPassword}`, passwordPlain: null,
      email: null, withdrawPin: null, registrationIp: null, lastLoginIp: null,
      historicalIps: [], paymentDepositLimit: 0, createdBy: null, adminNote: "Single top-level Agent account",
      balance: 0, isActive: true, lastLoginAt: null, totalDeposited: 0, totalWithdrawn: 0,
      vipLevel: 0, vipBetPoints: 0, vipPointsWelcomePending: false, blockedGames: [],
      referralCode: null, referredBy: null, commissionEarned: 0, agentCommissionPct: null,
      createdAt: now, updatedAt: now,
    };
    await connection.execute("INSERT INTO users (id, data) VALUES (?, ?)", [id, JSON.stringify(account)]);
    await connection.commit();
    console.log(`Agent created.\nLogin ID: ${adminId}\nUsername: ${username}\nInitial password: ${initialPassword}\nChange it in Agent > My Account after login. This password is shown only on initial creation.`);
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  if (locked) await connection.execute("SELECT RELEASE_LOCK('winkox-single-agent-provision')");
  await connection.end();
}
