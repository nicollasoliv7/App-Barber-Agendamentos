import "server-only";
import fs from "node:fs";
import path from "node:path";
import { log } from "./log";

/**
 * Camada mínima de acesso ao Postgres.
 * - Sem DATABASE_URL: PGlite (Postgres embutido) persistido em ./.data/pglite
 * - Com DATABASE_URL: Postgres real (ex.: Supabase) via node-postgres
 */

export type Row = Record<string, unknown>;
export interface Executor {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Agenda uma tarefa para DEPOIS do commit (ex.: chamada à API do WhatsApp). Só existe dentro de tx(). */
  depois?: (fn: () => Promise<unknown>) => void;
}
interface Driver extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

async function criarPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  // na Vercel (serverless) só /tmp é gravável: banco de demonstração efêmero por instância
  const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/pglite" : path.join(process.cwd(), ".data", "pglite"));
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

/**
 * Tolera deslizes comuns ao colar a DATABASE_URL no painel (espaços, aspas, "DATABASE_URL=" junto)
 * e recusa com mensagem clara um valor que não seja um endereço postgres:// — sem nunca exibir a senha.
 */
export function urlDoBanco(bruto: string | undefined, senhaSeparada?: string): string | null {
  let u = (bruto ?? "").trim();
  if (!u) return null;
  u = u.replace(/^DATABASE_URL\s*=\s*/i, "").trim();
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) u = u.slice(1, -1).trim();
  if (!/^postgres(ql)?:\/\//i.test(u))
    throw new Error("DATABASE_URL inválida: o valor precisa começar com postgresql:// (confira se não há texto extra antes do endereço).");
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new Error("DATABASE_URL inválida: o endereço está mal formado. Se a senha tiver @ # / ? : %, troque por uma só com letras e números.");
  }
  // senha em variável separada (DATABASE_PASSWORD): o endereço fica sem segredo e a senha pode ter qualquer caractere
  const senha = senhaSeparada?.replace(/^\s+|\s+$/g, "");
  if (senha) {
    const atual = decodeURIComponent(url.password);
    if (!atual || /^\[?(YOUR-PASSWORD|SENHA_AQUI|MINHA_SENHA)\]?$/i.test(atual)) {
      url.password = encodeURIComponent(senha);
      u = url.toString();
    }
  }
  return u;
}

const g = globalThis as unknown as { __agendouDb?: Promise<Driver> };

async function iniciar(): Promise<Driver> {
  const url = urlDoBanco(process.env.DATABASE_URL, process.env.DATABASE_PASSWORD);
  const d = url ? await criarPostgres(url) : await criarPglite();
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await d.exec(schema);
  const [{ n }] = await d.query<{ n: number }>("select count(*)::int as n from empresa");
  if (n === 0 && process.env.SEED !== "0") {
    const { semear } = await import("./seed");
    await d.transaction((tx) => semear(tx));
    log.info("[agendou] banco criado com dados fictícios de exemplo");
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

/**
 * Transação. Tarefas registradas com t.depois() rodam só após o commit
 * (chamadas de rede não seguram locks e não rodam se a transação falhar).
 */
export async function tx<T>(fn: (t: Executor) => Promise<T>): Promise<T> {
  const depois: (() => Promise<unknown>)[] = [];
  const out = await (await db()).transaction((t) => fn(Object.assign(t, { depois: (f: () => Promise<unknown>) => void depois.push(f) })));
  for (const f of depois) {
    try {
      await f();
    } catch (e) {
      log.erro("[agendou] tarefa pós-commit falhou:", e);
    }
  }
  return out;
}
