import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora, reais } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { salvarCliente } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Clientes" };

type C = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  telefone_verificado: boolean;
  dados_extras: Record<string, string>;
  total: number;
  concluidos: number;
  cancelados: number;
  gasto: number;
  ultimo: Date | null;
  proximo: Date | null;
};

export default async function Page({ searchParams }: PageProps<"/painel/clientes">) {
  const u = await usuarioOuLogin();
  const sp = await searchParams;
  const busca = typeof sp.q === "string" ? sp.q.trim() : "";
  const clientes = await q<C>(
    `select c.id, c.nome, c.telefone, c.email, c.telefone_verificado, c.dados_extras,
            count(a.id)::int as total,
            count(a.id) filter (where a.status = 'concluido')::int as concluidos,
            count(a.id) filter (where a.status in ('cancelado','faltou'))::int as cancelados,
            coalesce(sum(a.preco_centavos) filter (where a.status = 'concluido'),0)::int as gasto,
            max(a.inicio) filter (where a.inicio < now()) as ultimo,
            min(a.inicio) filter (where a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')) as proximo
     from cliente c left join agendamento a on a.cliente_id = c.id
     where c.empresa_id = $1 and ($2 = '' or c.nome ilike '%' || $2 || '%' or c.telefone like '%' || regexp_replace($2, '\\D', '', 'g') || '%')
     group by c.id order by max(a.inicio) desc nulls last, c.nome limit 200`,
    [u.empresa_id, busca],
  );
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-auto">Clientes</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={busca} placeholder="Nome ou telefone" className={inp} />
          <button className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">Buscar</button>
        </form>
      </header>
      <div className="grid gap-2">
        {clientes.length === 0 && <p className="text-slate-400">Nenhum cliente encontrado.</p>}
        {clientes.map((c) => (
          <details key={c.id} className="rounded-xl bg-white p-4 shadow-sm">
            <summary className="cursor-pointer grid gap-1 md:grid-cols-5 text-sm">
              <span className="font-semibold">{c.nome}</span>
              <span>{formatarTelefone(c.telefone)}</span>
              <span className="text-slate-500">
                {c.total} agend. · {c.cancelados} canc./faltas
              </span>
              <span className="text-slate-500">Gasto: {reais(c.gasto)}</span>
              <span className="text-slate-500">{c.proximo ? `Próximo: ${formatarDataHora(c.proximo)}` : c.ultimo ? `Último: ${formatarDataHora(c.ultimo)}` : ""}</span>
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Form action={salvarCliente} className="grid gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Campo rotulo="Nome">
                  <input name="nome" defaultValue={c.nome} required className={inp} />
                </Campo>
                <Campo rotulo="E-mail">
                  <input name="email" type="email" defaultValue={c.email ?? ""} className={inp} />
                </Campo>
              </Form>
              <div className="text-sm text-slate-600">
                <div>Acesso ao histórico: {c.telefone_verificado ? "senha cadastrada" : "ainda não cadastrou senha"}</div>
                {Object.entries(c.dados_extras ?? {}).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v}
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
