import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomInt, randomUUID } from "node:crypto";
import ts from "typescript";

export function createLegacyScene(userIds = ["alice", "bob"], { poolEnabled = false } = {}) {
  let now = 100000, readDelay = 0, wagerReadDelay = 0, failure = null, chain = Promise.resolve();
  const data = Object.fromEntries([
    "users", "games", "multiplayerrooms", "gameresults", "aviatorrounds", "cardrounds", "cardbets", "winholds", "multiplayerrequests", "dailypools", "dailypoolentries", "chickengames", "chickendashes",
  ].map((name) => [name, []]));
  for (const userId of userIds) data.users.push({
    _id: userId, name: userId[0].toUpperCase() + userId.slice(1), username: userId,
    balance: 1000, isActive: true, role: "client", blockedGames: [],
  });
  const changes = [];
  const clone = (value) => structuredClone(value);
  const compare = (value) => value instanceof Date ? +value : value;
  const checkFailure = (table) => {
    if (failure === table) { failure = null; throw new Error("Injected database failure"); }
  };
  const tx = {
    now: async () => now,
    async find(table, field, value, limit = 100) { return clone(data[table].filter(row => row[field] === value).slice(0, limit)); },
    async get(table, id) {
      if (table === "users") now += readDelay;
      return clone(data[table]?.find((row) => row._id === id) ?? null);
    },
    async findWhere(table, filter, limit = 100, sort) {
      if (table === "gameresults" && filter.roundNo !== undefined) now += wagerReadDelay;
      const rows = data[table].filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
      if (sort) rows.sort((a, b) => {
        const x = compare(a[sort.field]), y = compare(b[sort.field]);
        return (x > y ? 1 : x < y ? -1 : 0) * (sort.direction === "asc" ? 1 : -1);
      });
      return clone(rows.slice(0, limit));
    },
    async page(table, filter, afterId = "") {
      return clone(data[table].filter(row => row._id > afterId && Object.entries(filter).every(([key, value]) => row[key] === value)).sort((a, b) => a._id < b._id ? -1 : 1).slice(0, 500));
    },
    async put(table, id, document) {
      checkFailure(table);
      const index = data[table].findIndex((row) => row._id === id);
      if (table === "users") changes.push({ user: id, delta: Math.round((document.balance - data.users[index].balance) * 100) / 100 });
      const row = clone({ ...document, _id: id });
      if (index < 0) data[table].push(row); else data[table][index] = row;
    },
    async insert(table, id, document) {
      checkFailure(table);
      if (data[table].some((row) => row._id === id)) throw new Error("Duplicate document");
      data[table].push(clone({ ...document, _id: id }));
    },
    async remove(table, id) {
      checkFailure(table);
      const index = data[table].findIndex((row) => row._id === id);
      if (index >= 0) data[table].splice(index, 1);
    },
  };
  const store = {
    async transact(_room, fn) {
      const previous = chain;
      let release;
      chain = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = clone(data), count = changes.length;
      try { return await fn(tx); }
      catch (error) {
        for (const table of Object.keys(data)) data[table].splice(0, data[table].length, ...snapshot[table]);
        changes.splice(count);
        throw error;
      } finally { release(); }
    },
  };
  const modules = new Map();
  const clock = class extends Date {
    constructor(value) { super(value === undefined ? now : value); }
    static now() { return now; }
  };
  const math = Object.create(Math);
  math.random = () => .5;
  const componentModules = new Map();
  function loadComponent(path) {
    const absolute = resolve(path);
    if (componentModules.has(absolute)) return componentModules.get(absolute).exports;
    const module = { exports: {} };
    componentModules.set(absolute, module);
    const require = specifier => {
      if (specifier === "node:crypto") return { randomUUID, createHash, randomInt };
      if (specifier.startsWith("@/lib/")) return load(specifier.slice("@/lib/".length));
      if (specifier.startsWith("@/components/")) return loadComponent(`src\\${specifier.slice(2).replaceAll("/", "\\")}.ts`);
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        return loadComponent(resolve(dirname(absolute), `${specifier}.ts`));
      }
      throw new Error(`Unexpected component engine import ${specifier}`);
    };
    const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("require", "module", "exports", code)(require, module, module.exports);
    return module.exports;
  }
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const loaded = { exports: {} };
    modules.set(name, loaded);
    const require = (specifier) => {
      if (specifier === "@/models") return {
        oid: id => id,
        Game: { findOneAndUpdate: ({ slug }) => ({ lean: async () => ({ _id: slug }) }) },
      };
      if (specifier === "node:crypto") return { randomUUID, createHash, randomInt };
      if (specifier.startsWith("@/components/")) {
        return loadComponent(`src\\${specifier.slice(2).replaceAll("/", "\\")}.ts`);
      }
      if (specifier === "./mongo") return { dbConnect: async () => {} };
      if (specifier === "./gameAccess") return { checkGameAccess: async () => null };
      if (specifier === "./dailyPoolConfig") return { dailyPoolEnabled: () => poolEnabled };
      if (specifier === "./multiplayer-store") return { mysqlMultiplayerStore: store };
      if (specifier === "./winHold") return { heldPortion: (gross) => Math.round(gross * 2) / 100 };
      if (specifier.startsWith("./")) return load(specifier.slice(2));
      throw new Error(`Unexpected legacy table import ${specifier}`);
    };
    const code = ts.transpileModule(readFileSync(`src\\lib\\${name}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("require", "module", "exports", "Date", "Math", code)(require, loaded, loaded.exports, clock, math);
    if (name === "aviator") loaded.exports.generateCrashPoint = () => ({ crashPoint: 1.01, seed: "", hash: "" });
    return loaded.exports;
  }
  return {
    get multiplayer() { return load("multiplayer").createMultiplayerService(store); },
    flight: load("aviator"), cards: load("cards"), pool: load("dailyPool"), poolRules: load("dailyPoolRules"), get chicken() { return load("dailyPoolChicken"); }, get browser() { return load("dailyPoolBrowser"); }, get poolService() { return load("dailyPoolService"); }, get slot() { return load("slot777"); }, get limbo() { return load("limbo"); }, get plinko() { return load("plinko"); }, store, data, changes,
    get users() { return new Map(data.users.map((user) => [user._id, user])); },
    at(value) { now = value; },
    setPoolEnabled(value) { poolEnabled = value; },
    setReadDelay(value) { readDelay = value; },
    setWagerReadDelay(value) { wagerReadDelay = value; },
    failNext(table) { failure = table; },
    async rawCardRound(table) { await load("sharedLegacyTables").sharedCardState(null, table); return clone(data.cardrounds.at(-1)); },
  };
}
