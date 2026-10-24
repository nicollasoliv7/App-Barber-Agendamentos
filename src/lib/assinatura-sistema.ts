import "server-only";
import { q, q1, tx } from "./db";
import { ErroNegocio } from "./tipos";
import { log } from "./log";
import { isUuid } from "./validacao";
import { consultarCheckout, criarCheckout, ErroAbacatePay, pendenciasConfiguracao, permitirDevMode } from "./abacatepay";
import { ehPlanoPago, PLANOS_SISTEMA, type PlanoPago } from "./planos-sistema";

/**
 * Pagamento da assinatura da plataforma pela AbacatePay.
 * - Cada pagamento é avulso e libera um período (1, 3 ou 12 meses). Sem renovação automática.
 * - Pagar antes de vencer soma o novo período ao fim do atual (não se perde nenhum dia).
 * - O plano só é liberado depois de o servidor CONFIRMAR na API da AbacatePay que o
 *   checkout está pago e com o valor certo. O webhook e a volta do checkout só disparam essa conferência.
 */

export type StatusCobranca = "pendente" | "pago" | "expirado" | "cancelado" | "estornado";

interface Cobranca {
  id: string;
  empresa_id: string;
  plano: PlanoPago;
  valor_centavos: number;
  provedor_id: string | null;
  url: string | null;
  status: StatusCobranca;
  criado_em: Date;
}

const REUSO_MIN = 30; // reaproveita um checkout pendente recente do mesmo plano (evita gerar vários)

export async function iniciarPagamento(empresaId: string, usuarioId: string, plano: string): Promise<string> {
  if (!ehPlanoPago(plano)) throw new ErroNegocio("Plano inválido");
  if (pendenciasConfiguracao().length) throw new ErroNegocio("O pagamento online ainda não foi configurado pela plataforma. Tente mais tarde.");
  const cfg = PLANOS_SISTEMA[plano];

  const recente = await q1<Cobranca>(
    `select * from cobranca_sistema
     where empresa_id = $1 and plano = $2 and status = 'pendente' and url is not null
       and criado_em > now() - make_interval(mins => $3)
     order by criado_em desc limit 1`,
    [empresaId, plano, REUSO_MIN],
  );
  if (recente?.provedor_id) {
    const st = await sincronizarCobranca(recente.id).catch(() => null);
    if (st === "pendente") return recente.url!;
  }

  const [c] = await q<{ id: string }>(
    `insert into cobranca_sistema (empresa_id, plano, valor_centavos, criado_por) values ($1,$2,$3,$4) returning id`,
    [empresaId, plano, cfg.centavos, usuarioId],
  );
  try {
    const ck = await criarCheckout({
      plano,
      externalId: c.id,
      retornoUrl: `${process.env.APP_URL!.replace(/\/+$/, "")}/painel/assinatura?cobranca=${c.id}`,
      metadata: { empresa_id: empresaId, cobranca_id: c.id, plano },
    });
    if (ck.amount !== null && ck.amount !== cfg.centavos) {
      log.erro(`[abacatepay] produto do plano ${plano} custa ${ck.amount} centavos; esperado ${cfg.centavos}`);
      await q(`update cobranca_sistema set status='cancelado', provedor_id=$2, atualizado_em=now() where id=$1`, [c.id, ck.id]);
      throw new ErroNegocio("O preço cadastrado na AbacatePay não confere com o do plano. Avise o suporte da plataforma.");
    }
    await q(`update cobranca_sistema set provedor_id=$2, url=$3, dev_mode=$4, atualizado_em=now() where id=$1`, [c.id, ck.id, ck.url, ck.devMode]);
    return ck.url;
  } catch (e) {
    await q(`update cobranca_sistema set status='cancelado', atualizado_em=now() where id=$1 and status='pendente'`, [c.id]);
    if (e instanceof ErroAbacatePay) {
      log.erro("[abacatepay]", e.message);
      throw new ErroNegocio("Não foi possível abrir o pagamento agora. Tente de novo em instantes.");
    }
    throw e;
  }
}

/**
 * Consulta o checkout na AbacatePay e aplica o resultado. Idempotente: pode rodar
 * várias vezes (webhook repetido, volta do checkout, tela aberta) sem somar período em dobro.
 */
export async function sincronizarCobranca(cobrancaId: string): Promise<StatusCobranca | null> {
  if (!isUuid(cobrancaId)) return null;
  const c = await q1<Cobranca>(`select * from cobranca_sistema where id = $1`, [cobrancaId]);
  if (!c?.provedor_id) return c?.status ?? null;
  const ck = await consultarCheckout(c.provedor_id);
  if (ck.id !== c.provedor_id || (ck.externalId && ck.externalId !== c.id)) {
    log.erro(`[abacatepay] checkout ${ck.id} não corresponde à cobrança ${c.id}`);
    return c.status;
  }

  if (ck.status === "PAID") {
    if (ck.devMode && !permitirDevMode()) {
      log.erro(`[abacatepay] cobrança ${c.id}: checkout pago em Dev Mode (teste) recusado em produção; plano não liberado`);
      return c.status;
    }
    const pago = ck.paidAmount ?? ck.amount ?? 0;
    if (pago < c.valor_centavos) {
      log.erro(`[abacatepay] cobrança ${c.id}: pago ${pago} < esperado ${c.valor_centavos}; plano não liberado`);
      return c.status;
    }
    return liberarPeriodo(c.id);
  }
  if (ck.status === "REFUNDED") return estornar(c.id);
  if (ck.status === "EXPIRED" || ck.status === "CANCELLED") {
    const novo = ck.status === "EXPIRED" ? "expirado" : "cancelado";
    await q(`update cobranca_sistema set status=$2, atualizado_em=now() where id=$1 and status='pendente'`, [c.id, novo]);
    return (await q1<{ status: StatusCobranca }>(`select status from cobranca_sistema where id=$1`, [c.id]))!.status;
  }
  return c.status; // PENDING (ou REDEEMED, que não usamos: cupons não são aceitos)
}

async function liberarPeriodo(cobrancaId: string): Promise<StatusCobranca> {
  return tx(async (t) => {
    const [c] = await t.query<Cobranca>(`select * from cobranca_sistema where id = $1 for update`, [cobrancaId]);
    if (c.status === "pago" || c.status === "estornado") return c.status; // já aplicado
    await t.query(`select id from empresa where id = $1 for update`, [c.empresa_id]);
    const meses = PLANOS_SISTEMA[c.plano].meses;
    // começa agora ou, se ainda há período pago, emenda no fim dele
    const [p] = await t.query<{ inicio: Date; fim: Date }>(
      `select i as inicio, i + make_interval(months => $2) as fim
       from (select greatest(now(), coalesce((select valido_ate from assinatura_sistema where empresa_id = $1), now())) as i) x`,
      [c.empresa_id, meses],
    );
    await t.query(
      `update cobranca_sistema set status='pago', pago_em=now(), periodo_inicio=$2, periodo_fim=$3, atualizado_em=now() where id=$1`,
      [c.id, p.inicio, p.fim],
    );
    await t.query(
      `insert into assinatura_sistema (empresa_id, plano, valido_ate, origem) values ($1,$2,$3,'pagamento')
       on conflict (empresa_id) do update set plano=excluded.plano, valido_ate=excluded.valido_ate, origem='pagamento', atualizado_em=now()`,
      [c.empresa_id, c.plano, p.fim],
    );
    log.info(`[abacatepay] cobrança ${c.id} paga: plano ${c.plano} até ${p.fim.toISOString()}`);
    return "pago";
  });
}

/** Estorno feito na AbacatePay: tira do período o tempo que aquela cobrança tinha liberado. */
async function estornar(cobrancaId: string): Promise<StatusCobranca> {
  return tx(async (t) => {
    const [c] = await t.query<Cobranca & { periodo_inicio: Date | null; periodo_fim: Date | null }>(
      `select * from cobranca_sistema where id = $1 for update`,
      [cobrancaId],
    );
    if (c.status !== "pago") return c.status;
    await t.query(`update cobranca_sistema set status='estornado', atualizado_em=now() where id=$1`, [c.id]);
    if (c.periodo_inicio && c.periodo_fim)
      await t.query(
        `update assinatura_sistema set valido_ate = valido_ate - ($2::timestamptz - $3::timestamptz), atualizado_em=now() where empresa_id=$1`,
        [c.empresa_id, c.periodo_fim, c.periodo_inicio],
      );
    log.info(`[abacatepay] cobrança ${c.id} estornada`);
    return "estornado";
  });
}

/** Acha a cobrança a partir dos ids que vierem num evento do webhook (id do checkout ou nosso externalId). */
export async function cobrancaDoEvento(ids: string[]): Promise<string | null> {
  const provedor = ids.filter((x) => x && !isUuid(x));
  const nossos = ids.filter((x) => isUuid(x));
  const r = await q1<{ id: string }>(
    `select id from cobranca_sistema where provedor_id = any($1::text[]) or id = any($2::uuid[]) limit 1`,
    [provedor, nossos],
  );
  return r?.id ?? null;
}

/**
 * Rede de segurança caso um webhook se perca: confere na AbacatePay as cobranças pendentes
 * recentes da empresa (no máximo 3, das últimas 48 h). Chamado ao abrir a tela de assinatura.
 */
export async function conferirPendentes(empresaId: string): Promise<void> {
  const pend = await q<{ id: string }>(
    `select id from cobranca_sistema
     where empresa_id = $1 and status = 'pendente' and provedor_id is not null and criado_em > now() - interval '48 hours'
     order by criado_em desc limit 3`,
    [empresaId],
  );
  for (const p of pend) await sincronizarCobranca(p.id).catch((e: unknown) => log.erro("[abacatepay] conferência de pendente", e));
}

/** Cobrança só é visível para a própria empresa (volta do checkout). */
export async function cobrancaDaEmpresa(empresaId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return !!(await q1(`select 1 from cobranca_sistema where id = $1 and empresa_id = $2`, [id, empresaId]));
}
