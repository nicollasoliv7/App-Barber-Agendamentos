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
import { aplicarCobertura, avaliarCobertura } from "./planos-cobertura";
import { conferirVagaSeNovo } from "./planos-sistema";

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

async function upsertCliente(t: Executor, empresaId: string, nome: string, telefone: string, extras: Record<string, string>, painel: boolean) {
  await conferirVagaSeNovo(t, empresaId, telefone, painel ? "painel" : "publico"); // limite do plano Gratuito
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

    const clienteId = await upsertCliente(t, dados.empresaId, nome, telefone, extras, painel);
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

// Ações do cliente e da barbearia ficam em módulos próprios; a interface pública continua aqui.
export * from "./agendamentos-cliente";
export * from "./agendamentos-empresa";
