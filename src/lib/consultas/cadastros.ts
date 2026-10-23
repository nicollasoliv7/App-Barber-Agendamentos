import "server-only";
import { q, q1 } from "../db";
import type { CampoPersonalizado, Empresa, Profissional, Servico } from "../tipos";

/**
 * Consultas das telas de cadastro do painel (empresa, serviços, profissionais, horários,
 * folgas, unidades e campos extras). Toda consulta é filtrada pela empresa do usuário.
 */

export type Opcao = { id: string; nome: string };
export type UnidadeCadastro = { id: string; nome: string; endereco: string | null; maps_url: string | null; ativo: boolean };

export const empresaPorId = (empresaId: string) => q1<Empresa>(`select * from empresa where id = $1`, [empresaId]);

export const camposPersonalizados = (empresaId: string) =>
  q<CampoPersonalizado>(`select * from campo_personalizado where empresa_id = $1 order by ordem`, [empresaId]);

export const unidadesDaEmpresa = (empresaId: string) =>
  q<UnidadeCadastro>(`select id, nome, endereco, maps_url, ativo from unidade where empresa_id = $1 order by nome`, [empresaId]);

export const unidadesAtivasOpcoes = (empresaId: string) =>
  q<Opcao>(`select id, nome from unidade where empresa_id = $1 and ativo order by nome`, [empresaId]);

export const servicosDaEmpresa = (empresaId: string) => q<Servico>(`select * from servico where empresa_id = $1 order by ordem, nome`, [empresaId]);

export const servicosOpcoes = (empresaId: string) => q<Opcao>(`select id, nome from servico where empresa_id = $1 order by ordem, nome`, [empresaId]);

export const profissionaisDaEmpresa = (empresaId: string) =>
  q<Profissional>(`select * from profissional where empresa_id = $1 order by ativo desc, nome`, [empresaId]);

/** Todos os profissionais (ativos e inativos), só id e nome. */
export const profissionaisOpcoes = (empresaId: string) => q<Opcao>(`select id, nome from profissional where empresa_id = $1 order by nome`, [empresaId]);

export const profissionaisAtivosOpcoes = (empresaId: string) =>
  q<Opcao>(`select id, nome from profissional where empresa_id = $1 and ativo order by nome`, [empresaId]);

export const vinculosProfissionalServico = (empresaId: string) =>
  q<{ profissional_id: string; servico_id: string }>(
    `select ps.* from profissional_servico ps join profissional p on p.id = ps.profissional_id where p.empresa_id = $1`,
    [empresaId],
  );

export const faixasDeHorario = (empresaId: string) =>
  q<{ id: string; profissional_id: string; dia_semana: number; inicio_min: number; fim_min: number }>(
    `select d.* from disponibilidade d join profissional p on p.id = d.profissional_id where p.empresa_id = $1 order by dia_semana, inicio_min`,
    [empresaId],
  );

/** Folgas e bloqueios que ainda não terminaram. */
export const bloqueiosFuturos = (empresaId: string) =>
  q<{ id: string; inicio: Date; fim: Date; motivo: string | null; profissional: string | null }>(
    `select b.id, b.inicio, b.fim, b.motivo, p.nome as profissional from bloqueio b left join profissional p on p.id = b.profissional_id
     where b.empresa_id = $1 and b.fim > now() order by b.inicio`,
    [empresaId],
  );

export const clientePorTelefone = (empresaId: string, telefone: string) =>
  q1<{ id: string }>(`select id from cliente where empresa_id = $1 and telefone = $2`, [empresaId, telefone]);

export async function totalClientes(empresaId: string): Promise<number> {
  const [{ total_clientes }] = await q<{ total_clientes: number }>(`select count(*)::int as total_clientes from cliente where empresa_id = $1`, [empresaId]);
  return total_clientes;
}
