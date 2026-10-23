import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora, reais } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { Icone, Vazio } from "@/components/ui";
import { novoCliente } from "../../acoes";
import { RECORRENTE_VISITAS } from "@/lib/relatorios";
import { usaPlanos } from "@/lib/planos";
import { Cabecalho, Campo, Form } from "../../Form";

export const metadata = { title: "Clientes" };
const POR_PAGINA = 30;

type C = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: string;
  visitas: number;
  faltas: number;
  gasto: number;
  ultimo: Date | null;
  proximo: Date | null;
  criado_em: Date;
  recentes: number;
  plano: string | null;
  plano_status: string | null;
};

const SEGMENTOS = [
  ["todos", "Todos"],
  ["proximo", "Com horário marcado"],
  ["sumidos", "Sem visita há 45+ dias"],
  ["recorrentes", "Recorrentes"],
  ["novos", "Novos (30 dias)"],
  ["importados", "Importados"],
  ["assinantes", "Com plano"],
] as const;
const ORDENS = [
  ["recentes", "Última visita"],
  ["gasto", "Maior gasto"],
  ["visitas", "Mais visitas"],
  ["nome", "Nome (A–Z)"],
] as const;

export default async function Page({ searchParams }: PageProps<"/painel/clientes">) {
  const u = await usuarioOuLogin();
  const sp = await searchParams;
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const busca = v("q").trim().slice(0, 80);
  const comPlanos = await usaPlanos(u.empresa_id);
  const segmentos = SEGMENTOS.filter(([k]) => k !== "assinantes" || comPlanos); // "Com plano" só para quem usa planos
  const seg = segmentos.some(([k]) => k === v("seg")) ? v("seg") : "todos";
  const ordem = ORDENS.some(([k]) => k === v("ordem")) ? v("ordem") : "recentes";
  const pagina = Math.max(0, Number(v("pagina")) || 0);
  const filtroSeg: Record<string, string> = {
    todos: "true",
    proximo: "proximo is not null",
    sumidos: "ultimo < now() - interval '45 days' and proximo is null",
    novos: "criado_em >= now() - interval '30 days'",
    importados: "origem = 'importacao'",
    recorrentes: `recentes >= ${RECORRENTE_VISITAS}`,
    assinantes: "plano is not null",
  };
  const ordemSql: Record<string, string> = {
    recentes: "ultimo desc nulls last, nome",
    gasto: "gasto desc, nome",
    visitas: "visitas desc, nome",
    nome: "nome",
  };

  const [clientes, [{ total }]] = await Promise.all([
    q<C>(
      `with base as (
         select c.id, c.nome, c.telefone, c.email, c.origem, c.criado_em,
                count(a.id) filter (where a.status = 'concluido')::int as visitas,
                count(a.id) filter (where a.status = 'faltou')::int as faltas,
                coalesce(sum(a.preco_centavos - a.valor_coberto_centavos) filter (where a.status = 'concluido'),0)::int as gasto,
                count(a.id) filter (where a.status = 'concluido' and a.inicio >= now() - interval '90 days' and a.inicio <= now())::int as recentes,
                (select p.nome from assinatura s join plano p on p.id = s.plano_id where s.cliente_id = c.id and s.status <> 'cancelada' limit 1) as plano,
                (select s.status from assinatura s where s.cliente_id = c.id and s.status <> 'cancelada' limit 1) as plano_status,
                max(a.inicio) filter (where a.inicio < now() and a.status in ('concluido','confirmado')) as ultimo,
                min(a.inicio) filter (where a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')) as proximo
         from cliente c left join agendamento a on a.cliente_id = c.id
         where c.empresa_id = $1
           and ($2 = '' or c.nome ilike '%' || $2 || '%' or c.email ilike '%' || $2 || '%'
                or c.telefone like '%' || nullif(regexp_replace($2, '\\D', '', 'g'), '') || '%')
         group by c.id)
       select * from base where ${filtroSeg[seg]} order by ${ordemSql[ordem]} limit ${POR_PAGINA + 1} offset ${pagina * POR_PAGINA}`,
      [u.empresa_id, busca],
    ),
    q<{ total: number }>(`select count(*)::int as total from cliente where empresa_id = $1`, [u.empresa_id]),
  ]);
  const temMais = clientes.length > POR_PAGINA;
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(busca ? { q: busca } : {}), seg, ordem, ...extra });
    return `?${p.toString()}`;
  };

  return (
    <>
      <Cabecalho titulo="Clientes" descricao={`${total} cliente${total === 1 ? "" : "s"} na sua base. Busque, segmente e abra a ficha para ver o histórico.`}>
        <Link href="/painel/clientes/importar" className="btn btn-key">
          <Icone nome="upload" tamanho={15} /> Importar clientes
        </Link>
      </Cabecalho>

      <div className="card mb-4 p-3">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative min-w-[220px] flex-1">
            <Icone nome="busca" tamanho={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
            <input name="q" defaultValue={busca} placeholder="Nome, telefone ou e-mail" aria-label="Buscar cliente" className="input !pl-9" />
          </div>
          <input type="hidden" name="seg" value={seg} />
          <select name="ordem" defaultValue={ordem} aria-label="Ordenar por" className="input !w-auto">
            {ORDENS.map(([k, r]) => (
              <option key={k} value={k}>
                Ordenar: {r}
              </option>
            ))}
          </select>
          <button className="btn btn-sutil">Buscar</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Segmentos">
          {segmentos.map(([k, r]) => (
            <Link key={k} href={link({ seg: k })} data-ativo={seg === k} className="chip !py-1.5 !text-[13px]">
              {r}
            </Link>
          ))}
        </div>
      </div>

      {clientes.length === 0 ? (
        <Vazio
          titulo={total === 0 ? "Nenhum cliente ainda" : "Nenhum cliente encontrado"}
          texto={total === 0 ? "Os clientes aparecem aqui quando agendam. Você também pode importar sua base de outro sistema." : "Tente outra busca ou segmento."}
        >
          {total === 0 && (
            <Link href="/painel/clientes/importar" className="btn btn-key">
              Importar clientes
            </Link>
          )}
        </Vazio>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tabela min-w-[820px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="text-right">Visitas</th>
                <th className="text-right">Gasto</th>
                <th>Última visita</th>
                <th>Próximo horário</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {clientes.slice(0, POR_PAGINA).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/painel/clientes/${c.id}`} className="font-medium hover:underline underline-offset-2">
                      {c.nome}
                    </Link>
                    <div className="text-xs muted">
                      {formatarTelefone(c.telefone)}
                      {c.email ? ` · ${c.email}` : ""}
                    </div>
                    {(c.plano || c.recentes >= RECORRENTE_VISITAS) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.plano && (
                          <span className={`badge ${c.plano_status === "ativa" ? "badge-ok" : "badge-warn"}`} title={`Plano ${c.plano_status}`}>
                            {c.plano}
                          </span>
                        )}
                        {c.recentes >= RECORRENTE_VISITAS && <span className="badge badge-neutro">Recorrente</span>}
                      </div>
                    )}
                  </td>
                  <td className="text-right num">
                    {c.visitas}
                    {c.faltas > 0 && <div className="text-xs text-[#ffcf8a]">{c.faltas} falta{c.faltas > 1 ? "s" : ""}</div>}
                  </td>
                  <td className="text-right num">{reais(c.gasto)}</td>
                  <td className="text-sm muted">{c.ultimo ? formatarDataHora(c.ultimo) : "—"}</td>
                  <td className="text-sm">{c.proximo ? <span className="text-[var(--amber)]">{formatarDataHora(c.proximo)}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge badge-sem-ponto">{c.origem === "importacao" ? "Importado" : c.origem === "painel" ? "Manual" : "Agendou online"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pagina > 0 || temMais) && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
          {pagina > 0 ? (
            <Link className="btn btn-sutil" href={link({ pagina: String(pagina - 1) })}>
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">Página {pagina + 1}</span>
          {temMais ? (
            <Link className="btn btn-sutil" href={link({ pagina: String(pagina + 1) })}>
              Próximos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <details className="card mt-6 p-4 md:p-5">
        <summary className="cursor-pointer font-medium">+ Cadastrar cliente manualmente</summary>
        <Form action={novoCliente} className="mt-4 grid gap-3 md:grid-cols-2" botao="Cadastrar" resetar>
          <Campo rotulo="Nome">
            <input name="nome" required className="input" />
          </Campo>
          <Campo rotulo="Telefone (WhatsApp)">
            <input name="telefone" required inputMode="tel" placeholder="(11) 91234-5678" className="input" />
          </Campo>
          <Campo rotulo="E-mail (opcional)">
            <input name="email" type="email" className="input" />
          </Campo>
          <Campo rotulo="Observações (opcional)">
            <input name="observacoes" className="input" />
          </Campo>
        </Form>
      </details>
    </>
  );
}
