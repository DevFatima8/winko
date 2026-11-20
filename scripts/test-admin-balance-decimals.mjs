import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture(initialBalance = 1000, actor = { level: 1, dbRole: "subadmin" }) {
  const player = { role: "client", phone: "fixture", balance: initialBalance, referredBy: "staff" };
  let collisions = 0;
  let notifications = 0;
  const user = {
    findById: async () => ({ ...player }),
    updateOneAtomic: async (filter, update) => {
      if (collisions > 0) { collisions--; player.balance += 1; return { matchedCount: 0 }; }
      if (filter.balance !== player.balance || filter.role !== player.role || (filter.referredBy && filter.referredBy !== player.referredBy)) return { matchedCount: 0 };
      Object.assign(player, update.$set);
      return { matchedCount: 1 };
    },
  };
  const imports = {
    "next/cache": { revalidatePath() {} },
    "@/models": { User: user, AdminLog: { create: async () => {} }, oid: String },
    "./auth": { isStaff: role => ["owner", "admin", "subadmin"].includes(role) },
    "./serverAuth": { getServerSessionUser: async () => ({ id: "staff", role: "admin", ...actor, name: "Staff" }) },
    "./platform": {}, "./notifications": { notifyUser: async () => { notifications++; } }, "./cloudinary": {}, "./siteGameCatalog": {},
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\lib\\actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  const adjust = async (amount, direction) => {
    const form = new FormData();
    form.set("id", "player"); form.set("amount", amount); form.set("direction", direction);
    return module.exports.adjustUserBalanceAction(undefined, form);
  };
  return { player, adjust, collide: () => { collisions = 1; }, notifications: () => notifications };
}

test("admin adds and removes exact paisa without floating point drift", async () => {
  const f = fixture();
  assert.ok((await f.adjust("400.87", "add")).success);
  assert.equal(f.player.balance, 1400.87);
  assert.ok((await f.adjust("400.87", "remove")).success);
  assert.equal(f.player.balance, 1000);
  assert.ok((await f.adjust("0.01", "remove")).success);
  assert.equal(f.player.balance, 999.99);
});

test("admin rejects excess precision, invalid amounts and overdrafts", async () => {
  const f = fixture(10);
  for (const value of ["0", "-1", "1.001", "1e2", "999999999999999999"]) assert.ok((await f.adjust(value, "add")).error);
  assert.match((await f.adjust("10.01", "remove")).error, /zyada/);
  assert.equal(f.player.balance, 10);
});

test("admin adjustment retries a concurrent balance change without overwriting it", async () => {
  const f = fixture(100);
  f.collide();
  assert.ok((await f.adjust("0.87", "add")).success);
  assert.equal(f.player.balance, 101.87);
});

test("admin adjustment accepts harmless legacy floating-point noise but not fractional paisa", async () => {
  const f = fixture(0.1 + 0.2);
  assert.ok((await f.adjust("0.01", "add")).success);
  assert.equal(f.player.balance, 0.31);
  f.player.balance = 1.005;
  assert.match((await f.adjust("1", "add")).error, /invalid/);
  assert.equal(f.player.balance, 1.005);
});

test("super-admin balance adjustments do not notify players while sub-admin adjustments still do", async () => {
  const superAdmin = fixture(1000, { level: 2, dbRole: "admin" });
  assert.ok((await superAdmin.adjust("10", "add")).success);
  assert.equal(superAdmin.notifications(), 0);

  const subAdmin = fixture();
  assert.ok((await subAdmin.adjust("10", "add")).success);
  assert.equal(subAdmin.notifications(), 1);
});
