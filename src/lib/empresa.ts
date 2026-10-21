import "server-only";
import { q, q1, type Executor } from "./db";
import type { CampoPersonalizado, ConfigAgendamento, ConfigTema, Empresa, Servico } from "./tipos";
import { ErroNegocio } from "./tipos";

export async function empresaPorSlug(slug: string): Promise<Empresa> {
  const e = await q1<Empresa>(`select * from empresa where slug = $1`, [slug]);
  if (!e) throw new ErroNegocio("Empresa não encontrada", 404);
  return e;
}

export async function configAgendamento(empresaId: string, t?: Executor): Promise<ConfigAgendamento> {
  const sql = `select * from config_agendamento where empresa_id = $1`;
  const rows = t ? await t.query<ConfigAgendamento>(sql, [empresaId]) : await q<ConfigAgendamento>(sql, [empresaId]);
  if (!rows[0]) throw new ErroNegocio("Configuração ausente", 500);
  return rows[0];
}

export async function configTema(empresaId: string): Promise<ConfigTema> {
  return (await q1<ConfigTema>(`select * from config_tema where empresa_id = $1`, [empresaId]))!;
}

export async function camposAtivos(empresaId: string): Promise<CampoPersonalizado[]> {
  return q<CampoPersonalizado>(
    `select * from campo_personalizado where empresa_id = $1 and ativo order by ordem, rotulo`,
    [empresaId],
  );
}

export async function servicosAtivos(empresaId: string): Promise<Servico[]> {
  return q<Servico>(
    `select s.* from servico s
     where s.empresa_id = $1 and s.ativo
       and exists (select 1 from profissional_servico ps join profissional p on p.id = ps.profissional_id
                   where ps.servico_id = s.id and p.ativo)
     order by s.ordem, s.nome`,
    [empresaId],
  );
}

export function valorCobranca(preco: number, tipo: "minimo" | "integral", cfg: ConfigAgendamento): number {
  if (tipo === "integral") return preco;
  return Math.max(1, Math.ceil((preco * cfg.pagamento_minimo_pct) / 100));
}
