import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { diaLocal, instanteLocal, reais, somarDias } from "@/lib/tempo";
import { inp } from "../../Form";

export const metadata = { title: "Financeiro" };

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

  const [[tot], porMetodo, comissoes, porServico] = await Promise.all([
    q<{ total: number; concluidos: number; cancelados: number; faltas: number; previsto: number; realizado: number }>(
      `select count(*)::int as total,
              count(*) filter (where status='concluido')::int as concluidos,
              count(*) filter (where status='cancelado')::int as cancelados,
              count(*) filter (where status='faltou')::int as faltas,
              coalesce(sum(preco_centavos) filter (where status in ('confirmado','concluido')),0)::int as previsto,
              coalesce(sum(preco_centavos) filter (where status='concluido'),0)::int as realizado
       from agendamento where empresa_id=$1 and inicio >= $2 and inicio < $3`,
      P,
    ),
    q<{ metodo: string; qtd: number; valor: number }>(
      `select p.metodo, count(*)::int as qtd, sum(p.valor_centavos)::int as valor from pagamento p join agendamento a on a.id = p.agendamento_id
       where a.empresa_id=$1 and p.status='pago' and p.pago_em >= $2 and p.pago_em < $3 group by p.metodo order by valor desc`,
      P,
    ),
    q<{ nome: string; pct: number; atendimentos: number; bruto: number }>(
      `select pr.nome, pr.comissao_pct as pct, count(a.id)::int as atendimentos, coalesce(sum(a.preco_centavos),0)::int as bruto
       from profissional pr left join agendamento a on a.profissional_id = pr.id and a.status='concluido' and a.inicio >= $2 and a.inicio < $3
       where pr.empresa_id=$1 group by pr.id order by bruto desc`,
      P,
    ),
    q<{ nome: string; qtd: number; valor: number }>(
      `select s.nome, count(*)::int as qtd, sum(a.preco_centavos)::int as valor from agendamento a join servico s on s.id = a.servico_id
       where a.empresa_id=$1 and a.inicio >= $2 and a.inicio < $3 and a.status in ('confirmado','concluido') group by s.nome order by valor desc`,
      P,
    ),
  ]);
  const recebido = porMetodo.reduce((s, m) => s + m.valor, 0);
  const taxaCanc = tot.total ? Math.round(((tot.cancelados + tot.faltas) / tot.total) * 100) : 0;
  const nomeMetodo: Record<string, string> = { pix: "Pix", cartao: "Cartão", local: "No local" };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold mr-auto">Financeiro e relatórios</h1>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="grid">
            De <input type="date" name="de" defaultValue={de} className={inp} />
          </label>
          <label className="grid">
            Até <input type="date" name="ate" defaultValue={ate} className={inp} />
          </label>
          <button className="rounded-lg bg-white px-3 py-2 shadow-sm">Filtrar</button>
        </form>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi r="Receita prevista" v={reais(tot.previsto)} d="confirmados + concluídos" />
        <Kpi r="Realizado" v={reais(tot.realizado)} d={`${tot.concluidos} atendimentos concluídos`} />
        <Kpi r="Recebido" v={reais(recebido)} d="pagamentos aprovados" />
        <Kpi r="Cancelamentos e faltas" v={`${taxaCanc}%`} d={`${tot.cancelados} canc. · ${tot.faltas} faltas`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tabela titulo="Comissões (atendimentos concluídos)" cab={["Profissional", "Atend.", "Bruto", "Comissão"]}>
          {comissoes.map((c) => (
            <tr key={c.nome}>
              <td>{c.nome}</td>
              <td>{c.atendimentos}</td>
              <td>{reais(c.bruto)}</td>
              <td className="font-semibold">
                {reais(Math.round((c.bruto * c.pct) / 100))} <span className="text-slate-400 font-normal">({c.pct}%)</span>
              </td>
            </tr>
          ))}
        </Tabela>
        <Tabela titulo="Recebimentos por forma de pagamento" cab={["Forma", "Qtd.", "Valor"]}>
          {porMetodo.length === 0 && (
            <tr>
              <td colSpan={3} className="text-slate-400">
                Nenhum pagamento no período.
              </td>
            </tr>
          )}
          {porMetodo.map((m) => (
            <tr key={m.metodo}>
              <td>{nomeMetodo[m.metodo] ?? m.metodo}</td>
              <td>{m.qtd}</td>
              <td>{reais(m.valor)}</td>
            </tr>
          ))}
        </Tabela>
        <Tabela titulo="Serviços mais agendados" cab={["Serviço", "Qtd.", "Valor"]}>
          {porServico.map((s) => (
            <tr key={s.nome}>
              <td>{s.nome}</td>
              <td>{s.qtd}</td>
              <td>{reais(s.valor)}</td>
            </tr>
          ))}
        </Tabela>
      </div>
    </div>
  );
}

function Kpi({ r, v, d }: { r: string; v: string; d: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{r}</div>
      <div className="text-xl font-bold">{v}</div>
      <div className="text-xs text-slate-400">{d}</div>
    </div>
  );
}

function Tabela({ titulo, cab, children }: { titulo: string; cab: string[]; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm overflow-x-auto">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      <table className="w-full text-sm [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pr-3 [&_tr]:border-b">
        <thead>
          <tr className="text-left text-slate-500">
            {cab.map((c) => (
              <th key={c} className="font-normal pb-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}
