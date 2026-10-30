/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LocalDB — a tiny MongoDB/Mongoose-compatible document store persisted in the browser's
 * localStorage. Supports the query/update/aggregate subset used by this app so the same
 * game engines & admin logic run without a server database. Swap back to MongoDB later by
 * re-pointing `@/models` to real Mongoose models.
 */
export type ObjectId = string;
type AnyDoc = Record<string, any> & { _id: string; createdAt?: Date; updatedAt?: Date };
type DB = Record<string, AnyDoc[]>;

const KEY = "winxkox_db_v1";
const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

let memory: DB = {};
let cachedRaw: string | null = null;
let cachedDb: DB | null = null;

function revive(_k: string, v: any) { return typeof v === "string" && ISO.test(v) ? new Date(v) : v; }
function load(): DB {
  if (!isBrowser()) return memory;
  const raw = localStorage.getItem(KEY);
  if (raw === null) { cachedRaw = null; cachedDb = {}; return cachedDb; }
  if (raw === cachedRaw && cachedDb) return cachedDb;
  try { cachedDb = JSON.parse(raw, revive) as DB; } catch { cachedDb = {}; }
  cachedRaw = raw;
  return cachedDb;
}
function persist(db: DB) {
  if (!isBrowser()) { memory = db; return; }
  const raw = JSON.stringify(db);
  try { localStorage.setItem(KEY, raw); } catch { /* quota */ }
  cachedRaw = raw; cachedDb = db;
  try { window.dispatchEvent(new CustomEvent("wx:db")); } catch { }
}
export function resetLocalDb() { if (isBrowser()) localStorage.removeItem(KEY); memory = {}; cachedRaw = null; cachedDb = null; }
export function exportLocalDb() { return JSON.stringify(load()); }
export function importLocalDb(json: string) { persist(JSON.parse(json, revive)); }

let counter = 0;
export function newId(): string {
  const t = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const r = Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  counter = (counter + 1) % 0xffffff;
  return t + r + counter.toString(16).padStart(6, "0");
}

/* ---------------- helpers ---------------- */
const clone = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v), revive));
export function getPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  if (!path.includes(".")) return obj[path];
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj: any, path: string, val: any) {
  const parts = path.split("."); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== "object") o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = val;
}
const isObj = (v: any) => v !== null && typeof v === "object" && !(v instanceof Date) && !(v instanceof RegExp) && !Array.isArray(v);
const prim = (v: any) => (v instanceof Date ? v.getTime() : v);
function eqv(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date || b instanceof Date) return prim(a) === prim(b);
  if (Array.isArray(a)) return a.some((x) => eqv(x, b));
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}
function cmp(a: any, b: any) {
  const x = prim(a), y = prim(b);
  if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
}
function matchValue(actual: any, cond: any): boolean {
  if (cond instanceof RegExp) return typeof actual === "string" && cond.test(actual);
  if (isObj(cond) && Object.keys(cond).some((k) => k.startsWith("$"))) {
    return Object.entries(cond).every(([op, v]) => {
      switch (op) {
        case "$in": return (v as any[]).some((x) => eqv(actual, x));
        case "$nin": return !(v as any[]).some((x) => eqv(actual, x));
        case "$ne": return !eqv(actual, v);
        case "$eq": return eqv(actual, v);
        case "$gt": return actual != null && cmp(actual, v) > 0;
        case "$gte": return actual != null && cmp(actual, v) >= 0;
        case "$lt": return actual != null && cmp(actual, v) < 0;
        case "$lte": return actual != null && cmp(actual, v) <= 0;
        case "$exists": return (actual !== undefined) === !!v;
        case "$type": return v === "number" ? typeof actual === "number" : v === "string" ? typeof actual === "string" : true;
        case "$regex": return typeof actual === "string" && new RegExp(v as string).test(actual);
        case "$size": return Array.isArray(actual) && actual.length === v;
        default: return true;
      }
    });
  }
  return eqv(actual, cond);
}
export function matches(doc: any, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return (v as any[]).some((f) => matches(doc, f));
    if (k === "$and") return (v as any[]).every((f) => matches(doc, f));
    if (k === "$nor") return !(v as any[]).some((f) => matches(doc, f));
    return matchValue(getPath(doc, k), v);
  });
}
function sortDocs(docs: any[], spec: Record<string, 1 | -1>) {
  const keys = Object.entries(spec);
  return [...docs].sort((a, b) => { for (const [k, d] of keys) { const c = cmp(getPath(a, k), getPath(b, k)); if (c) return c * d; } return 0; });
}
function applyUpdate(doc: any, update: any, inserting = false) {
  for (const [op, val] of Object.entries(update ?? {})) {
    if (op === "$set") for (const [k, v] of Object.entries(val as any)) setPath(doc, k, v);
    else if (op === "$setOnInsert") { if (inserting) for (const [k, v] of Object.entries(val as any)) setPath(doc, k, v); }
    else if (op === "$inc") for (const [k, v] of Object.entries(val as any)) setPath(doc, k, (Number(getPath(doc, k)) || 0) + Number(v));
    else if (op === "$push") for (const [k, v] of Object.entries(val as any)) { const arr = getPath(doc, k) ?? []; setPath(doc, k, [...arr, v]); }
    else if (op === "$addToSet") for (const [k, v] of Object.entries(val as any)) { const arr = getPath(doc, k) ?? []; if (!arr.some((x: any) => eqv(x, v))) setPath(doc, k, [...arr, v]); }
    else if (op === "$pull") for (const [k, v] of Object.entries(val as any)) { const arr = getPath(doc, k) ?? []; setPath(doc, k, arr.filter((x: any) => !matchValue(x, v))); }
    else if (op === "$unset") for (const k of Object.keys(val as any)) setPath(doc, k, undefined);
    else if (!op.startsWith("$")) setPath(doc, op, val);
  }
  doc.updatedAt = new Date();
}
/* aggregate expressions */
function evalExpr(expr: any, doc: any): any {
  if (typeof expr === "string" && expr.startsWith("$")) return getPath(doc, expr.slice(1));
  if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc));
  if (isObj(expr)) {
    const keys = Object.keys(expr);
    if (keys.length === 1 && keys[0].startsWith("$")) {
      const op = keys[0], a = expr[op];
      switch (op) {
        case "$cond": { const [i, t, e] = Array.isArray(a) ? a : [a.if, a.then, a.else]; return evalExpr(i, doc) ? evalExpr(t, doc) : evalExpr(e, doc); }
        case "$eq": return eqv(evalExpr(a[0], doc), evalExpr(a[1], doc));
        case "$ne": return !eqv(evalExpr(a[0], doc), evalExpr(a[1], doc));
        case "$gt": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) > 0;
        case "$gte": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) >= 0;
        case "$lt": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) < 0;
        case "$ifNull": { const v = evalExpr(a[0], doc); return v == null ? evalExpr(a[1], doc) : v; }
        case "$add": return (a as any[]).reduce((s, e) => s + (Number(evalExpr(e, doc)) || 0), 0);
        case "$subtract": return (Number(evalExpr(a[0], doc)) || 0) - (Number(evalExpr(a[1], doc)) || 0);
        case "$multiply": return (a as any[]).reduce((s, e) => s * (Number(evalExpr(e, doc)) || 0), 1);
        case "$dateToString": {
          const d = evalExpr(a.date, doc); if (!d) return null;
          const dt = new Date(d); const tz = String(a.timezone ?? "+00:00"); const m = tz.match(/([+-])(\d{2}):(\d{2})/);
          const off = m ? (m[1] === "-" ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3])) : 0;
          const local = new Date(dt.getTime() + off * 60000);
          const Y = local.getUTCFullYear(), M = String(local.getUTCMonth() + 1).padStart(2, "0"), D = String(local.getUTCDate()).padStart(2, "0");
          return String(a.format ?? "%Y-%m-%d").replace("%Y", String(Y)).replace("%m", M).replace("%d", D);
        }
        default: return undefined;
      }
    }
    const out: any = {}; for (const k of keys) out[k] = evalExpr(expr[k], doc); return out;
  }
  return expr;
}

/* ---------------- Query (thenable, chainable) ---------------- */
type PopSpec = { path: string; select?: string };
type Pop<R, P> = R extends (infer E)[] ? (Omit<E, keyof P> & P)[] : R extends null ? null : Omit<NonNullable<R>, keyof P> & P | Extract<R, null>;

export class Query<R> implements PromiseLike<R> {
  private _sort?: Record<string, 1 | -1>; private _limit?: number; private _pops: PopSpec[] = []; private _lean = false;
  constructor(private model: Model<any>, private exec: (q: Query<R>) => any, private single: boolean) { }
  sort(spec: Record<string, 1 | -1>) { this._sort = spec; return this; }
  limit(n: number) { this._limit = n; return this; }
  select(_s?: string) { return this; }
  lean<T = R>(): Query<T> { this._lean = true; return this as unknown as Query<T>; }
  populate<P = Record<string, unknown>>(path: string | PopSpec[], select?: string): Query<Pop<R, P>> {
    if (Array.isArray(path)) this._pops.push(...path); else this._pops.push({ path, select });
    return this as unknown as Query<Pop<R, P>>;
  }
  get opts() { return { sort: this._sort, limit: this._limit, pops: this._pops, lean: this._lean, single: this.single }; }
  then<A = R, B = never>(onOk?: ((v: R) => A | PromiseLike<A>) | null, onErr?: ((e: any) => B | PromiseLike<B>) | null): Promise<A | B> {
    return new Promise<R>((res, rej) => { try { res(this.exec(this)); } catch (e) { rej(e); } }).then(onOk ?? undefined, onErr ?? undefined);
  }
  catch<B = never>(onErr: (e: any) => B | PromiseLike<B>) { return this.then(undefined, onErr); }
}

/* ---------------- Model ---------------- */
export type ModelOptions<T> = { collection: string; defaults?: () => Partial<T>; refs?: Record<string, string>; unique?: string[][]; cap?: number };
const registry: Record<string, Model<any>> = {};

export type Doc<T> = T & { save: () => Promise<T>; toObject: () => T };

export class Model<T extends { _id: string }> {
  constructor(public name: string, public o: ModelOptions<T>) { registry[name] = this; registry[o.collection] = this; }
  private coll(db: DB) { return (db[this.o.collection] ??= []); }
  private wrap(doc: any, lean: boolean) {
    const c = clone(doc);
    if (lean) return c;
    const self = this;
    Object.defineProperty(c, "save", { enumerable: false, value: async function () { const db = load(); const arr = self.coll(db); const i = arr.findIndex((d) => d._id === c._id); const plain = JSON.parse(JSON.stringify(c), revive); plain.updatedAt = new Date(); if (i >= 0) arr[i] = plain; else arr.push(plain); persist(db); return c; } });
    Object.defineProperty(c, "toObject", { enumerable: false, value: function () { return clone(JSON.parse(JSON.stringify(c), revive)); } });
    return c;
  }
  private populateDocs(docs: any[], pops: PopSpec[]) {
    if (!pops.length) return docs;
    const db = load();
    for (const p of pops) {
      const refName = this.o.refs?.[p.path]; const ref = refName ? registry[refName] : undefined;
      for (const d of docs) { const id = getPath(d, p.path); if (id == null) continue; const found = ref ? ref.coll(db).find((x) => String(x._id) === String(id)) : undefined; setPath(d, p.path, found ? clone(found) : null); }
    }
    return docs;
  }
  private run(filter: any, q: Query<any>) {
    const { sort, limit, pops, lean, single } = q.opts;
    let docs = this.coll(load()).filter((d) => matches(d, filter));
    if (sort) docs = sortDocs(docs, sort);
    if (single) docs = docs.slice(0, 1); else if (limit != null) docs = docs.slice(0, limit);
    const out = this.populateDocs(docs.map((d) => this.wrap(d, lean)), pops);
    return single ? (out[0] ?? null) : out;
  }
  private checkUnique(db: DB, doc: any, excludeId?: string) {
    for (const keys of this.o.unique ?? []) {
      const dup = this.coll(db).find((d) => d._id !== excludeId && keys.every((k) => eqv(getPath(d, k), getPath(doc, k)) && getPath(doc, k) != null));
      if (dup) { const e: any = new Error(`E11000 duplicate key error collection: ${this.o.collection} keys: ${keys.join(",")}`); e.code = 11000; throw e; }
    }
  }
  private fresh(data: any): AnyDoc {
    const now = new Date();
    const d: any = { ...(this.o.defaults?.() ?? {}), ...JSON.parse(JSON.stringify(data ?? {}), revive) };
    d._id = d._id ? String(d._id) : newId(); d.createdAt = d.createdAt ?? now; d.updatedAt = now;
    return d;
  }
  private capColl(db: DB) { const cap = this.o.cap; const arr = this.coll(db); if (cap && arr.length > cap) { arr.sort((a, b) => cmp(a.createdAt, b.createdAt)); arr.splice(0, arr.length - cap); } }

  find(filter: any = {}, _proj?: any): Query<Doc<T>[]> { return new Query<Doc<T>[]>(this, (q) => this.run(filter, q), false); }
  findOne(filter: any = {}, _proj?: any): Query<Doc<T> | null> { return new Query<Doc<T> | null>(this, (q) => this.run(filter, q), true); }
  findById(id: any, _proj?: any): Query<Doc<T> | null> { return this.findOne({ _id: String(id) }); }
  async exists(filter: any) { const d = this.coll(load()).find((x) => matches(x, filter)); return d ? { _id: d._id } : null; }
  async countDocuments(filter: any = {}) { return this.coll(load()).filter((d) => matches(d, filter)).length; }
  async create(data: Partial<T>): Promise<T & { save: () => Promise<T>; toObject: () => T }> {
    const db = load(); const d = this.fresh(data); this.checkUnique(db, d); this.coll(db).push(d); this.capColl(db); persist(db);
    return this.wrap(d, false);
  }
  async insertMany(list: Partial<T>[]) { const db = load(); const out = list.map((x) => { const d = this.fresh(x); this.checkUnique(db, d); this.coll(db).push(d); return d; }); persist(db); return out.map((d) => this.wrap(d, false)); }
  async updateOne(filter: any, update: any, opts: { upsert?: boolean } = {}) {
    const db = load(); const arr = this.coll(db); const i = arr.findIndex((d) => matches(d, filter));
    if (i < 0) { if (opts.upsert) { const base: any = {}; for (const [k, v] of Object.entries(filter ?? {})) if (!k.startsWith("$") && !isObj(v)) setPath(base, k, v); const d = this.fresh(base); applyUpdate(d, update, true); this.checkUnique(db, d); arr.push(d); persist(db); return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: d._id }; } return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }; }
    applyUpdate(arr[i], update); this.checkUnique(db, arr[i], arr[i]._id); persist(db); return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }
  async updateMany(filter: any, update: any) { const db = load(); let n = 0; for (const d of this.coll(db)) if (matches(d, filter)) { applyUpdate(d, update); n++; } if (n) persist(db); return { matchedCount: n, modifiedCount: n }; }
  async deleteOne(filter: any) { const db = load(); const arr = this.coll(db); const i = arr.findIndex((d) => matches(d, filter)); if (i >= 0) { arr.splice(i, 1); persist(db); return { deletedCount: 1 }; } return { deletedCount: 0 }; }
  async deleteMany(filter: any) { const db = load(); const arr = this.coll(db); const keep = arr.filter((d) => !matches(d, filter)); const n = arr.length - keep.length; db[this.o.collection] = keep; if (n) persist(db); return { deletedCount: n }; }
  findOneAndUpdate(filter: any, update: any, opts: { upsert?: boolean; returnDocument?: "after" | "before"; new?: boolean } = {}): Query<Doc<T> | null> {
    return new Query<Doc<T> | null>(this, (q) => {
      const db = load(); const arr = this.coll(db); let i = arr.findIndex((d) => matches(d, filter));
      if (i < 0) {
        if (!opts.upsert) return null;
        const base: any = {}; for (const [k, v] of Object.entries(filter ?? {})) if (!k.startsWith("$") && !isObj(v)) setPath(base, k, v);
        const d = this.fresh(base); applyUpdate(d, update, true); this.checkUnique(db, d); arr.push(d); i = arr.length - 1;
      } else { const before = clone(arr[i]); applyUpdate(arr[i], update); if (opts.returnDocument === "before" || opts.new === false) { persist(db); return this.populateDocs([this.wrap(before, q.opts.lean)], q.opts.pops)[0]; } }
      persist(db);
      return this.populateDocs([this.wrap(arr[i], q.opts.lean)], q.opts.pops)[0];
    }, true);
  }
  findOneAndDelete(filter: any): Query<Doc<T> | null> {
    return new Query<Doc<T> | null>(this, (q) => { const db = load(); const arr = this.coll(db); const i = arr.findIndex((d) => matches(d, filter)); if (i < 0) return null; const [d] = arr.splice(i, 1); persist(db); return this.wrap(d, q.opts.lean); }, true);
  }
  async bulkWrite(ops: any[]) { const db = load(); const arr = this.coll(db); for (const op of ops) { if (op.updateOne) { const d = arr.find((x) => matches(x, op.updateOne.filter)); if (d) applyUpdate(d, op.updateOne.update); } if (op.deleteOne) { const i = arr.findIndex((x) => matches(x, op.deleteOne.filter)); if (i >= 0) arr.splice(i, 1); } } persist(db); return { ok: 1 }; }
  async aggregate<R = any>(pipeline: any[]): Promise<R[]> {
    const db = load(); let docs: any[] = this.coll(db).map((d) => clone(d));
    for (const stage of pipeline) {
      const [op] = Object.keys(stage); const arg = stage[op];
      if (op === "$match") docs = docs.filter((d) => matches(d, arg));
      else if (op === "$sort") docs = sortDocs(docs, arg);
      else if (op === "$limit") docs = docs.slice(0, arg);
      else if (op === "$skip") docs = docs.slice(arg);
      else if (op === "$unwind") { const path = String(typeof arg === "string" ? arg : arg.path).slice(1); docs = docs.flatMap((d) => { const arr = getPath(d, path); return Array.isArray(arr) ? arr.map((v) => { const c = clone(d); setPath(c, path, v); return c; }) : []; }); }
      else if (op === "$lookup") { const from = registry[arg.from]; const src = from ? from.coll(db) : []; docs = docs.map((d) => ({ ...d, [arg.as]: src.filter((s) => eqv(getPath(s, arg.foreignField), getPath(d, arg.localField))).map((s) => clone(s)) })); }
      else if (op === "$project") docs = docs.map((d) => { const out: any = { _id: d._id }; for (const [k, v] of Object.entries(arg)) { if (v === 0) { delete out[k]; continue; } out[k] = v === 1 ? getPath(d, k) : evalExpr(v, d); } return out; });
      else if (op === "$group") {
        const groups = new Map<string, any>();
        for (const d of docs) {
          const idVal = arg._id == null ? null : evalExpr(arg._id, d); const key = JSON.stringify(idVal ?? null);
          let g = groups.get(key); if (!g) { g = { _id: idVal ?? null, __n: 0 }; groups.set(key, g); }
          g.__n++;
          for (const [field, acc] of Object.entries(arg)) {
            if (field === "_id") continue; const [aop] = Object.keys(acc as any); const aexpr = (acc as any)[aop]; const v = evalExpr(aexpr, d);
            switch (aop) {
              case "$sum": g[field] = (g[field] ?? 0) + (typeof aexpr === "number" ? aexpr : Number(v) || 0); break;
              case "$addToSet": g[field] ??= []; if (!g[field].some((x: any) => eqv(x, v))) g[field].push(v); break;
              case "$push": (g[field] ??= []).push(v); break;
              case "$max": if (g[field] == null || cmp(v, g[field]) > 0) g[field] = v; break;
              case "$min": if (g[field] == null || cmp(v, g[field]) < 0) g[field] = v; break;
              case "$first": if (!(field in g)) g[field] = v; break;
              case "$last": g[field] = v; break;
              case "$avg": g[`__avg_${field}`] = (g[`__avg_${field}`] ?? 0) + (Number(v) || 0); g[field] = g[`__avg_${field}`] / g.__n; break;
            }
          }
        }
        docs = Array.from(groups.values()).map((g) => { const { __n, ...rest } = g; void __n; for (const k of Object.keys(rest)) if (k.startsWith("__avg_")) delete rest[k]; return rest; });
      }
    }
    return docs as R[];
  }
}

/** subscribe to changes (same tab + other tabs) */
export function onDbChange(fn: () => void) {
  if (!isBrowser()) return () => { };
  const h = () => fn();
  window.addEventListener("wx:db", h); window.addEventListener("storage", h);
  return () => { window.removeEventListener("wx:db", h); window.removeEventListener("storage", h); };
}
