import "server-only";
import { q, tx } from "../db";
import { ErroNegocio } from "../tipos";

/** Gravação do expediente semanal e de folgas/bloqueios. Sempre restrito à empresa. */

/** Adiciona a mesma faixa em vários dias; recusa profissional de outra empresa e sobreposição. */
export async function adicionarFaixas(empresaId: string, prof: string, dias: number[], ini: number, fim: number) {
  await tx(async (t) => {
    const [p] = await t.query(`select 1 from profissional where id = $1 and empresa_id = $2`, [prof, empresaId]);
    if (!p) throw new ErroNegocio("Profissional inválido");
    for (const d of dias) {
      const [sob] = await t.query(
        `select 1 from disponibilidade where profissional_id=$1 and dia_semana=$2 and inicio_min < $4 and fim_min > $3`,
        [prof, d, ini, fim],
      );
      if (sob) throw new ErroNegocio("Essa faixa se sobrepõe a outra já cadastrada");
      await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,$3,$4)`, [prof, d, ini, fim]);
    }
  });
}

export async function removerFaixaDaEmpresa(empresaId: string, id: string) {
  await q(`delete from disponibilidade d using profissional p where d.id = $1 and p.id = d.profissional_id and p.empresa_id = $2`, [id, empresaId]);
}

export async function criarBloqueio(empresaId: string, profissionalId: string | null, inicio: Date, fim: Date, motivo: string | null) {
  await q(`insert into bloqueio (empresa_id, profissional_id, inicio, fim, motivo) values ($1,$2,$3,$4,$5)`, [empresaId, profissionalId, inicio, fim, motivo]);
}

export async function removerBloqueioDaEmpresa(empresaId: string, id: string) {
  await q(`delete from bloqueio where id = $1 and empresa_id = $2`, [id, empresaId]);
}
