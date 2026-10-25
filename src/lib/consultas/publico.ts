import "server-only";
import { q, q1 } from "../db";
import type { Empresa } from "../tipos";

/**
 * Consultas da página pública de agendamento (sem login) e da landing.
 * Movidas literalmente das páginas/rotas de src/app (camada de apresentação não fala com o banco).
 */

export type UnidadePub = { id: string; nome: string; endereco: string | null; maps_url: string | null };

export const empresaCompletaPorSlug = (slug: string) => q1<Empresa>(`select * from empresa where slug = $1`, [slug]);

export const resumoEmpresaPorSlug = (slug: string) =>
  q1<{ nome: string; endereco: string | null }>(`select nome, endereco from empresa where slug = $1`, [slug]);

export const idEmpresaPorSlug = (slug: string) => q1<{ id: string }>(`select id from empresa where slug = $1`, [slug]);

/** Empresa usada como demonstração na página inicial (a primeira cadastrada). */

export const unidadesAtivas = (empresaId: string) =>
  q<UnidadePub>(`select id, nome, endereco, maps_url from unidade where empresa_id = $1 and ativo order by nome`, [empresaId]);

export const totalProfissionaisAtivos = (empresaId: string) =>
  q<{ profs: number }>(`select count(*)::int as profs from profissional where empresa_id = $1 and ativo`, [empresaId]);

/** R7: profissionais ativos que fazem o serviço (opcionalmente numa unidade). */
export const profissionaisDoServico = (empresaId: string, servicoId: string, unidadeId: string | null) =>
  q(
    `select p.id, p.nome, p.foto_url from profissional p
       join profissional_servico ps on ps.profissional_id = p.id
       where p.empresa_id = $1 and p.ativo and ps.servico_id = $2
         and ($3::uuid is null or p.unidade_id is null or p.unidade_id = $3::uuid)
       order by p.nome`,
    [empresaId, servicoId, unidadeId],
  );

export const nomeProfissional = (id: string) => q1<{ nome: string }>(`select nome from profissional where id = $1`, [id]);

/** Dados para remarcar pelo link (chamar só depois de validar o token com buscarPorToken). */
export const agendamentoParaRemarcar = (id: string) =>
  q1<{ empresa_id: string; servico_id: string; profissional_id: string }>(`select empresa_id, servico_id, profissional_id from agendamento where id = $1`, [id]);
