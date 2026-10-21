import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { expirarPendentes } from "@/lib/disponibilidade";
import { filtrosParaQuery, lerFiltros, whereAgendamentos } from "@/lib/relatorios";
import { formatarDataHora, instanteLocal, reais, somarDias } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { Icone, StatusBadge, Vazio } from "@/components/ui";
import { mudarStatus } from "../../acoes";
import { Cabecalho } from "../../Form";
import Filtros from "../../componentes/Filtros";

export const metadata = { title: "Agendamentos" };
const POR_PAGINA = 25;

type Linha = {
  id: string;
  inicio: Date;
  status: string;
  origem: string;
  preco_centavos: number;
  pago: number;
  cliente_id: string;
  cliente: string;
  telefone: string;
  servico: string;
  profissional: string;
};

const PERIODOS = [
  ["hoje", "Hoje"],
  ["proximos", "Próximos 30 dias"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["mes", "Este mês"],
  ["mes_passado", "Mês passado"],
] as const;

export default async function Agendamentos({ searchParams }: PageProps<"/painel/agendamentos">) {
  const u = await usuarioOuLogin();
  await expirarPendentes();
  const cfg = await configAgendamento(u.empresa_id);
  const sp = await searchParams;
  const f = lerFiltros(sp, cfg.fuso_horario, "30d");
  const pagina = Math.max(0, Number(typeof sp.pagina === "string" ? sp.pagina : 0) || 0);
  const ini = instanteLocal(f.de, 0, cfg.fuso_horario);
  const fim = instanteLocal(somarDias(f.ate, 1), 0, cfg.fuso_horario);
  const { where, params } = whereAgendamentos(u.empresa_id, f, ini, fim);
  const ordem = f.periodo === "proximos" ? "a.inicio asc" : "a.inicio desc";

  const [linhas, [tot], servicos, profissionais] = await Promise.all([
    q<Linha>(
      `select a.id, a.inicio, a.status, a.origem, a.preco_centavos, a.cliente_id,
              coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago,
              c.nome as cliente, c.telefone, s.nome as servico, pr.nome as profissional
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join profissional pr on pr.id = a.profissional_id
       where ${where} order by ${ordem} limit ${POR_PAGINA + 1} offset ${pagina * POR_PAGINA}`,
      params,
    ),
    q<{ n: number; valor: number }>(
      `select count(*)::int as n, coalesce(sum(a.preco_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as valor
       from agendamento a where ${where}`,
      params,
    ),
    q<{ id: string; nome: string }>(`select id, nome from servico where empresa_id = $1 order by ordem, nome`, [u.empresa_id]),
    q<{ id: string; nome: string }>(`select id, nome from profissional where empresa_id = $1 order by nome`, [u.empresa_id]),
  ]);
  const temMais = linhas.length > POR_PAGINA;
  const qs = filtrosParaQuery(f);

  return (
    <>
      <Cabecalho titulo="Agendamentos" descricao="Histórico completo com filtros. Clique no cliente para abrir a ficha.">
        <a href={`/painel/exportar?${qs}`} className="btn btn-sutil">
          <Icone nome="download" tamanho={15} /> Exportar CSV
        </a>
      </Cabecalho>
      <Filtros servicos={servicos} profissionais={profissionais} periodoAtual={f.periodo} de={f.de} ate={f.ate} busca periodos={PERIODOS} />

      <p className="mb-3 text-sm muted" role="status">
        {tot.n} agendamento{tot.n === 1 ? "" : "s"} · {reais(tot.valor)} em confirmados/concluídos
      </p>

      {linhas.length === 0 ? (
        <Vazio titulo="Nenhum agendamento encontrado" texto="Ajuste o período ou limpe os filtros." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tabela min-w-[860px]">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th className="text-right">Valor</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, POR_PAGINA).map((a) => (
                <tr key={a.id}>
                  <td className="mono whitespace-nowrap text-[13px]">{formatarDataHora(a.inicio, cfg.fuso_horario)}</td>
                  <td>
                    <Link href={`/painel/clientes/${a.cliente_id}`} className="hover:underline underline-offset-2">
                      {a.cliente}
                    </Link>
                    <div className="text-xs muted">{formatarTelefone(a.telefone)}</div>
                  </td>
                  <td>{a.servico}</td>
                  <td className="muted">{a.profissional}</td>
                  <td className="text-right num">
                    {reais(a.preco_centavos)}
                    {a.pago > 0 && <div className="text-xs text-[#7ee2b0]">pago {reais(a.pago)}</div>}
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                    {a.origem === "painel" && <div className="mt-1 text-[11px] faint">manual</div>}
                  </td>
                  <td className="text-right">
                    {(a.status === "confirmado" || a.status === "pendente_pagamento") && (
                      <div className="flex justify-end gap-1">
                        <form action={mudarStatus}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="concluido" />
                          <button className="btn btn-sutil btn-sm" title="Marcar como concluído">
                            <Icone nome="check" tamanho={13} />
                            <span className="sr-only">Concluir</span>
                          </button>
                        </form>
                        <form action={mudarStatus}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="faltou" />
                          <button className="btn btn-sutil btn-sm" title="Cliente faltou">
                            Faltou
                          </button>
                        </form>
                      </div>
                    )}
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
            <Link className="btn btn-sutil" href={`?${filtrosParaQuery(f, { pagina: String(pagina - 1) })}`}>
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">Página {pagina + 1}</span>
          {temMais ? (
            <Link className="btn btn-sutil" href={`?${filtrosParaQuery(f, { pagina: String(pagina + 1) })}`}>
              Próximos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
