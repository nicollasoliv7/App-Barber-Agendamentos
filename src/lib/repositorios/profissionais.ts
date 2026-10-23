import "server-only";
import { tx } from "../db";

/** Gravação de profissionais (valores já validados pela action). Sempre restrito à empresa. */

export interface DadosProfissional {
  nome: string;
  telefone: string | null;
  comissao_pct: number;
  ativo: boolean;
  /** id da unidade ou "" (sem unidade); só vale se a unidade for da empresa */
  unidade: string;
  servicos: string[];
}

/** Cria (com expediente padrão seg–sex 09–18, sáb 09–14) ou atualiza, e redefine os serviços que faz. */
export async function salvarProfissionalDados(empresaId: string, id: string | null, d: DadosProfissional) {
  await tx(async (t) => {
    let pid = id;
    if (id) {
      await t.query(
        `update profissional set nome=$1, telefone=$2, comissao_pct=$3, ativo=$4,
             unidade_id = (select id from unidade where id = nullif($7,'')::uuid and empresa_id = $6)
           where id=$5 and empresa_id=$6`,
        [d.nome, d.telefone, d.comissao_pct, d.ativo, id, empresaId, d.unidade],
      );
    } else {
      const [p] = await t.query<{ id: string }>(
        `insert into profissional (empresa_id, nome, telefone, comissao_pct, ativo, unidade_id)
           values ($1,$2,$3,$4,true,(select id from unidade where id = nullif($5,'')::uuid and empresa_id = $1)) returning id`,
        [empresaId, d.nome, d.telefone, d.comissao_pct, d.unidade],
      );
      pid = p.id;
      for (let dia = 1; dia <= 6; dia++)
        await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,540,$3)`, [
          pid,
          dia,
          dia === 6 ? 840 : 1080,
        ]);
    }
    await t.query(`delete from profissional_servico where profissional_id = $1`, [pid]);
    for (const s of d.servicos)
      await t.query(
        `insert into profissional_servico (profissional_id, servico_id) select $1, id from servico where id = $2 and empresa_id = $3`,
        [pid, s, empresaId],
      );
  });
}
