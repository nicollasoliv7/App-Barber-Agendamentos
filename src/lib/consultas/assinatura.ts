import "server-only";
import { q } from "../db";
import type { PlanoPago } from "../planos-sistema";
import type { StatusCobranca } from "../assinatura-sistema";

export interface LinhaCobrancaSistema {
  id: string;
  plano: PlanoPago;
  valor_centavos: number;
  status: StatusCobranca;
  dev_mode: boolean;
  criado_em: Date;
  pago_em: Date | null;
  periodo_inicio: Date | null;
  periodo_fim: Date | null;
}

/** Histórico de cobranças da assinatura da plataforma (só da empresa). */
export async function cobrancasSistema(empresaId: string, limite = 20): Promise<LinhaCobrancaSistema[]> {
  return q<LinhaCobrancaSistema>(
    `select id, plano, valor_centavos, status, dev_mode, criado_em, pago_em, periodo_inicio, periodo_fim
     from cobranca_sistema where empresa_id = $1 and provedor_id is not null
     order by criado_em desc limit $2`,
    [empresaId, limite],
  );
}
