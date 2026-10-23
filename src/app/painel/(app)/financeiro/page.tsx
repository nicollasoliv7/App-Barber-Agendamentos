import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { SALDO, VALOR } from "@/lib/relatorios";
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
  const P = [u.empresa_id, ini, fim];
  const comPlanos = await usaPlanos(u.empresa_id);
  if (comPlanos) await sincronizarEmpresa(u.empresa_id);

  const [[tot], porMetodo, comissoes, porServico, pendentesAtend, mensalidades] = await Promise.all([
    q<{ total: number; concluidos: number; cancelados: number; faltas: number; previsto: number; realizado: number; a_receber: number; cobertos: number; valor_coberto: number }>(
      `select count(*)::int as total,
              count(*) filter (where status='concluido')::int as concluidos,
              count(*) filter (where status='cancelado')::int as cancelados,
              count(*) filter (where status='faltou')::int as faltas,
              coalesce(sum(${VALOR()}) filter (where status in ('confirmado','concluido')),0)::int as previsto,
              coalesce(sum(${VALOR()}) filter (where status='concluido'),0)::int as realizado,
              coalesce(sum(${SALDO()}) filter (where status='concluido'),0)::int as a_receber,
              count(*) filter (where valor_coberto_centavos > 0 and status <> 'cancelado')::int as cobertos,
              coalesce(sum(valor_coberto_centavos) filter (where status <> 'cancelado'),0)::int as valor_coberto
       from agendamento a where empresa_id=$1 and inicio >= $2 and inicio < $3`,
      P,
    ),
    // recebimentos reais: pagamentos de atendimentos + mensalidades pagas (fontes separadas, sem misturar com uso de benefício)
    q<{ metodo: string; atendimentos: number; planos: number }>(
      `select metodo, sum(atend)::int as atendimentos, sum(plano)::int as planos from (
         select case when p.metodo = 'local' then 'local' else p.metodo end as metodo, p.valor_centavos as atend, 0 as plano
         from pagamento p join agendamento a on a.id = p.agendamento_id
         where a.empresa_id=$1 and p.status='pago' and p.pago_em >= $2 and p.pago_em < $3
         union all
         select ac.metodo, 0, ac.valor_centavos from assinatura_cobranca ac
         where ac.empresa_id=$1 and ac.status='paga' and ac.pago_em >= $2 and ac.pago_em < $3
       ) x group by metodo order by sum(atend + plano) desc`,
      P,
    ),
    q<{ nome: string; pct: number; atendimentos: number; bruto: number }>(
      `select pr.nome, pr.comissao_pct as pct, count(a.id)::int as atendimentos, coalesce(sum(a.preco_centavos),0)::int as bruto
       from profissional pr left join agendamento a on a.profissional_id = pr.id and a.status='concluido' and a.inicio >= $2 and a.inicio < $3
       where pr.empresa_id=$1 group by pr.id order by bruto desc`,
      P,
    ),
    q<{ nome: string; qtd: number; valor: number }>(
      `select s.nome, count(*)::int as qtd, sum(${VALOR()})::int as valor from agendamento a join servico s on s.id = a.servico_id
       where a.empresa_id=$1 and a.inicio >= $2 and a.inicio < $3 and a.status in ('confirmado','concluido') group by s.nome order by valor desc`,
      P,
    ),
    q<{ id: string; inicio: Date; cliente: string; servico: string; saldo: number }>(
      `select a.id, a.inicio, c.nome as cliente, s.nome as servico, ${SALDO()}::int as saldo
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.empresa_id=$1 and a.inicio >= $2 and a.inicio < $3 and a.status = 'concluido' and ${SALDO()} > 0
       order by a.inicio desc limit 15`,
      P,
    ),
    comPlanos
      ? q<{ id: string; vencimento: string; valor_centavos: number; cliente: string; cliente_id: string; plano: string; atrasada: boolean }>(
          `select ac.id, ac.vencimento::text as vencimento, ac.valor_centavos, c.nome as cliente, c.id as cliente_id, p.nome as plano,
                  ac.vencimento < $2::date as atrasada
           from assinatura_cobranca ac join assinatura a on a.id = ac.assinatura_id join cliente c on c.id = a.cliente_id join plano p on p.id = a.plano_id
           where ac.empresa_id = $1 and ac.status = 'pendente' order by ac.vencimento limit 30`,
          [u.empresa_id, hoje],
        )
      : Promise.resolve([]),
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
