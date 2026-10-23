import "server-only";
import { tx, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { expirarPendentes, horariosLivres, profissionaisElegiveis } from "./disponibilidade";
import { notificar } from "./notificacoes";
import { formatarDataHora, instanteLocal, paraMinutos, reais } from "./tempo";
import { ErroNegocio, type Agendamento, type CampoPersonalizado } from "./tipos";
import { cnpjValido, cpfValido, dataValida, formatarTelefone, normalizarTelefone } from "./validacao";
import { tokenAleatorio } from "./senha";
import { parametrosModelo, textoConfirmacao, type DadosMensagem } from "./mensagens";
import { aplicarCobertura, avaliarCobertura, removerCobertura } from "./planos";

export interface NovoAgendamento {
  empresaId: string;
  servicoId: string;
  /** id do profissional ou "qualquer" (sem preferência: o sistema escolhe quem está livre) */
  profissionalId: string;
  unidadeId?: string | null;
  dia: string; // YYYY-MM-DD
  hora: string; // HH:MM
  nome: string;
  telefone: string;
  extras?: Record<string, string>;
  origem?: "publico" | "painel";
  observacao?: string;
}

function validarExtras(campos: CampoPersonalizado[], extras: Record<string, string>) {
  const limpos: Record<string, string> = {};
  for (const c of campos) {
    const v = (extras[c.chave] ?? "").trim();
    if (!v) {
      if (c.obrigatorio) throw new ErroNegocio(`Preencha o campo "${c.rotulo}"`);
      continue;
    }
    if (c.tipo === "cpf" && !cpfValido(v)) throw new ErroNegocio("CPF inválido");
    if (c.tipo === "cnpj" && !cnpjValido(v)) throw new ErroNegocio("CNPJ inválido");
    if (c.tipo === "data" && !dataValida(v)) throw new ErroNegocio(`Data inválida em "${c.rotulo}"`);
    limpos[c.chave] = v.slice(0, 500);
  }
  return limpos;
}

async function upsertCliente(t: Executor, empresaId: string, nome: string, telefone: string, extras: Record<string, string>) {
  const [c] = await t.query<{ id: string }>(
    `insert into cliente (empresa_id, nome, telefone, dados_extras) values ($1,$2,$3,$4::jsonb)
     on conflict (empresa_id, telefone) do update
       set nome = excluded.nome, dados_extras = cliente.dados_extras || excluded.dados_extras
     returning id`,
    [empresaId, nome, telefone, JSON.stringify(extras)],
  );
  return c.id;
}

/** R9–R14 */
export async function criarAgendamento(dados: NovoAgendamento): Promise<Agendamento> {
  const nome = dados.nome?.trim().replace(/\s+/g, " ");
  if (!nome || nome.length < 2) throw new ErroNegocio("Informe nome e sobrenome");
  const telefone = normalizarTelefone(dados.telefone);
  if (!telefone) throw new ErroNegocio("Telefone inválido. Use DDD + número.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.dia) || !/^\d{2}:\d{2}$/.test(dados.hora))
    throw new ErroNegocio("Data ou hora inválida");
  const painel = dados.origem === "painel";

  return tx(async (t) => {
    await expirarPendentes(t);
    const cfg = await configAgendamento(dados.empresaId, t);
    const minuto = paraMinutos(dados.hora);

    // Sem preferência: escolhe, entre os profissionais livres nesse horário, o que tem menos atendimentos no dia
    if (dados.profissionalId === "qualquer") {
      const candidatos = await profissionaisElegiveis(t, dados.empresaId, dados.servicoId, dados.unidadeId ?? null);
      const livres: { id: string; carga: number }[] = [];
      for (const p of candidatos) {
        const hs = await horariosLivres(dados.empresaId, dados.servicoId, p.id, dados.dia, { ignorarAntecedencia: painel }, t);
        if (!hs.includes(minuto)) continue;
        const [{ n }] = await t.query<{ n: number }>(
          `select count(*)::int as n from agendamento where profissional_id = $1 and status in ('confirmado','pendente_pagamento','concluido')
             and inicio >= $2 and inicio < $2::timestamptz + interval '1 day'`,
          [p.id, instanteLocal(dados.dia, 0, cfg.fuso_horario)],
        );
        livres.push({ id: p.id, carga: n });
      }
      if (!livres.length) throw new ErroNegocio("Esse horário acabou de ser reservado. Escolha outro.", 409);
      livres.sort((a, b) => a.carga - b.carga);
      dados = { ...dados, profissionalId: livres[0].id };
    }

    // serializa agendamentos do mesmo profissional (Postgres real); no PGlite a transação já é exclusiva
    await t.query(`select id from profissional where id = $1 and empresa_id = $2 for update`, [dados.profissionalId, dados.empresaId]);
    const campos = await t.query<CampoPersonalizado>(
      `select * from campo_personalizado where empresa_id = $1 and ativo`,
      [dados.empresaId],
    );
    const extras = validarExtras(campos, dados.extras ?? {});
    const livres = await horariosLivres(
      dados.empresaId,
      dados.servicoId,
      dados.profissionalId,
      dados.dia,
      { ignorarAntecedencia: painel },
      t,
    );
    if (!livres.includes(minuto)) throw new ErroNegocio("Esse horário acabou de ser reservado. Escolha outro.", 409); // R10

    const [serv] = await t.query<{ nome: string; preco_centavos: number; duracao_min: number; ativo: boolean }>(
      `select nome, preco_centavos, duracao_min, ativo from servico where id = $1`,
      [dados.servicoId],
    );
    if (!serv.ativo && !painel) throw new ErroNegocio("Serviço indisponível");
    const [prof] = await t.query<{ nome: string }>(`select nome from profissional where id = $1`, [dados.profissionalId]);
    const [emp] = await t.query<{ nome: string; slug: string; telefone_whatsapp: string | null }>(
      `select nome, slug, telefone_whatsapp from empresa where id = $1`,
      [dados.empresaId],
    );

    const clienteId = await upsertCliente(t, dados.empresaId, nome, telefone, extras);
    const inicio = instanteLocal(dados.dia, minuto, cfg.fuso_horario);
    const fim = new Date(inicio.getTime() + serv.duracao_min * 60000);
    // R57: serviço coberto 100% pelo plano do cliente não exige Pix (não há o que cobrar de novo)
    const cobertura = await avaliarCobertura(t, { empresa_id: dados.empresaId, cliente_id: clienteId, servico_id: dados.servicoId, inicio });
    const totalmenteCoberto = cobertura.elegivel && (cobertura.valorCliente ?? 0) === 0;
    const obrigatorio = cfg.pagamento_modo === "obrigatorio" && !painel && !totalmenteCoberto;
    const status = obrigatorio ? "pendente_pagamento" : "confirmado"; // R13
    const expira = obrigatorio ? new Date(Date.now() + cfg.pix_expiracao_min * 60000) : null;

    let [ag] = await t.query<Agendamento>(
      `insert into agendamento (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, preco_centavos,
                                status, origem, expira_em, token_publico, observacao)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        dados.empresaId,
        clienteId,
        dados.profissionalId,
        dados.servicoId,
        inicio,
        fim,
        serv.preco_centavos, // R11
        status,
        dados.origem ?? "publico",
        expira,
        tokenAleatorio(18),
        dados.observacao?.slice(0, 500) ?? null,
      ],
    );

    if (status === "confirmado") {
      // R58: cliente com plano ativo que cobre o serviço → registra o uso do benefício (sem nova cobrança)
      const usado = await aplicarCobertura(t, ag);
      if (usado.elegivel) ag = { ...ag, valor_coberto_centavos: usado.valorCoberto ?? 0 };
      await notificarConfirmacao(t, ag, { cliente: nome, telefone, servico: serv.nome, profissional: prof.nome, empresa: emp });
    }
    return ag;
  });
}

export async function notificarConfirmacao(
  t: Executor,
  ag: Agendamento,
  info: {
    cliente: string;
    telefone: string;
    servico: string;
    profissional: string;
    empresa: { nome: string; slug?: string; telefone_whatsapp: string | null };
  },
) {
  const quando = formatarDataHora(ag.inicio);
  const dados: DadosMensagem = {
    cliente: info.cliente,
    empresa: info.empresa.nome,
    servico: info.servico,
    profissional: info.profissional,
    quando,
    link: linkGerenciar(info.empresa.slug, ag),
  };
  await notificar(t, {
    empresaId: ag.empresa_id,
    agendamentoId: ag.id,
    destino: info.telefone,
    tipo: "confirmacao",
    mensagem: `${textoConfirmacao(dados)} ${
      (ag.valor_coberto_centavos ?? 0) >= ag.preco_centavos
        ? "Incluído no seu plano."
        : `Valor: ${reais(ag.preco_centavos - (ag.valor_coberto_centavos ?? 0))}${ag.valor_coberto_centavos ? " (com o desconto do seu plano)" : ""}.`
    }`,
    parametros: parametrosModelo(dados),
  });
  if (info.empresa.telefone_whatsapp) {
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: ag.id,
      tipo: "aviso_empresa",
      destino: info.empresa.telefone_whatsapp,
      mensagem: `Novo agendamento: ${info.cliente} (${formatarTelefone(info.telefone)}) — ${info.servico} com ${info.profissional}, ${quando}.`,
    });
  }
}

/** Link para o cliente gerenciar o agendamento sem login (precisa de APP_URL para virar link absoluto). */
export function linkGerenciar(slug: string | undefined, ag: { id: string; token_publico: string }): string | null {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!base || !slug) return null;
  return `${base}/${slug}/agendamento/${ag.id}?t=${ag.token_publico}`;
}

/** Quem pode mexer no agendamento: o cliente logado OU quem tem o link com o token secreto. */
export type AcessoCliente = string | { clienteId?: string | null; token?: string | null };

async function carregarDoCliente(t: Executor, id: string, acesso: AcessoCliente) {
  const a = typeof acesso === "string" ? { clienteId: acesso, token: null } : acesso;
  if (!a.clienteId && !(a.token && a.token.length >= 20)) throw new ErroNegocio("Acesso negado", 403);
  const [ag] = await t.query<Agendamento & { cliente_telefone: string; servico_nome: string; empresa_nome: string }>(
    `select a.*, c.telefone as cliente_telefone, s.nome as servico_nome, e.nome as empresa_nome
     from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
     join empresa e on e.id = a.empresa_id
     where a.id = $1 and (a.cliente_id = $2::uuid or a.token_publico = $3::text) for update of a`,
    [id, a.clienteId ?? null, a.token ?? null],
  );
  if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404); // R21
  return ag;
}

/** R22 */
export async function cancelarPeloCliente(id: string, clienteId: AcessoCliente) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await carregarDoCliente(t, id, clienteId);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Este agendamento não pode mais ser cancelado");
    const cfg = await configAgendamento(ag.empresa_id, t);
    if (new Date(ag.inicio).getTime() - Date.now() < cfg.cancelamento_ate_min * 60000)
      throw new ErroNegocio(`Cancelamento permitido até ${cfg.cancelamento_ate_min / 60}h antes. Fale com a barbearia.`);
    await t.query(`update agendamento set status = 'cancelado', cancelado_por = 'cliente' where id = $1`, [id]);
    await t.query(`update pagamento set status = 'cancelado' where agendamento_id = $1 and status = 'pendente'`, [id]);
    await removerCobertura(t, id); // R59: cancelado devolve o uso do plano
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      tipo: "cancelamento",
      mensagem: `Seu agendamento de ${ag.servico_nome} em ${formatarDataHora(ag.inicio)} foi cancelado.`,
    });
  });
}

/** R23 */
export async function remarcarPeloCliente(id: string, clienteId: AcessoCliente, dia: string, hora: string) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await carregarDoCliente(t, id, clienteId);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Este agendamento não pode ser remarcado");
    const cfg = await configAgendamento(ag.empresa_id, t);
    if (new Date(ag.inicio).getTime() - Date.now() < cfg.remarcacao_ate_min * 60000)
      throw new ErroNegocio(`Remarcação permitida até ${cfg.remarcacao_ate_min / 60}h antes.`);
    await t.query(`select id from profissional where id = $1 for update`, [ag.profissional_id]);
    const minuto = paraMinutos(hora);
    const livres = await horariosLivres(ag.empresa_id, ag.servico_id, ag.profissional_id, dia, { ignorarAgendamentoId: id }, t);
    if (!livres.includes(minuto)) throw new ErroNegocio("Horário indisponível. Escolha outro.", 409);
    const inicio = instanteLocal(dia, minuto, cfg.fuso_horario);
    const dur = new Date(ag.fim).getTime() - new Date(ag.inicio).getTime();
    const antigo = formatarDataHora(ag.inicio);
    await t.query(`update agendamento set inicio = $2, fim = $3 where id = $1`, [id, inicio, new Date(inicio.getTime() + dur)]);
    await reavaliarCobertura(t, id); // R59: a nova data pode cair em outro ciclo do plano
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      tipo: "remarcacao",
      mensagem: `Seu ${ag.servico_nome} foi remarcado de ${antigo} para ${formatarDataHora(inicio)}.`,
    });
  });
}

/** Recalcula a cobertura do plano depois de mudar data/serviço: remove o uso e aplica de novo, se couber. */
async function reavaliarCobertura(t: Executor, id: string) {
  const [ag] = await t.query<Agendamento>(`select * from agendamento where id = $1`, [id]);
  const tinha = (ag?.valor_coberto_centavos ?? 0) > 0;
  if (!ag || !tinha) return;
  await removerCobertura(t, id);
  await aplicarCobertura(t, ag);
}

/** R26 */
export async function mudarStatusPelaEmpresa(empresaId: string, id: string, status: "confirmado" | "concluido" | "faltou" | "cancelado") {
  return tx(async (t) => {
    const [ag] = await t.query<{ status: string }>(`select status from agendamento where id = $1 and empresa_id = $2`, [id, empresaId]);
    if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
    await t.query(
      `update agendamento set status = $3, cancelado_por = case when $3 = 'cancelado' then 'empresa' else null end,
         expira_em = case when $3 = 'confirmado' then null else expira_em end
       where id = $1 and empresa_id = $2`,
      [id, empresaId, status],
    );
    if (status === "cancelado") await removerCobertura(t, id); // R59
    if (status === "confirmado" && ag.status === "cancelado") {
      const [a] = await t.query<Agendamento>(`select * from agendamento where id = $1`, [id]);
      await aplicarCobertura(t, a); // reaberto: volta a usar o plano, se ainda couber
    }
  });
}

/**
 * R60: editar um agendamento pelo painel (data, hora, profissional e observação).
 * Respeita expediente, folgas e conflitos; ignora a antecedência mínima (como o agendamento manual).
 */
export async function editarPelaEmpresa(
  empresaId: string,
  id: string,
  d: { dia: string; hora: string; profissionalId: string; observacao: string | null },
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dia) || !/^\d{2}:\d{2}$/.test(d.hora)) throw new ErroNegocio("Data ou hora inválida");
  return tx(async (t) => {
    await expirarPendentes(t);
    const [ag] = await t.query<Agendamento & { cliente_telefone: string; servico_nome: string }>(
      `select a.*, c.telefone as cliente_telefone, s.nome as servico_nome from agendamento a
       join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.id = $1 and a.empresa_id = $2 for update of a`,
      [id, empresaId],
    );
    if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Só agendamentos em aberto podem ser editados");
    const [prof] = await t.query(`select 1 from profissional where id = $1 and empresa_id = $2 for update`, [d.profissionalId, empresaId]);
    if (!prof) throw new ErroNegocio("Profissional inválido");
    const cfg = await configAgendamento(empresaId, t);
    const minuto = paraMinutos(d.hora);
    const inicio = instanteLocal(d.dia, minuto, cfg.fuso_horario);
    const mudouHorario = inicio.getTime() !== new Date(ag.inicio).getTime() || d.profissionalId !== ag.profissional_id;
    if (mudouHorario) {
      const livres = await horariosLivres(empresaId, ag.servico_id, d.profissionalId, d.dia, { ignorarAgendamentoId: id, ignorarAntecedencia: true }, t);
      if (!livres.includes(minuto)) throw new ErroNegocio("Horário indisponível para esse profissional. Escolha outro.", 409);
    }
    const dur = new Date(ag.fim).getTime() - new Date(ag.inicio).getTime();
    await t.query(`update agendamento set inicio = $2, fim = $3, profissional_id = $4, observacao = $5 where id = $1`, [
      id,
      inicio,
      new Date(inicio.getTime() + dur),
      d.profissionalId,
      d.observacao?.slice(0, 500) || null,
    ]);
    if (inicio.getTime() !== new Date(ag.inicio).getTime()) {
      await reavaliarCobertura(t, id);
      await notificar(t, {
        empresaId,
        agendamentoId: id,
        destino: ag.cliente_telefone,
        tipo: "remarcacao",
        mensagem: `Seu ${ag.servico_nome} foi remarcado de ${formatarDataHora(ag.inicio)} para ${formatarDataHora(inicio)}.`,
      });
    }
  });
}
