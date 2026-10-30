/**
 * Cria um banco PGlite fresco com seed + Outra Barbearia.
 * Uso: PGLITE_DIR=.data/pglite npx tsx e2e/setup-banco.ts
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import type { Executor } from "../src/lib/db";
import { semear } from "../src/lib/seed";

const dir = path.resolve(process.env.PGLITE_DIR ?? ".data/pglite");

async function main() {
  // Banco fresco
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });

  const pg = await PGlite.create(dir);

  const executor: Executor & {
    transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
    exec(sql: string): Promise<void>;
  } = {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params as never[])).rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Executor) => Promise<T>) {
      return pg.transaction(async (tx) =>
        fn({
          async query<U>(sql: string, params: unknown[] = []) {
            return (await tx.query<U>(sql, params as never[])).rows;
          },
        }),
      );
    },
  };

  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await executor.exec(schema);
  console.log("schema aplicado");

  await executor.transaction((tx) => semear(tx));
  console.log("seed: Barbearia Exemplo criada");

  const sal = randomBytes(16).toString("hex");
  const hash = `scrypt$${sal}$${scryptSync("agendou123", sal, 64).toString("hex")}`;
  const [e] = await executor.query<{ id: string }>(
    "insert into empresa (nome, slug) values ('Outra Barbearia', 'outra-barbearia') returning id",
  );
  await executor.query("insert into config_tema (empresa_id) values ($1)", [e.id]);
  await executor.query("insert into config_agendamento (empresa_id) values ($1)", [e.id]);
  await executor.query(
    "insert into usuario_painel (empresa_id, nome, telefone, senha_hash, papel) values ($1,'Dona Outra','21900000002',$2,'dono')",
    [e.id, hash],
  );
  console.log("Outra Barbearia criada — login 21900000002 / agendou123");

  await pg.close();
  console.log("banco fechado ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
