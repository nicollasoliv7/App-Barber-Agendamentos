import "server-only";
import { tx, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { expirarPendentes, horariosLivres } from "./disponibilidade";
import { notificar } from "./notificacoes";
import { formatarDataHora, instanteLocal, paraMinutos, reais } from "./tempo";
import { ErroNegocio, type Agendamento, type CampoPersonalizado } from "./tipos";
import { cnpjValido, cpfValido, dataValida, formatarTelefone, normalizarTelefone } from "./validacao";
import { tokenAleatorio } from "./senha";

export interface NovoAgendamento {
  empresaId: string;
  servicoId: string;
  profissionalId: string;
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
    // serializa agendamentos do mesmo profissional (Postgres real); no PGlite a transação já é exclusiva
    await t.query(`select id from profissional where id = $1 for update`, [dados.profissionalId]);
    const cfg = await configAgendamento(dados.empresaId, t);
    const campos = await t.query<CampoPersonalizado>(
      `select * from campo_personalizado where empresa_id = $1 and ativo`,
      [dados.empresaId],
    );
    const extras = validarExtras(campos, dados.extras ?? {});
    const minuto = paraMinutos(dados.hora);
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
    const [emp] = await t.query<{ nome: string; telefone_whatsapp: string | null }>(
      `select nome, telefone_whatsapp from empresa where id = $1`,
      [dados.empresaId],
    );

    const clienteId = await upsertCliente(t, dados.empresaId, nome, telefone, extras);
    const inicio = instanteLocal(dados.dia, minuto, cfg.fuso_horario);
    const fim = new Date(inicio.getTime() + serv.duracao_min * 60000);
    const obrigatorio = cfg.pagamento_modo === "obrigatorio" && !painel;
    const status = obrigatorio ? "pendente_pagamento" : "confirmado"; // R13
    const expira = obrigatorio ? new Date(Date.now() + cfg.pix_expiracao_min * 60000) : null;

    const [ag] = await t.query<Agendamento>(
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
    empresa: { nome: string; telefone_whatsapp: string | null };
  },
) {
  const quando = formatarDataHora(ag.inicio);
  await notificar(t, {
    empresaId: ag.empresa_id,
    agendamentoId: ag.id,
    destino: info.telefone,
    mensagem: `Olá, ${info.cliente.split(" ")[0]}! Seu horário na ${info.empresa.nome} está confirmado: ${info.servico} com ${info.profissional}, ${quando}. Valor: ${reais(ag.preco_centavos)}.`,
  });
  if (info.empresa.telefone_whatsapp) {
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: ag.id,
      destino: info.empresa.telefone_whatsapp,
      mensagem: `Novo agendamento: ${info.cliente} (${formatarTelefone(info.telefone)}) — ${info.servico} com ${info.profissional}, ${quando}.`,
    });
  }
}

async function carregarDoCliente(t: Executor, id: string, clienteId: string) {
  const [ag] = await t.query<Agendamento & { cliente_telefone: string; servico_nome: string; empresa_nome: string }>(
    `select a.*, c.telefone as cliente_telefone, s.nome as servico_nome, e.nome as empresa_nome
     from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
     join empresa e on e.id = a.empresa_id
     where a.id = $1 and a.cliente_id = $2 for update of a`,
    [id, clienteId],
  );
  if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404); // R21
  return ag;
}

/** R22 */
export async function cancelarPeloCliente(id: string, clienteId: string) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await carregarDoCliente(t, id, clienteId);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Este agendamento não pode mais ser cancelado");
    const cfg = await configAgendamento(ag.empresa_id, t);
    if (new Date(ag.inicio).getTime() - Date.now() < cfg.cancelamento_ate_min * 60000)
      throw new ErroNegocio(`Cancelamento permitido até ${cfg.cancelamento_ate_min / 60}h antes. Fale com a barbearia.`);
    await t.query(`update agendamento set status = 'cancelado', cancelado_por = 'cliente' where id = $1`, [id]);
    await t.query(`update pagamento set status = 'cancelado' where agendamento_id = $1 and status = 'pendente'`, [id]);
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      mensagem: `Seu agendamento de ${ag.servico_nome} em ${formatarDataHora(ag.inicio)} foi cancelado.`,
    });
  });
}

/** R23 */
export async function remarcarPeloCliente(id: string, clienteId: string, dia: string, hora: string) {
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
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      mensagem: `Seu ${ag.servico_nome} foi remarcado de ${antigo} para ${formatarDataHora(inicio)}.`,
    });
  });
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
  });
}
