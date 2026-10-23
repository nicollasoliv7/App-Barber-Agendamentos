import "server-only";
import { q, tx } from "../db";

/** Gravação de serviços (valores já validados pela action). Sempre restrito à empresa. */

export interface DadosServico {
  nome: string;
  descricao: string | null;
  observacao: string | null;
  preco_centavos: number;
  duracao_min: number;
  ativo: boolean;
  ordem: number;
  imagem_url: string | null;
}

const valores = (d: DadosServico) => [d.nome, d.descricao, d.observacao, d.preco_centavos, d.duracao_min, d.ativo, d.ordem, d.imagem_url];

export async function atualizarServico(empresaId: string, id: string, d: DadosServico) {
  await q(
    `update servico set nome=$1, descricao=$2, observacao=$3, preco_centavos=$4, duracao_min=$5, ativo=$6, ordem=$7, imagem_url=$8
         where id=$9 and empresa_id=$10`,
    [...valores(d), id, empresaId],
  );
}

/** Novo serviço: todos os profissionais ativos passam a fazê-lo (ajustável em Profissionais). */
export async function criarServico(empresaId: string, d: DadosServico) {
  await tx(async (t) => {
    const [s] = await t.query<{ id: string }>(
      `insert into servico (nome, descricao, observacao, preco_centavos, duracao_min, ativo, ordem, imagem_url, empresa_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [...valores(d), empresaId],
    );
    await t.query(
      `insert into profissional_servico (profissional_id, servico_id) select id, $1 from profissional where empresa_id = $2 and ativo`,
      [s.id, empresaId],
    );
  });
}
