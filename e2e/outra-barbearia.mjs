// Cria uma SEGUNDA barbearia fictícia no banco local (PGlite) para testar o isolamento entre empresas.
// Rode com o app PARADO: PGLITE_DIR=.data/pglite node e2e/outra-barbearia.mjs
import { PGlite } from "@electric-sql/pglite";
import { randomBytes, scryptSync } from "node:crypto";

const db = await PGlite.create(process.env.PGLITE_DIR ?? ".data/pglite");
const ja = await db.query(`select 1 from empresa where slug = 'outra-barbearia'`);
if (!ja.rows.length) {
  const sal = randomBytes(16).toString("hex");
  const hash = `scrypt$${sal}$${scryptSync("agendou123", sal, 64).toString("hex")}`;
  const {
    rows: [e],
  } = await db.query(`insert into empresa (nome, slug) values ('Outra Barbearia', 'outra-barbearia') returning id`);
  await db.query(`insert into config_tema (empresa_id) values ($1)`, [e.id]);
  await db.query(`insert into config_agendamento (empresa_id) values ($1)`, [e.id]);
  await db.query(`insert into usuario_painel (empresa_id, nome, telefone, senha_hash, papel) values ($1,'Dona Outra','21900000002',$2,'dono')`, [e.id, hash]);
  console.log("Outra Barbearia criada: login (21) 90000-0002 / agendou123");
} else console.log("Outra Barbearia já existe");
await db.close();
