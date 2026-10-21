import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Camada mínima de acesso ao Postgres.
 * - Sem DATABASE_URL: PGlite (Postgres embutido) persistido em ./.data/pglite
 * - Com DATABASE_URL: Postgres real (ex.: Supabase) via node-postgres
 */

export type Row = Record<string, unknown>;
export interface Executor {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
interface Driver extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

async function criarPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params as unknown[]);
      return r.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Executor) => Promise<T>) {
      return pg.transaction(async (tx) =>
        fn({
          async query<U>(sql: string, params: unknown[] = []) {
            const r = await tx.query<U>(sql, params as unknown[]);
            return r.rows;
          },
        }),
      );
    },
  };
}

async function criarPostgres(url: string): Promise<Driver> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Executor) => Promise<T>) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({
          async query<U>(sql: string, params: unknown[] = []) {
            const r = await c.query(sql, params);
            return r.rows as U[];
          },
        });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

const g = globalThis as unknown as { __agendouDb?: Promise<Driver> };

async function iniciar(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  const d = url ? await criarPostgres(url) : await criarPglite();
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await d.exec(schema);
  const [{ n }] = await d.query<{ n: number }>("select count(*)::int as n from empresa");
  if (n === 0 && process.env.SEED !== "0") {
    const { semear } = await import("./seed");
    await d.transaction((tx) => semear(tx));
    console.log("[agendou] banco criado com dados fictícios de exemplo");
  }
  return d;
}

export function db(): Promise<Driver> {
  if (!g.__agendouDb) {
    g.__agendouDb = iniciar().catch((e) => {
      g.__agendouDb = undefined;
      throw e;
    });
  }
  return g.__agendouDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query<T>(sql, params);
}

export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function tx<T>(fn: (t: Executor) => Promise<T>): Promise<T> {
  return (await db()).transaction(fn);
}
