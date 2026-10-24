import "server-only";
import { q, tx } from "../db";
import { conferirVagaClientes } from "../planos-sistema";

/** Gravação de clientes pelo painel. Sempre restrito à empresa. */

/** Atualiza nome, e-mail e observações. Retorna false se o cliente não for desta empresa. */
export async function atualizarCliente(empresaId: string, id: string, nome: string, email: string | null, observacoes: string | null): Promise<boolean> {
  const r = await q(`update cliente set nome=$1, email=$2, observacoes=$3 where id=$4 and empresa_id=$5 returning id`, [nome, email, observacoes, id, empresaId]);
  return r.length > 0;
}

/** Cadastro manual. Retorna false se já existe cliente com esse telefone na empresa. */
export async function cadastrarCliente(empresaId: string, nome: string, telefone: string, email: string | null, observacoes: string | null): Promise<boolean> {
  return tx(async (t) => {
    const [existe] = await t.query(`select 1 from cliente where empresa_id = $1 and telefone = $2`, [empresaId, telefone]);
    if (existe) return false;
    await conferirVagaClientes(t, empresaId, 1, "painel"); // limite do plano Gratuito
    const r = await t.query(
      `insert into cliente (empresa_id, nome, telefone, email, observacoes, origem) values ($1,$2,$3,$4,$5,'painel')
         on conflict (empresa_id, telefone) do nothing returning id`,
      [empresaId, nome, telefone, email, observacoes],
    );
    return r.length > 0;
  });
}
