import * as LocalDb from "@/lib/localdb";
import type { RowDataPacket } from "mysql2";
import { ensureMysqlReady, ensureMysqlTable, getMysqlPool, isMysqlEnabled } from "@/lib/mysql";

const { getPath, matches, newId, setPath, Model: LocalModel } = LocalDb;

const allowLocalFallback = process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DB_FALLBACK === "true";

const TRANSIENT = new Set(["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"]);
async function withDbRetry<R>(fn: () => Promise<R>, tries = 3): Promise<R> {
    let last: any;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); } catch (e: any) {
            last = e;
            if (e?.code === "ER_USER_LIMIT_REACHED" || (!TRANSIENT.has(e?.code) && !e?.fatal)) break;
            await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        }
    }
    throw last;
}

export type ModelOptions<T> = {
    collection: string;
    defaults?: () => Partial<T>;
    refs?: Record<string, string>;
    unique?: string[][];
    cap?: number;
};

type PopSpec = { path: string; select?: string };
export type ObjectId = string;
type Populated<R, P> = R extends Array<infer I> ? Array<Omit<I, keyof P> & P> : R extends object ? Omit<R, keyof P> & P : R;

type AnyValue = Record<string, any> | string | number | boolean | null | undefined;

const clone = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

const isObj = (v: any) => v !== null && typeof v === "object" && !(v instanceof Date) && !(v instanceof RegExp) && !Array.isArray(v);
const prim = (v: any) => (v instanceof Date ? v.getTime() : v);

function cmp(a: any, b: any) {
    const x = prim(a), y = prim(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
}

function sortDocs(docs: any[], spec: Record<string, 1 | -1>) {
    return [...docs].sort((a, b) => {
        for (const [k, d] of Object.entries(spec)) {
            const c = cmp(getPath(a, k), getPath(b, k));
            if (c) return c * d;
        }
        return 0;
    });
}

function applyUpdate(doc: any, update: any, inserting = false) {
    for (const [op, val] of Object.entries(update ?? {})) {
        if (op === "$set") {
            for (const [k, v] of Object.entries(val as any)) setPath(doc, k, v);
        } else if (op === "$setOnInsert") {
            if (inserting) {
                for (const [k, v] of Object.entries(val as any)) setPath(doc, k, v);
            }
        } else if (op === "$inc") {
            for (const [k, v] of Object.entries(val as any)) setPath(doc, k, (Number(getPath(doc, k)) || 0) + Number(v));
        } else if (op === "$push") {
            for (const [k, v] of Object.entries(val as any)) {
                const arr = getPath(doc, k) ?? [];
                setPath(doc, k, [...arr, v]);
            }
        } else if (op === "$addToSet") {
            for (const [k, v] of Object.entries(val as any)) {
                const arr = getPath(doc, k) ?? [];
                if (!arr.some((x: any) => JSON.stringify(x) === JSON.stringify(v))) setPath(doc, k, [...arr, v]);
            }
        } else if (op === "$pull") {
            for (const [k, v] of Object.entries(val as any)) {
                const arr = getPath(doc, k) ?? [];
                setPath(doc, k, arr.filter((x: any) => !matches(x, v)));
            }
        } else if (op === "$unset") {
            for (const k of Object.keys(val as any)) setPath(doc, k, undefined);
        } else if (!op.startsWith("$")) {
            setPath(doc, op, val);
        }
    }
    doc.updatedAt = new Date();
}

function evalExpr(expr: any, doc: any): any {
    if (typeof expr === "string" && expr.startsWith("$")) return getPath(doc, expr.slice(1));
    if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc));
    if (isObj(expr)) {
        const keys = Object.keys(expr);
        if (keys.length === 1 && keys[0].startsWith("$")) {
            const op = keys[0];
            const a = expr[op];
            switch (op) {
                case "$cond": {
                    const [i, t, e] = Array.isArray(a) ? a : [a.if, a.then, a.else];
                    return evalExpr(i, doc) ? evalExpr(t, doc) : evalExpr(e, doc);
                }
                case "$eq": return JSON.stringify(evalExpr(a[0], doc)) === JSON.stringify(evalExpr(a[1], doc));
                case "$ne": return JSON.stringify(evalExpr(a[0], doc)) !== JSON.stringify(evalExpr(a[1], doc));
                case "$gt": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) > 0;
                case "$gte": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) >= 0;
                case "$lt": return cmp(evalExpr(a[0], doc), evalExpr(a[1], doc)) < 0;
                case "$ifNull": {
                    const v = evalExpr(a[0], doc);
                    return v == null ? evalExpr(a[1], doc) : v;
                }
                case "$add": return (a as any[]).reduce((s, e) => s + (Number(evalExpr(e, doc)) || 0), 0);
                case "$subtract": return (Number(evalExpr(a[0], doc)) || 0) - (Number(evalExpr(a[1], doc)) || 0);
                case "$multiply": return (a as any[]).reduce((s, e) => s * (Number(evalExpr(e, doc)) || 0), 1);
                default: return undefined;
            }
        }
        const out: any = {};
        for (const k of keys) out[k] = evalExpr(expr[k], doc);
        return out;
    }
    return expr;
}

function isMysqlDoc(value: any): value is { _id: string } {
    return value != null && typeof value === "object" && typeof value._id === "string";
}

const MYSQL_SCALAR_FIELDS = new Set([
    "action", "adminId", "audience", "beneficiaryId", "category", "createdBy", "fromUserId",
    "gameId", "isActive", "key", "kind", "name", "outcome", "ownerId", "phone", "referralCode",
    "referredBy", "resultId", "role", "sessionId", "slug", "status", "table", "threadId",
    "title", "transactionId", "type", "userId", "username",
]);

function mysqlScalarFilter(filter: any): { clause: string; values: string[] } {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) return { clause: "", values: [] };
    const conditions: string[] = [];
    const values: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
        if (value == null) continue;
        if ((key === "createdAt" || key === "lastMessageAt") && isObj(value)) {
            const expression = `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${key}'))`;
            for (const [operator, sqlOperator] of [["$gte", ">="], ["$gt", ">"], ["$lte", "<="], ["$lt", "<"]] as const) {
                const boundary = (value as Record<string, unknown>)[operator];
                if (boundary instanceof Date && Number.isFinite(boundary.getTime())) {
                    conditions.push(`${expression} ${sqlOperator} ?`);
                    values.push(boundary.toISOString());
                } else if (typeof boundary === "string") {
                    conditions.push(`${expression} ${sqlOperator} ?`);
                    values.push(boundary);
                }
            }
            continue;
        }
        const candidates = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            ? [value]
            : value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { $in?: unknown }).$in)
                ? (value as { $in: unknown[] }).$in
                : value && typeof value === "object" && !Array.isArray(value) && "$eq" in value
                    ? [(value as { $eq: unknown }).$eq]
                    : null;
        if (!candidates || candidates.some((candidate) =>
            candidate == null || (typeof candidate !== "string" && typeof candidate !== "number" && typeof candidate !== "boolean")
        )) continue;
        if (key === "_id") {
            if (candidates.length === 1) {
                conditions.push("id = ?");
                values.push(String(candidates[0]));
            } else if (candidates.length > 1) {
                conditions.push(`id IN (${candidates.map(() => "?").join(", ")})`);
                values.push(...candidates.map(String));
            } else {
                conditions.push("1 = 0");
            }
        } else if (MYSQL_SCALAR_FIELDS.has(key)) {
            const expression = `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${key}'))`;
            if (candidates.length === 1) {
                conditions.push(`${expression} = ?`);
                values.push(String(candidates[0]));
            } else if (candidates.length > 1) {
                conditions.push(`${expression} IN (${candidates.map(() => "?").join(", ")})`);
                values.push(...candidates.map(String));
            } else {
                conditions.push("1 = 0");
            }
        }
    }
    return { clause: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "", values };
}

export class Query<R> implements PromiseLike<R> {
    private _sort?: Record<string, 1 | -1>;
    private _limit?: number;
    private _pops: PopSpec[] = [];
    private _lean = false;

    constructor(private model: Model<any>, private exec: (q: Query<R>) => any, private single: boolean) { }

    sort(spec: Record<string, 1 | -1>) { this._sort = spec; return this; }
    limit(n: number) { this._limit = n; return this; }
    select(_s?: string) { return this; }
    lean<T = R>(): Query<T> { this._lean = true; return this as unknown as Query<T>; }
    populate<P = Record<string, unknown>>(path: string | PopSpec[], select?: string): Query<Populated<R, P>> {
        if (Array.isArray(path)) this._pops.push(...path);
        else this._pops.push({ path, select });
        return this as unknown as Query<Populated<R, P>>;
    }
    get opts() { return { sort: this._sort, limit: this._limit, pops: this._pops, lean: this._lean, single: this.single }; }
    then<A = R, B = never>(onOk?: ((v: R) => A | PromiseLike<A>) | null, onErr?: ((e: any) => B | PromiseLike<B>) | null): Promise<A | B> {
        return new Promise<R>((res, rej) => {
            try {
                res(this.exec(this));
            } catch (e) {
                rej(e);
            }
        }).then(onOk ?? undefined, onErr ?? undefined);
    }
    catch<B = never>(onErr: (e: any) => B | PromiseLike<B>) { return this.then(undefined, onErr); }
}

export class Model<T extends { _id: string }> {
    private fallback: any;

    constructor(public name: string, public o: ModelOptions<T>) {
        this.fallback = new LocalModel(name, o);
    }

    async bulkWrite(ops: any[]) {
        if (!(await this.ensureMysql())) return this.fallback.bulkWrite(ops);
        for (const op of ops) {
            if (op.updateOne) await this.updateOne(op.updateOne.filter, op.updateOne.update);
            if (op.deleteOne) await this.deleteOne(op.deleteOne.filter);
        }
        return { ok: 1 };
    }

    private fresh(data: any): any {
        const base = { ...(this.o.defaults?.() ?? {}), ...clone(data ?? {}) };
        base._id = base._id ? String(base._id) : newId();
        base.createdAt = base.createdAt ?? new Date();
        base.updatedAt = new Date();
        return base;
    }

    private async ensureMysql(): Promise<boolean> {
        if (!isMysqlEnabled()) {
            if (allowLocalFallback) return false;
            throw new Error("MySQL is required; local/browser database fallback is disabled.");
        }
        try {
            return await withDbRetry(() => ensureMysqlReady());
        } catch (error) {
            // MySQL is configured: never silently write to the local fallback, or data never reaches Hostinger.
            throw error;
        }
    }

    private localQuery(filter: any, q: Query<any>) {
        const local = this.fallback.find(filter);
        if (q.opts.sort) local.sort(q.opts.sort);
        if (q.opts.limit != null) local.limit(q.opts.limit);
        if (q.opts.lean) local.lean();
        return q.opts.single ? this.fallback.findOne(filter) : local;
    }

    private async mysqlDocs(filter?: any): Promise<any[]> {
        const enabled = await this.ensureMysql();
        if (!enabled) return [];
        await ensureMysqlTable(this.o.collection);
        const pool = await getMysqlPool();
        if (!pool) return [];
        try {
            const scalarFilter = mysqlScalarFilter(filter);
            const [rows] = await withDbRetry(() => pool.query(
                `SELECT data FROM \`${this.o.collection.replace(/`/g, "")}\`${scalarFilter.clause}`,
                scalarFilter.values,
            ));
            // mysql2 auto-parses JSON columns into objects, but some drivers/configs return the raw string.
            return (rows as any[]).map((row) => (typeof row.data === "string" ? JSON.parse(row.data || "{}") : (row.data ?? {})));
        } catch (err: any) {
            // Never pretend the table is empty: that made existing records look missing and caused duplicates.
            console.error(`[mysqlDocs ${this.o.collection}] query failed:`, err.message);
            throw err;
        }
    }

    private async persistMysqlDoc(doc: any): Promise<void> {
        const enabled = await this.ensureMysql();
        if (!enabled) return;
        await ensureMysqlTable(this.o.collection);
        const pool = await getMysqlPool();
        if (!pool) return;
        try {
            await withDbRetry(() => pool.execute(
                `INSERT INTO \`${this.o.collection.replace(/`/g, "")}\` (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
                [String(doc._id), JSON.stringify(doc), doc.createdAt ?? new Date(), doc.updatedAt ?? new Date()]
            ));
        } catch (err: any) {
            // Surface the failure so callers never report success for data that was not saved.
            console.error(`[persistMysqlDoc ${this.o.collection}] write failed:`, err.message);
            throw err;
        }
    }

    private async mysqlRun(filter: any, q: Query<any>) {
        const docs = (await this.mysqlDocs(filter)).filter((d) => matches(d, filter));
        let out = docs;
        if (q.opts.sort) out = sortDocs(out, q.opts.sort);
        if (q.opts.single) out = out.slice(0, 1);
        else if (q.opts.limit != null) out = out.slice(0, q.opts.limit);
        const wrapped = out.map((d) => this.wrap(d, q.opts.lean));
        return q.opts.single ? (wrapped[0] ?? null) : wrapped;
    }

    private wrap(doc: any, lean?: boolean) {
        const cloneDoc = clone(doc);
        if (lean) return cloneDoc;
        const self = this;
        Object.defineProperty(cloneDoc, "save", { enumerable: false, value: async function () { const row = clone(this); await self.persistMysqlDoc(row); return row; } });
        Object.defineProperty(cloneDoc, "toObject", { enumerable: false, value: function () { return clone(this); } });
        return cloneDoc;
    }

    private async upsertByFilter(filter: any, update: any, opts: { upsert?: boolean } = {}) {
        const docs = await this.mysqlDocs();
        const idx = docs.findIndex((d) => matches(d, filter));
        if (idx >= 0) {
            const doc = docs[idx];
            applyUpdate(doc, update);
            await this.persistMysqlDoc(doc);
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (opts.upsert) {
            const doc: any = {};
            for (const [k, v] of Object.entries(filter ?? {})) {
                if (!k.startsWith("$") && !isObj(v)) setPath(doc, k, v);
            }
            const created = this.fresh(doc);
            applyUpdate(created, update, true);
            await this.persistMysqlDoc(created);
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created._id };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    private async runMysqlAggregation(pipeline: any[]): Promise<any[]> {
        let docs: any[] = (await this.mysqlDocs()).map((d) => clone(d));

        for (const stage of pipeline) {
            const [op] = Object.keys(stage);
            const arg = stage[op];
            if (op === "$match") docs = docs.filter((d) => matches(d, arg));
            else if (op === "$sort") docs = sortDocs(docs, arg);
            else if (op === "$limit") docs = docs.slice(0, arg);
            else if (op === "$skip") docs = docs.slice(arg);
            else if (op === "$unwind") {
                const path = String(typeof arg === "string" ? arg : arg.path).replace(/^\$/, "");
                docs = docs.flatMap((d) => {
                    const arr = getPath(d, path);
                    if (!Array.isArray(arr)) return [];
                    return arr.map((v) => {
                        const n = clone(d);
                        setPath(n, path, v);
                        return n;
                    });
                });
            } else if (op === "$group") {
                const groups = new Map<string, any>();
                for (const d of docs) {
                    const idVal = arg._id == null ? null : evalExpr(arg._id, d);
                    const key = JSON.stringify(idVal ?? null);
                    let g = groups.get(key);
                    if (!g) {
                        g = { _id: idVal ?? null, __n: 0 };
                        groups.set(key, g);
                    }
                    g.__n++;
                    for (const [field, acc] of Object.entries(arg)) {
                        if (field === "_id") continue;
                        const accObj = acc as any;
                        const [aop] = Object.keys(accObj);
                        const aexpr = accObj[aop];
                        const v = evalExpr(aexpr, d);
                        switch (aop) {
                            case "$sum":
                                g[field] = (g[field] ?? 0) + (typeof aexpr === "number" ? aexpr : Number(v) || 0);
                                break;
                            case "$addToSet":
                                g[field] ??= [];
                                if (!g[field].some((x: any) => JSON.stringify(x) === JSON.stringify(v))) g[field].push(v);
                                break;
                            case "$push":
                                (g[field] ??= []).push(v);
                                break;
                            case "$max":
                                if (g[field] == null || cmp(v, g[field]) > 0) g[field] = v;
                                break;
                            case "$min":
                                if (g[field] == null || cmp(v, g[field]) < 0) g[field] = v;
                                break;
                            case "$first":
                                if (!(field in g)) g[field] = v;
                                break;
                            case "$last":
                                g[field] = v;
                                break;
                        }
                    }
                }
                docs = Array.from(groups.values()).map((g) => {
                    const { __n, ...rest } = g;
                    void __n;
                    return rest;
                });
            } else if (op === "$project") {
                docs = docs.map((d) => {
                    const out: any = { _id: d._id };
                    for (const [k, v] of Object.entries(arg)) {
                        if (v === 0) {
                            delete out[k];
                            continue;
                        }
                        out[k] = v === 1 ? getPath(d, k) : evalExpr(v, d);
                    }
                    return out;
                });
            }
        }

        return docs;
    }

    find(filter: any = {}, _proj?: any): Query<any[]> {
        if (isMysqlEnabled() || allowLocalFallback) return new Query(this, async (q) => (await this.ensureMysql()) ? this.mysqlRun(filter, q) : this.localQuery(filter, q), false) as any;
        throw new Error("MySQL is required; local/browser database fallback is disabled.");
    }

    findOne(filter: any = {}, _proj?: any): Query<any> {
        if (isMysqlEnabled() || allowLocalFallback) return new Query(this, async (q) => (await this.ensureMysql()) ? this.mysqlRun(filter, q) : this.localQuery(filter, q), true) as any;
        throw new Error("MySQL is required; local/browser database fallback is disabled.");
    }

    findById(id: any, _proj?: any): Query<any> {
        if (isMysqlEnabled() || allowLocalFallback) return new Query(this, async (q) => (await this.ensureMysql()) ? this.mysqlRun({ _id: String(id) }, q) : this.localQuery({ _id: String(id) }, q), true) as any;
        throw new Error("MySQL is required; local/browser database fallback is disabled.");
    }

    async exists(filter: any): Promise<{ _id: string } | null> {
        if (await this.ensureMysql()) {
            const docs = await this.mysqlDocs();
            const doc = docs.find((d) => matches(d, filter));
            return doc ? { _id: String(doc._id) } : null;
        }
        return this.fallback.exists(filter);
    }

    async countDocuments(filter: any = {}): Promise<number> {
        if (await this.ensureMysql()) {
            const docs = await this.mysqlDocs();
            return docs.filter((d) => matches(d, filter)).length;
        }
        return this.fallback.countDocuments(filter);
    }

    async create(data: Partial<T>): Promise<any> {
        if (await this.ensureMysql()) {
            const doc = this.fresh(data);
            await this.persistMysqlDoc(doc);
            return this.wrap(doc, false);
        }
        return this.fallback.create(data);
    }

    async insertMany(list: Partial<T>[]): Promise<any[]> {
        if (await this.ensureMysql()) {
            const out = list.map((item) => this.fresh(item));
            for (const doc of out) await this.persistMysqlDoc(doc);
            return out.map((doc) => this.wrap(doc, false));
        }
        return this.fallback.insertMany(list);
    }

    async updateOne(filter: any, update: any, opts: { upsert?: boolean } = {}) {
        if (await this.ensureMysql()) return this.upsertByFilter(filter, update, opts);
        return this.fallback.updateOne(filter, update, opts);
    }

    async updateOneAtomic(filter: Record<string, unknown> & { _id: string }, update: Record<string, unknown>) {
        if (!(await this.ensureMysql())) return this.fallback.updateOne(filter, update);
        await ensureMysqlTable(this.o.collection);
        const pool = await getMysqlPool();
        if (!pool) throw new Error("MySQL connection unavailable.");
        const connection = await pool.getConnection();
        const table = this.o.collection.replace(/`/g, "");
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query<RowDataPacket[]>(`SELECT data FROM \`${table}\` WHERE id = ? FOR UPDATE`, [filter._id]);
            const doc = rows[0] && (typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data);
            if (!doc || !matches(doc, filter)) {
                await connection.commit();
                return { matchedCount: 0, modifiedCount: 0 };
            }
            applyUpdate(doc, update);
            doc.updatedAt = new Date();
            await connection.execute(`UPDATE \`${table}\` SET data = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(doc), doc.updatedAt, filter._id]);
            await connection.commit();
            return { matchedCount: 1, modifiedCount: 1 };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async updateMany(filter: any, update: any) {
        if (await this.ensureMysql()) {
            const docs = await this.mysqlDocs();
            let count = 0;
            for (const doc of docs) {
                if (matches(doc, filter)) {
                    applyUpdate(doc, update);
                    await this.persistMysqlDoc(doc);
                    count++;
                }
            }
            return { matchedCount: count, modifiedCount: count };
        }
        return this.fallback.updateMany(filter, update);
    }

    async deleteOne(filter: any) {
        if (await this.ensureMysql()) {
            const docs = await this.mysqlDocs();
            const idx = docs.findIndex((d) => matches(d, filter));
            if (idx < 0) return { deletedCount: 0 };
            const doc = docs[idx];
            const pool = await getMysqlPool();
            await pool!.execute(`DELETE FROM \`${this.o.collection.replace(/`/g, "")}\` WHERE id = ?`, [String(doc._id)]);
            return { deletedCount: 1 };
        }
        return this.fallback.deleteOne(filter);
    }

    async deleteMany(filter: any) {
        if (await this.ensureMysql()) {
            const docs = await this.mysqlDocs();
            const toDelete = docs.filter((d) => matches(d, filter));
            if (!toDelete.length) return { deletedCount: 0 };
            const pool = await getMysqlPool();
            for (const doc of toDelete) {
                await pool!.execute(`DELETE FROM \`${this.o.collection.replace(/`/g, "")}\` WHERE id = ?`, [String(doc._id)]);
            }
            return { deletedCount: toDelete.length };
        }
        return this.fallback.deleteMany(filter);
    }

    findOneAndUpdate(filter: any, update: any, opts: { upsert?: boolean; returnDocument?: "after" | "before"; new?: boolean } = {}): Query<any> {
        return new Query(this, async (q) => {
            if (await this.ensureMysql()) {
                const docs = await this.mysqlDocs();
                const idx = docs.findIndex((d) => matches(d, filter));
                if (idx < 0) {
                    if (!opts.upsert) return null;
                    const doc: any = {};
                    for (const [k, v] of Object.entries(filter ?? {})) if (!k.startsWith("$") && !isObj(v)) setPath(doc, k, v);
                    const created = this.fresh(doc);
                    applyUpdate(created, update, true);
                    await this.persistMysqlDoc(created);
                    return this.wrap(created, q.opts.lean);
                }

                const before = clone(docs[idx]);
                applyUpdate(docs[idx], update);
                await this.persistMysqlDoc(docs[idx]);
                if (opts.returnDocument === "before" || opts.new === false) return this.wrap(before, q.opts.lean);
                return this.wrap(docs[idx], q.opts.lean);
            }
            return this.fallback.findOneAndUpdate(filter, update, opts);
        }, true);
    }

    findOneAndDelete(filter: any): Query<any> {
        return new Query(this, async (q) => {
            if (await this.ensureMysql()) {
                const docs = await this.mysqlDocs();
                const idx = docs.findIndex((d) => matches(d, filter));
                if (idx < 0) return null;
                const [deleted] = docs.splice(idx, 1);
                const pool = await getMysqlPool();
                await pool!.execute(`DELETE FROM \`${this.o.collection.replace(/`/g, "")}\` WHERE id = ?`, [String(deleted._id)]);
                return this.wrap(deleted, q.opts.lean);
            }
            return this.fallback.findOneAndDelete(filter);
        }, true);
    }

    async aggregate<R = any>(pipeline: any[]): Promise<R[]> {
        if (await this.ensureMysql()) return (await this.runMysqlAggregation(pipeline)) as R[];
        return this.fallback.aggregate(pipeline);
    }
}

export function oid(id: string) { return String(id); }
