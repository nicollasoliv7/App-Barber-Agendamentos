import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { expirarPendentes } from "@/lib/disponibilidade";
import { diaLocal, formatarDataHora, formatarDia, instanteLocal, minutosLocal, hhmm, reais, somarDias } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { estornarPagamentos, mudarStatus, novoAgendamentoManual, registrarPagamentoLocal } from "../../acoes";
import { Cabecalho, Campo, Form, inp } from "../../Form";
import { Icone, StatusBadge } from "@/components/ui";
import { linkGerenciar } from "@/lib/agendamentos";
import { tx } from "@/lib/db";
import { avaliarCobertura, type Cobertura } from "@/lib/planos";
import { cobrarAvulsoAcao, editarAgendamentoAcao, usarPlanoAcao } from "../../acoes-planos";
import { linkWhatsapp, textoConfirmacao } from "@/lib/mensagens";

export const metadata = { title: "Agenda" };
/** horário ainda não chegou (fora do render, para manter o componente puro) */
const aindaVai = (d: Date) => new Date(d).getTime() > Date.now();


type Linha = {
  id: string;
  inicio: Date;
  fim: Date;
  status: string;
  origem: string;
  preco_centavos: number;
  cliente: string;
  telefone: string;
  servico: string;
  profissional_id: string;
  pago: number;
  cancelado_por: string | null;
  token_publico: string;
  valor_coberto_centavos: number;
  cliente_id: string;
  servico_id: string;
  empresa_id: string;
  observacao: string | null;
  tem_plano: boolean;
  plano: string | null;
};

export default async function Agenda({ searchParams }: PageProps<"/painel/agenda">) {
  const u = await usuarioOuLogin();
  await expirarPendentes();
  const cfg = await configAgendamento(u.empresa_id);
  const sp = await searchParams;
  const hoje = diaLocal(new Date(), cfg.fuso_horario);
  const dia = typeof sp.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hoje;
  const de = instanteLocal(dia, 0, cfg.fuso_horario);
  const ate = instanteLocal(somarDias(dia, 1), 0, cfg.fuso_horario);

  const [profs, servicos, ags, bloqueios] = await Promise.all([
    q<{ id: string; nome: string }>(`select id, nome from profissional where empresa_id = $1 and ativo order by nome`, [u.empresa_id]),
    q<{ id: string; nome: string; duracao_min: number }>(
      `select id, nome, duracao_min from servico where empresa_id = $1 and ativo order by ordem, nome`,
      [u.empresa_id],
    ),
    q<Linha>(
      `select a.id, a.inicio, a.fim, a.status, a.origem, a.preco_centavos, a.profissional_id, a.cancelado_por, a.token_publico, a.valor_coberto_centavos, a.cliente_id, a.servico_id, a.empresa_id, a.observacao,
              exists (select 1 from assinatura s where s.cliente_id = a.cliente_id and s.status <> 'cancelada') as tem_plano,
              (select p.nome from assinatura_uso us join assinatura s on s.id = us.assinatura_id join plano p on p.id = s.plano_id where us.agendamento_id = a.id) as plano,
              c.nome as cliente, c.telefone, s.nome as servico,
              coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.empresa_id = $1 and a.inicio >= $2 and a.inicio < $3 order by a.inicio`,
      [u.empresa_id, de, ate],
    ),
    q<{ profissional_id: string | null; inicio: Date; fim: Date; motivo: string | null }>(
      `select profissional_id, inicio, fim, motivo from bloqueio where empresa_id = $1 and inicio < $3 and fim > $2`,
      [u.empresa_id, de, ate],
    ),
  ]);

  // planos (módulo opcional): só consulta para clientes que têm assinatura
  const elegiveis = new Map<string, Cobertura>();
  const candidatos = ags.filter((a) => a.tem_plano && a.valor_coberto_centavos === 0 && a.pago === 0 && ["confirmado", "concluido"].includes(a.status));
  if (candidatos.length)
    await tx(async (t) => {
      for (const a of candidatos) elegiveis.set(a.id, await avaliarCobertura(t, a));
    });

  const ativos = ags.filter((a) => a.status !== "cancelado");
  const previsto = ativos.filter((a) => a.status !== "faltou").reduce((s, a) => s + a.preco_centavos - a.valor_coberto_centavos, 0); // sem a parte coberta por plano
  const recebido = ags.reduce((s, a) => s + a.pago, 0);
  const hm = (d: Date) => hhmm(minutosLocal(new Date(d), cfg.fuso_horario));

  return (
    <>
      <Cabecalho titulo="Agenda do dia" descricao="Atendimentos por profissional. Marque como concluído, falta ou recebido no local.">
        <Link href={`/painel/agenda?dia=${somarDias(dia, -1)}`} className="btn btn-sutil" aria-label="Dia anterior">
          ‹
        </Link>
        <form className="flex gap-2">
          <input type="date" name="dia" defaultValue={dia} className="input !w-auto" aria-label="Escolher dia" />
          <button className="btn btn-sutil">Ir</button>
        </form>
        <Link href={`/painel/agenda?dia=${somarDias(dia, 1)}`} className="btn btn-sutil" aria-label="Próximo dia">
          ›
        </Link>
        {dia !== hoje && (
          <Link href="/painel/agenda" className="btn btn-key">
            Hoje
          </Link>
        )}
      </Cabecalho>

      <p className="-mt-3 mb-5 text-sm muted first-letter:uppercase">{formatarDia(dia)}</p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo do dia">
        <Resumo rotulo="Agendamentos" valor={String(ativos.length)} />
        <Resumo rotulo="Aguardando Pix" valor={String(ags.filter((a) => a.status === "pendente_pagamento").length)} />
        <Resumo rotulo="Previsto no dia" valor={reais(previsto)} />
        <Resumo rotulo="Recebido" valor={reais(recebido)} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {profs.map((p) => {
          const lista = ags.filter((a) => a.profissional_id === p.id);
          const bls = bloqueios.filter((b) => !b.profissional_id || b.profissional_id === p.id);
          return (
            <div key={p.id} className="card min-w-0 p-4">
              <h2 className="mb-3 flex items-center justify-between font-medium">
                <span className="flex items-center gap-2">
                  <Icone nome="pessoa" tamanho={15} className="muted" /> {p.nome}
                </span>
                <span className="text-xs muted">{lista.filter((a) => a.status !== "cancelado").length} atend.</span>
              </h2>
              {bls.map((b, i) => (
                <div key={i} className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs muted">
                  <Icone nome="bloqueio" tamanho={13} /> Bloqueado {hm(b.inicio)}–{hm(b.fim)} {b.motivo ? `· ${b.motivo}` : ""}
                </div>
              ))}
              {lista.length === 0 && <p className="py-6 text-center text-sm muted">Nenhum agendamento.</p>}
              <ul className="grid gap-2">
                {lista.map((a) => (
                  <li key={a.id} className={`min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-sm ${a.status === "cancelado" ? "opacity-55" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">
                          <span className="mono text-[var(--amber)]">
                            {hm(a.inicio)}–{hm(a.fim)}
                          </span>{" "}
                          · {a.servico}
                        </div>
                        <div className="truncate">
                          {a.cliente} ·{" "}
                          <a className="text-[#ffcf8a] hover:underline" href={`https://wa.me/55${a.telefone}`} target="_blank" rel="noreferrer">
                            {formatarTelefone(a.telefone)}
                          </a>
                        </div>
                        <div className="text-xs muted">
                          {reais(a.preco_centavos)}
                          {a.pago > 0 && ` · pago ${reais(a.pago)}`}
                          {a.origem === "painel" && " · manual"}
                        </div>
                        {a.valor_coberto_centavos > 0 && (
                          <div className="mt-1 text-xs text-[#7ee2b0]">
                            Plano{a.plano ? ` ${a.plano}` : ""}:{" "}
                            {a.valor_coberto_centavos >= a.preco_centavos
                              ? "coberto, sem cobrança"
                              : `cobre ${reais(a.valor_coberto_centavos)}, cliente paga ${reais(a.preco_centavos - a.valor_coberto_centavos)}`}
                          </div>
                        )}
                        {elegiveis.get(a.id) && !elegiveis.get(a.id)!.elegivel && elegiveis.get(a.id)!.motivo !== "Cliente sem plano" && (
                          <div className="mt-1 text-xs faint">Plano: {elegiveis.get(a.id)!.motivo}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <StatusBadge status={a.status} />
                        {a.status === "confirmado" && aindaVai(a.inicio) && (
                          <a
                            href={linkWhatsapp(
                              a.telefone,
                              textoConfirmacao({
                                cliente: a.cliente,
                                empresa: u.empresa_nome,
                                servico: a.servico,
                                profissional: p.nome,
                                quando: formatarDataHora(a.inicio, cfg.fuso_horario),
                                link: linkGerenciar(u.empresa_slug, a),
                              }),
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#7ee2b0] hover:underline"
                            title="Abre o seu WhatsApp com a confirmação pronta para enviar"
                          >
                            <Icone nome="whatsapp" tamanho={13} /> WhatsApp
                          </a>
                        )}
                      </div>
                    </div>
                    {a.status === "cancelado" && a.pago > 0 && (
                      <form action={estornarPagamentos} className="mt-2">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn btn-sutil btn-sm">Estornar pagamento (teste)</button>
                      </form>
                    )}
                    {a.status !== "cancelado" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["concluido", "faltou", "cancelado"] as const)
                          .filter((s) => s !== a.status)
                          .map((s) => (
                            <form key={s} action={mudarStatus}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="status" value={s} />
                              <button className={`btn btn-sm ${s === "cancelado" ? "btn-perigo" : "btn-sutil"}`}>
                                {s === "concluido" ? "Concluir" : s === "faltou" ? "Faltou" : "Cancelar"}
                              </button>
                            </form>
                          ))}
                        {a.status !== "confirmado" && (
                          <form action={mudarStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="confirmado" />
                            <button className="btn btn-sutil btn-sm">Confirmar</button>
                          </form>
                        )}
                        {elegiveis.get(a.id)?.elegivel && (
                          <form action={usarPlanoAcao}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn btn-sutil btn-sm" title={`Registrar o uso do plano ${elegiveis.get(a.id)!.plano}`}>
                              Usar plano
                            </button>
                          </form>
                        )}
                        {a.valor_coberto_centavos > 0 && (
                          <form action={cobrarAvulsoAcao}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn btn-sutil btn-sm" title="Desfaz o uso do plano neste atendimento">
                              Cobrar avulso
                            </button>
                          </form>
                        )}
                        {a.pago < a.preco_centavos - a.valor_coberto_centavos && (
                          <form action={registrarPagamentoLocal}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn btn-sutil btn-sm">Recebi no local</button>
                          </form>
                        )}
                      </div>
                    )}
                    {(a.status === "confirmado" || a.status === "pendente_pagamento") && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs muted">Editar</summary>
                        <Form action={editarAgendamentoAcao} botao="Salvar alterações" className="mt-2 grid grid-cols-2 gap-2 [&_input]:min-w-0 [&_select]:min-w-0">
                          <input type="hidden" name="id" value={a.id} />
                          <Campo rotulo="Dia">
                            <input type="date" name="dia" defaultValue={dia} required className={inp} />
                          </Campo>
                          <Campo rotulo="Hora">
                            <input type="time" name="hora" defaultValue={hm(a.inicio)} step={300} required className={inp} />
                          </Campo>
                          <Campo rotulo="Profissional" className="col-span-2">
                            <select name="profissional" defaultValue={a.profissional_id} className={inp}>
                              {profs.map((pp) => (
                                <option key={pp.id} value={pp.id}>
                                  {pp.nome}
                                </option>
                              ))}
                            </select>
                          </Campo>
                          <Campo rotulo="Observação" className="col-span-2">
                            <input name="observacao" defaultValue={a.observacao ?? ""} maxLength={500} className={inp} />
                          </Campo>
                        </Form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="card mt-6 p-4 md:p-5">
        <h2 className="mb-1 font-medium">Novo agendamento manual</h2>
        <p className="mb-4 text-xs muted">Para quem marcou por telefone ou no balcão. Respeita expediente, folgas e conflitos; ignora a antecedência mínima.</p>
        <Form action={novoAgendamentoManual} className="grid gap-3 md:grid-cols-4" botao="Agendar" resetar>
          <Campo rotulo="Serviço">
            <select name="servico" required className={inp}>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} ({s.duracao_min} min)
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Profissional">
            <select name="profissional" required className={inp}>
              {profs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Dia">
            <input type="date" name="dia" required defaultValue={dia} className={inp} />
          </Campo>
          <Campo rotulo="Hora">
            <input type="time" name="hora" required step={300} className={inp} />
          </Campo>
          <Campo rotulo="Nome do cliente" className="md:col-span-2">
            <input name="nome" required className={inp} autoComplete="off" />
          </Campo>
          <Campo rotulo="Telefone (WhatsApp)">
            <input name="telefone" required inputMode="tel" placeholder="(11) 91234-5678" className={inp} />
          </Campo>
          <Campo rotulo="Observação">
            <input name="observacao" className={inp} />
          </Campo>
        </Form>
      </section>
    </>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs muted">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold num">{valor}</div>
    </div>
  );
}
