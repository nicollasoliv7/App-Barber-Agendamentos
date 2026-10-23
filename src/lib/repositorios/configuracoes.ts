import "server-only";
import { q } from "../db";

/** Gravação das configurações da barbearia (dados, tema, regras, campos extras e unidades). */

export interface DadosEmpresa {
  nome: string;
  slug: string;
  telefone_whatsapp: string | null;
  endereco: string | null;
  maps_url: string | null;
  logo_url: string | null;
  pixel_campanha: string | null;
  multiunidade: boolean;
}

export async function atualizarEmpresa(empresaId: string, d: DadosEmpresa) {
  await q(
    `update empresa set nome=$1, slug=$2, telefone_whatsapp=$3, endereco=$4, maps_url=$5, logo_url=$6, pixel_campanha=$7, multiunidade=$8 where id=$9`,
    [d.nome, d.slug, d.telefone_whatsapp, d.endereco, d.maps_url, d.logo_url, d.pixel_campanha, d.multiunidade, empresaId],
  );
}

/** cores = [primária, secundária, fundo, texto] */
export async function atualizarTema(empresaId: string, cores: string[]) {
  await q(`update config_tema set cor_primaria=$1, cor_secundaria=$2, cor_fundo=$3, cor_texto=$4 where empresa_id=$5`, [...cores, empresaId]);
}

/**
 * campos = [intervalo_slots_min, antecedencia_min_min, janela_max_dias, cancelamento_ate_min,
 *           remarcacao_ate_min, pagamento_minimo_pct, pix_expiracao_min]
 */
export async function atualizarRegras(empresaId: string, campos: number[], modo: string, tipo: string) {
  await q(
    `update config_agendamento set intervalo_slots_min=$1, antecedencia_min_min=$2, janela_max_dias=$3, cancelamento_ate_min=$4,
         remarcacao_ate_min=$5, pagamento_minimo_pct=$6, pix_expiracao_min=$7, pagamento_modo=$8, pagamento_tipo=$9
       where empresa_id=$10`,
    [...campos, modo, tipo, empresaId],
  );
}

export async function atualizarCampo(empresaId: string, id: string, rotulo: string, obrigatorio: boolean, ativo: boolean) {
  await q(`update campo_personalizado set rotulo=$1, obrigatorio=$2, ativo=$3 where id=$4 and empresa_id=$5`, [rotulo, obrigatorio, ativo, id, empresaId]);
}

/** Novo campo extra, sempre no fim da lista. */
export async function criarCampo(empresaId: string, chave: string, rotulo: string, tipo: string, obrigatorio: boolean) {
  await q(
    `insert into campo_personalizado (empresa_id, chave, rotulo, tipo, obrigatorio, ordem, ativo)
         values ($1,$2,$3,$4,$5,(select coalesce(max(ordem),0)+1 from campo_personalizado where empresa_id=$1),true)`,
    [empresaId, chave, rotulo, tipo, obrigatorio],
  );
}

export async function atualizarUnidade(empresaId: string, id: string, nome: string, endereco: string | null, mapsUrl: string | null, ativo: boolean) {
  await q(`update unidade set nome=$1, endereco=$2, maps_url=$3, ativo=$4 where id=$5 and empresa_id=$6`, [nome, endereco, mapsUrl, ativo, id, empresaId]);
}

export async function criarUnidade(empresaId: string, nome: string, endereco: string | null, mapsUrl: string | null) {
  await q(`insert into unidade (nome, endereco, maps_url, empresa_id) values ($1,$2,$3,$4)`, [nome, endereco, mapsUrl, empresaId]);
}
