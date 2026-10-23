import Link from "next/link";
import { atendimentosAReceber, comissoesDoPeriodo, mensalidadesEmAberto, recebimentosPorForma, servicosDoPeriodo, totaisAtendimentos } from "@/lib/consultas/financeiro";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { METODOS, sincronizarEmpresa, usaPlanos } from "@/lib/planos";
import { diaLocal, formatarDataHora, instanteLocal, reais, somarDias } from "@/lib/tempo";
import { registrarPagamentoLocal } from "../../acoes";
import { registrarMensalidadeAcao } from "../../acoes-planos";
import { Cabecalho, Form, inp } from "../../Form";

export const metadata = { title: "Financeiro" };

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default async function Page({ searchParams }: PageProps<"/painel/financeiro">) {
  const u = await usuarioOuLogin();
  const cfg = await configAgendamento(u.empresa_id);
  const sp = await searchParams;
  const hoje = diaLocal(new Date(), cfg.fuso_horario);
  const ok = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const de = ok(sp.de) ? sp.de : `${hoje.slice(0, 8)}01`;
  const ate = ok(sp.ate) ? sp.ate : hoje;
  const ini = instanteLocal(de, 0, cfg.fuso_horario);
  const fim = instanteLocal(somarDias(ate, 1), 0, cfg.fuso_horario);
  const comPlanos = await usaPlanos(u.empresa_id);
  if (comPlanos) await sincronizarEmpresa(u.empresa_id);

  const [[tot], porMetodo, comissoes, porServico, pendentesAtend, mensalidades] = await Promise.all([
    totaisAtendimentos(u.empresa_id, ini, fim),
    recebimentosPorForma(u.empresa_id, ini, fim),
    comissoesDoPeriodo(u.empresa_id, ini, fim),
    servicosDoPeriodo(u.empresa_id, ini, fim),
    atendimentosAReceber(u.empresa_id, ini, fim),
    comPlanos ? mensalidadesEmAberto(u.empresa_id, hoje) : Promise.resolve([]),
  ]);
  const recAtend = porMetodo.reduce((s, m) => s + m.atendimentos, 0);
  const recPlanos = porMetodo.reduce((s, m) => s + m.planos, 0);
  const emAberto = mensalidades.reduce((s, m) => s + m.valor_centavos, 0);
  const taxaCanc = tot.total ? Math.round(((tot.cancelados + tot.faltas) / tot.total) * 100) : 0;
  const nomeMetodo: Record<string, string> = { ...METODOS, local: "No local" };

  return (
    <>
      <Cabecalho
        titulo="Financeiro"
        descricao={`De ${fmtDia(de)} a ${fmtDia(ate)}. ${
          comPlanos ? "Atendimentos avulsos e mensalidades de planos aparecem separados; atendimento coberto pelo plano não é contado como receita de novo." : "Pagamentos, valores a receber e comissões do período."
        }`}
      >
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="grid gap-1">
            <span className="rotulo">De</span>
            <input type="date" name="de" defaultValue={de} className={inp} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Até</span>
            <input type="date" name="ate" defaultValue={ate} className={inp} />
          </label>
          <button className="btn btn-sutil">Filtrar</button>
        </form>
      </Cabecalho>

      <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi r="Recebido" v={reais(recAtend + recPlanos)} d={comPlanos ? `${reais(recAtend)} atendimentos · ${reais(recPlanos)} planos` : "pagamentos registrados"} />
        <Kpi r="Realizado em atendimentos" v={reais(tot.realizado)} d={`${tot.concluidos} concluídos${tot.cobertos ? " · sem a parte coberta por plano" : ""}`} />
        <Kpi r="A receber" v={reais(tot.a_receber + emAberto)} d={comPlanos ? `${reais(tot.a_receber)} atendimentos · ${reais(emAberto)} mensalidades` : "atendimentos concluídos sem pagamento"} />
        <Kpi r="Cancelamentos e faltas" v={`${taxaCanc}%`} d={`${tot.cancelados} canc. · ${tot.faltas} faltas`} />
      </section>
      {tot.cobertos > 0 && (
        <p className="mt-3 text-xs muted">
          {tot.cobertos} atendimento{tot.cobertos > 1 ? "s" : ""} coberto{tot.cobertos > 1 ? "s" : ""} por plano no período ({reais(tot.valor_coberto)} em serviços). Isso é uso de
          benefício, não receita: a receita do plano é a mensalidade paga.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tabela titulo="Atendimentos a receber" cab={["Data", "Cliente", "Serviço", "Saldo", ""]} vazio={pendentesAtend.length === 0 ? "Nada pendente no período." : null}>
          {pendentesAtend.map((a) => (
            <tr key={a.id}>
              <td className="mono whitespace-nowrap text-[13px]">{formatarDataHora(a.inicio, cfg.fuso_horario)}</td>
              <td>{a.cliente}</td>
              <td className="muted">{a.servico}</td>
              <td className="num">{reais(a.saldo)}</td>
              <td className="text-right">
                <form action={registrarPagamentoLocal}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-sutil btn-sm">Recebi</button>
                </form>
              </td>
            </tr>
          ))}
        </Tabela>

        {comPlanos && (
          <section className="card p-4 md:p-5" aria-labelledby="titulo-mensalidades">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="titulo-mensalidades" className="font-medium">
                Mensalidades em aberto
              </h2>
              <Link href="/painel/planos" className="text-xs muted hover:text-white">
                Planos →
              </Link>
            </div>
            {mensalidades.length === 0 ? (
              <p className="py-6 text-center text-sm muted">Nenhuma mensalidade em aberto.</p>
            ) : (
              <ul className="divide-hair">
                {mensalidades.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link href={`/painel/clientes/${m.cliente_id}`} className="hover:underline underline-offset-2">
                        {m.cliente}
                      </Link>
                      <span className="block text-xs muted">
                        {m.plano} · vence {fmtDia(m.vencimento)} {m.atrasada && <span className="text-[#ff9aa2]">· atrasada</span>}
                      </span>
                    </span>
                    <Form action={registrarMensalidadeAcao} botao="Registrar" className="flex items-center gap-2">
                      <input type="hidden" name="cobranca_id" value={m.id} />
                      <span className="num">{reais(m.valor_centavos)}</span>
                      <select name="metodo" aria-label="Forma de pagamento" className="input !w-auto !py-1.5 text-sm" defaultValue="pix">
                        {Object.entries(METODOS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <Tabela
          titulo="Recebimentos por forma de pagamento"
          cab={comPlanos ? ["Forma", "Atendimentos", "Planos", "Total"] : ["Forma", "Valor"]}
          vazio={porMetodo.length === 0 ? "Nenhum pagamento no período." : null}
        >
          {porMetodo.map((m) => (
            <tr key={m.metodo}>
              <td>{nomeMetodo[m.metodo] ?? m.metodo}</td>
              {comPlanos && <td className="num">{reais(m.atendimentos)}</td>}
              {comPlanos && <td className="num">{reais(m.planos)}</td>}
              <td className="num font-medium">{reais(m.atendimentos + m.planos)}</td>
            </tr>
          ))}
        </Tabela>

        <Tabela titulo="Comissões (atendimentos concluídos)" cab={["Profissional", "Atend.", "Valor dos serviços", "Comissão"]}>
          {comissoes.map((c) => (
            <tr key={c.nome}>
              <td>{c.nome}</td>
              <td>{c.atendimentos}</td>
              <td className="num">{reais(c.bruto)}</td>
              <td className="font-semibold num">
                {reais(Math.round((c.bruto * c.pct) / 100))} <span className="faint font-normal">({c.pct}%)</span>
              </td>
            </tr>
          ))}
        </Tabela>
        <Tabela titulo="Serviços mais agendados" cab={["Serviço", "Qtd.", "Valor"]} vazio={porServico.length === 0 ? "Sem agendamentos no período." : null}>
          {porServico.map((s) => (
            <tr key={s.nome}>
              <td>{s.nome}</td>
              <td>{s.qtd}</td>
              <td className="num">{reais(s.valor)}</td>
            </tr>
          ))}
        </Tabela>
      </div>
      <p className="mt-4 text-xs faint">
        Comissões são calculadas sobre o valor dos serviços realizados, inclusive os cobertos por plano. Pagamentos de planos são registrados manualmente: ainda não há
        cobrança automática (depende de um gateway de pagamento).
      </p>
    </>
  );
}

function Kpi({ r, v, d }: { r: string; v: string; d: string }) {
  return (
    <div className="card p-4 md:p-5">
      <div className="text-xs muted">{r}</div>
      <div className="mt-1 text-xl font-semibold num">{v}</div>
      <div className="text-xs faint">{d}</div>
    </div>
  );
}

function Tabela({ titulo, cab, children, vazio }: { titulo: string; cab: string[]; children: React.ReactNode; vazio?: string | null }) {
  return (
    <section className="card overflow-x-auto p-4 md:p-5">
      <h2 className="mb-3 font-medium">{titulo}</h2>
      {vazio ? (
        <p className="py-6 text-center text-sm muted">{vazio}</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr className="text-left muted">
              {cab.map((c, i) => (
                <th key={i} className="pb-2 font-normal">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </section>
  );
}
