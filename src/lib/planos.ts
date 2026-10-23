import "server-only";
import { tx } from "./db";
import { somarDias } from "./tempo";
import { ErroNegocio } from "./tipos";
import { cicloDe, hojeDaEmpresa, inicioCiclo, METODOS, PERIODOS, sincronizarAssinaturas } from "./planos-ciclos";
import { removerCobertura } from "./planos-cobertura";

/**
 * Planos mensais (módulo OPCIONAL).
 *
 * - plano               → o que a barbearia oferece (preço, período, serviços incluídos e limites)
 * - assinatura          → o cliente no plano; guarda preço e período do momento da adesão
 * - assinatura_cobranca → a mensalidade de cada ciclo (pendente / paga / cancelada). Registro manual:
 *                          não há cobrança automática sem gateway de pagamento.
 * - assinatura_uso      → um atendimento coberto pelo plano. NÃO é pagamento nem receita.
 *
 * Status da assinatura (recalculado por sincronizarAssinaturas):
 *   pendente     → ainda sem nenhuma mensalidade paga
 *   ativa        → em dia (ou renovação ainda dentro da tolerância)
 *   inadimplente → alguma mensalidade vencida há mais de TOLERANCIA_DIAS
 *   cancelada    → encerrada (manual); não volta
 */

// Os módulos do domínio continuam disponíveis por aqui (interface pública inalterada).
export * from "./planos-ciclos";
export * from "./planos-cobertura";
export * from "./planos-indicadores";

// ---------------------------------------------------------------------------
// Planos e assinaturas
// ---------------------------------------------------------------------------

export interface DadosPlano {
  nome: string;
  descricao: string | null;
  beneficios: string | null;
  preco_centavos: number;
  periodo_meses: number;
  ativo: boolean;
  servicos: { servico_id: string; limite_por_ciclo: number | null; valor_cliente_centavos: number }[];
}

/** Cria ou edita um plano. Editar NÃO muda assinaturas existentes (preço e período ficam congelados nelas). */
export async function salvarPlano(empresaId: string, id: string | null, d: DadosPlano): Promise<string> {
  if (d.nome.trim().length < 2) throw new ErroNegocio("Dê um nome ao plano");
  if (!Number.isInteger(d.preco_centavos) || d.preco_centavos <= 0) throw new ErroNegocio("Informe o preço do plano");
  if (!PERIODOS[d.periodo_meses]) throw new ErroNegocio("Período inválido");
  if (d.servicos.length === 0 && !d.beneficios?.trim()) throw new ErroNegocio("Inclua ao menos um serviço ou descreva os benefícios");
  return tx(async (t) => {
    if (d.servicos.length) {
      const ok = await t.query<{ id: string }>(`select id from servico where empresa_id = $1 and id = any($2::uuid[])`, [empresaId, d.servicos.map((s) => s.servico_id)]);
      if (ok.length !== new Set(d.servicos.map((s) => s.servico_id)).size) throw new ErroNegocio("Serviço inválido");
    }
    let planoId = id;
    if (planoId) {
      const r = await t.query(
        `update plano set nome = $3, descricao = $4, beneficios = $5, preco_centavos = $6, periodo_meses = $7, ativo = $8
         where id = $1 and empresa_id = $2 returning id`,
        [planoId, empresaId, d.nome.trim(), d.descricao, d.beneficios, d.preco_centavos, d.periodo_meses, d.ativo],
      );
      if (!r.length) throw new ErroNegocio("Plano não encontrado", 404);
      await t.query(`delete from plano_servico where plano_id = $1`, [planoId]);
    } else {
      const [p] = await t.query<{ id: string }>(
        `insert into plano (empresa_id, nome, descricao, beneficios, preco_centavos, periodo_meses, ativo) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [empresaId, d.nome.trim(), d.descricao, d.beneficios, d.preco_centavos, d.periodo_meses, d.ativo],
      );
      planoId = p.id;
    }
    for (const s of d.servicos)
      await t.query(`insert into plano_servico (plano_id, servico_id, limite_por_ciclo, valor_cliente_centavos) values ($1,$2,$3,$4)`, [
        planoId,
        s.servico_id,
        s.limite_por_ciclo,
        s.valor_cliente_centavos,
      ]);
    return planoId!;
  });
}

export async function criarAssinatura(
  empresaId: string,
  usuarioId: string,
  d: { clienteId: string; planoId: string; inicio: string; pagoAgora: boolean; metodo: string | null },
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio)) throw new ErroNegocio("Data de início inválida");
  if (d.pagoAgora && !(d.metodo && METODOS[d.metodo])) throw new ErroNegocio("Informe como o primeiro pagamento foi recebido");
  return tx(async (t) => {
    const { hoje } = await hojeDaEmpresa(empresaId, t);
    if (d.inicio < somarDias(hoje, -366) || d.inicio > somarDias(hoje, 60)) throw new ErroNegocio("A data de início deve estar entre 1 ano atrás e 60 dias à frente");
    const [cli] = await t.query(`select 1 from cliente where id = $1 and empresa_id = $2`, [d.clienteId, empresaId]);
    if (!cli) throw new ErroNegocio("Cliente não encontrado", 404);
    const [p] = await t.query<{ preco_centavos: number; periodo_meses: number; ativo: boolean }>(
      `select preco_centavos, periodo_meses, ativo from plano where id = $1 and empresa_id = $2`,
      [d.planoId, empresaId],
    );
    if (!p) throw new ErroNegocio("Plano não encontrado", 404);
    if (!p.ativo) throw new ErroNegocio("Este plano está inativo e não aceita novas assinaturas");
    const [aberta] = await t.query(`select 1 from assinatura where cliente_id = $1 and status <> 'cancelada'`, [d.clienteId]);
    if (aberta) throw new ErroNegocio("Este cliente já tem um plano em andamento. Cancele-o antes de trocar.");

    // começa cobrando o ciclo atual (início no passado = cliente que já era assinante antes do sistema)
    const c = cicloDe(d.inicio, p.periodo_meses, hoje) ?? { k: 0, inicio: d.inicio, fim: inicioCiclo(d.inicio, p.periodo_meses, 1) };
    const [a] = await t.query<{ id: string }>(
      `insert into assinatura (empresa_id, cliente_id, plano_id, status, inicio, preco_centavos, periodo_meses, ciclo_inicio, ciclo_fim)
       values ($1,$2,$3,'pendente',$4,$5,$6,$7,$8) returning id`,
      [empresaId, d.clienteId, d.planoId, d.inicio, p.preco_centavos, p.periodo_meses, c.inicio, c.fim],
    );
    await t.query(
      `insert into assinatura_cobranca (empresa_id, assinatura_id, ciclo_inicio, ciclo_fim, vencimento, valor_centavos, status, metodo, pago_em, registrado_por)
       values ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9)`,
      [
        empresaId,
        a.id,
        c.inicio,
        c.fim,
        p.preco_centavos,
        d.pagoAgora ? "paga" : "pendente",
        d.pagoAgora ? d.metodo : null,
        d.pagoAgora ? new Date() : null,
        d.pagoAgora ? usuarioId : null,
      ],
    );
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: a.id });
    return a.id;
  });
}

/** Registra o recebimento de UMA mensalidade (só se estiver pendente: nunca duplica). */
export async function registrarPagamentoMensalidade(empresaId: string, usuarioId: string, cobrancaId: string, metodo: string) {
  if (!METODOS[metodo]) throw new ErroNegocio("Forma de pagamento inválida");
  await tx(async (t) => {
    const r = await t.query<{ assinatura_id: string }>(
      `update assinatura_cobranca set status = 'paga', metodo = $3, pago_em = now(), registrado_por = $4
       where id = $1 and empresa_id = $2 and status = 'pendente' returning assinatura_id`,
      [cobrancaId, empresaId, metodo, usuarioId],
    );
    if (!r.length) throw new ErroNegocio("Essa mensalidade já foi paga ou cancelada");
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: r[0].assinatura_id });
  });
}

/** Desfaz um registro de pagamento feito por engano (volta para pendente). */
export async function desfazerPagamentoMensalidade(empresaId: string, cobrancaId: string) {
  await tx(async (t) => {
    const r = await t.query<{ assinatura_id: string }>(
      `update assinatura_cobranca set status = 'pendente', metodo = null, pago_em = null, registrado_por = null
       where id = $1 and empresa_id = $2 and status = 'paga' returning assinatura_id`,
      [cobrancaId, empresaId],
    );
    if (!r.length) throw new ErroNegocio("Essa mensalidade não está paga");
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: r[0].assinatura_id });
  });
}

/**
 * Cancela a assinatura. Mensalidades pendentes são canceladas (não viram dívida);
 * as pagas ficam no histórico. Atendimentos FUTUROS deixam de ser cobertos; os passados não mudam.
 */
export async function cancelarAssinatura(empresaId: string, id: string, motivo: string | null) {
  await tx(async (t) => {
    const r = await t.query(
      `update assinatura set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = $3
       where id = $1 and empresa_id = $2 and status <> 'cancelada' returning id`,
      [id, empresaId, motivo],
    );
    if (!r.length) throw new ErroNegocio("Assinatura não encontrada ou já cancelada");
    await t.query(`update assinatura_cobranca set status = 'cancelada' where assinatura_id = $1 and status = 'pendente'`, [id]);
    const futuros = await t.query<{ agendamento_id: string }>(
      `select u.agendamento_id from assinatura_uso u join agendamento a on a.id = u.agendamento_id
       where u.assinatura_id = $1 and a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')`,
      [id],
    );
    for (const f of futuros) await removerCobertura(t, f.agendamento_id);
  });
}
