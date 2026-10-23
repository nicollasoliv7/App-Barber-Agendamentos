import Link from "next/link";
import QRCode from "qrcode";
import { profissionaisOpcoes, servicosOpcoes, totalClientes } from "@/lib/consultas/cadastros";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { expirarPendentes } from "@/lib/disponibilidade";
import { dashboard, filtrosParaQuery, lerFiltros } from "@/lib/relatorios";
import { origemApp } from "@/lib/origem";
import { resumoPlanos, usaPlanos } from "@/lib/planos";
import { RECORRENTE_VISITAS } from "@/lib/relatorios";
import { formatarDataHora, instanteLocal, reais, somarDias } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { Icone, Kpi, StatusBadge } from "@/components/ui";
import { Cabecalho } from "../Form";
import Filtros from "../componentes/Filtros";
import GraficoReceita from "../componentes/GraficoReceita";
import LinkPublico from "../componentes/LinkPublico";

export const metadata = { title: "Visão geral" };

const fmtData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default async function VisaoGeral({ searchParams }: PageProps<"/painel">) {
  const u = await usuarioOuLogin();
  await expirarPendentes();
  const cfg = await configAgendamento(u.empresa_id);
  const f = lerFiltros(await searchParams, cfg.fuso_horario);
  const [d, servicos, profissionais, origem, total_clientes] = await Promise.all([
    dashboard(u.empresa_id, f),
    servicosOpcoes(u.empresa_id),
    profissionaisOpcoes(u.empresa_id),
    origemApp(),
    totalClientes(u.empresa_id),
  ]);
  // planos: só para quem usa o módulo (nada aparece para barbearias sem planos)
  const planos = (await usaPlanos(u.empresa_id))
    ? await resumoPlanos(u.empresa_id, instanteLocal(f.de, 0, cfg.fuso_horario), instanteLocal(somarDias(f.ate, 1), 0, cfg.fuso_horario))
    : null;
  const caminho = `/${u.empresa_slug}`;
  const qr = await QRCode.toDataURL(`${origem}${caminho}`, { margin: 1, width: 320 });
  const maxServ = Math.max(...d.topServicos.map((s) => s.qtd), 1);
  const comp = d.dias === 1 ? "vs. dia anterior" : `vs. ${d.dias} dias anteriores`;
  const listar = (extra: Record<string, string>) => `/painel/agendamentos?${filtrosParaQuery(f, extra)}`;

  return (
    <>
      <Cabecalho
        titulo={`Olá, ${u.nome.split(" ")[0]}`}
        descricao={`Resumo da ${u.empresa_nome} de ${fmtData(f.de)} a ${fmtData(f.ate)}. Use os filtros para focar num serviço, profissional ou status.`}
      >
        <Link href="/painel/agenda" className="btn btn-key">
          <Icone nome="calendario" tamanho={15} /> Agenda de hoje
        </Link>
      </Cabecalho>

      <Filtros servicos={servicos} profissionais={profissionais} periodoAtual={f.periodo} de={f.de} ate={f.ate} busca />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icone="dinheiro"
          rotulo="Faturamento realizado"
          valor={reais(d.kpis.realizado.valor)}
          variacao={d.kpis.realizado.var}
          detalhe={planos ? "atendimentos (planos à parte)" : comp}
        />
        <Kpi icone="grafico" rotulo="Receita prevista" valor={reais(d.kpis.previsto.valor)} variacao={d.kpis.previsto.var} detalhe="confirm. + concl." />
        <Kpi icone="alerta" rotulo="A receber" valor={reais(d.kpis.aReceber)} detalhe="concluídos sem pagamento" />
        <Kpi icone="tesoura" rotulo="Ticket médio" valor={reais(d.kpis.ticket.valor)} variacao={d.kpis.ticket.var} detalhe="por atendimento" />
        <Kpi icone="calendario" rotulo="Agendamentos" valor={String(d.kpis.agendamentos.valor)} variacao={d.kpis.agendamentos.var} detalhe="sem cancelados" />
        <Kpi
          icone="usuarios"
          rotulo="Clientes atendidos"
          valor={String(d.kpis.atendidos.valor)}
          variacao={d.kpis.atendidos.var}
          detalhe={`${d.kpis.novosClientes.valor} novos · ${total_clientes} na base`}
        />
        <Kpi icone="recorrente" rotulo="Clientes recorrentes" valor={String(d.kpis.recorrentes)} detalhe={`${RECORRENTE_VISITAS}+ visitas em 90 dias`} />
        <Kpi icone="bloqueio" rotulo="Cancelamentos + faltas" valor={`${d.kpis.taxaPerda}%`} detalhe={`${d.atual.cancelados} canc. · ${d.atual.faltas} faltas`} />
      </section>

      {planos && (
        <section className="card mt-6 p-4 md:p-5" aria-labelledby="titulo-planos-dash">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="titulo-planos-dash" className="font-medium">
                Planos mensais
              </h2>
              <p className="text-xs muted">Receita recorrente e renovações. Atendimentos cobertos não entram no faturamento acima.</p>
            </div>
            <Link href="/painel/planos" className="text-xs muted hover:text-white">
              Planos →
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
            {[
              ["Assinaturas ativas", String(planos.ativas)],
              ["Receita recorrente mensal", reais(planos.recorrenteMensal)],
              ["Recebido de planos no período", reais(planos.recebido)],
              ["Mensalidades em aberto", `${reais(planos.emAberto.valor)} (${planos.emAberto.qtd})`],
              ["Atendimentos cobertos", `${d.atual.cobertos} · ${reais(d.atual.valor_coberto)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/[0.08] p-3">
                <dt className="text-xs muted">{k}</dt>
                <dd className="num mt-1 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {planos.renovacoes.length > 0 && (
            <p className="mt-3 text-xs muted">
              Próximas renovações:{" "}
              {planos.renovacoes
                .slice(0, 4)
                .map((r) => `${r.cliente.split(" ")[0]} (${r.ciclo_fim.slice(8, 10)}/${r.ciclo_fim.slice(5, 7)})`)
                .join(", ")}
              {planos.renovacoes.length > 4 && ` e mais ${planos.renovacoes.length - 4}`}
            </p>
          )}
          {planos.inadimplentes > 0 && (
            <p className="mt-1 text-xs text-[#ff9aa2]">
              {planos.inadimplentes} assinatura{planos.inadimplentes > 1 ? "s" : ""} com mensalidade atrasada.
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GraficoReceita serie={d.serie} />
        <LinkPublico url={`${origem}${caminho}`} caminho={caminho} nome={u.empresa_nome} qr={qr} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <section className="card p-4 md:p-5" aria-labelledby="titulo-servicos">
          <h2 id="titulo-servicos" className="font-medium">
            Serviços mais procurados
          </h2>
          <p className="text-xs muted">Agendamentos no período (sem cancelados)</p>
          {d.topServicos.length === 0 ? (
            <p className="py-10 text-center text-sm muted">Sem agendamentos no período.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {d.topServicos.map((s) => (
                <li key={s.id}>
                  <Link href={listar({ servico: s.id })} className="group block" title={`${s.nome}: ${s.qtd} agendamentos, ${reais(s.valor)}`}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate group-hover:underline underline-offset-2">{s.nome}</span>
                      <span className="num muted">
                        {s.qtd} · {reais(s.valor)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.05]">
                      <div className="h-2 rounded-r-[4px] rounded-l-full bg-[var(--chart)]" style={{ width: `${Math.max(2, (s.qtd / maxServ) * 100)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 md:p-5" aria-labelledby="titulo-clientes">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="titulo-clientes" className="font-medium">
                Melhores clientes
              </h2>
              <p className="text-xs muted">Por valor no período</p>
            </div>
            <Link href="/painel/clientes" className="text-xs muted hover:text-white">
              Ver todos →
            </Link>
          </div>
          {d.topClientes.length === 0 ? (
            <p className="py-10 text-center text-sm muted">Sem clientes no período.</p>
          ) : (
            <ul className="mt-3 divide-hair">
              {d.topClientes.map((c, i) => (
                <li key={c.id}>
                  <Link href={`/painel/clientes/${c.id}`} className="flex items-center gap-3 py-2.5 hover:bg-white/[0.02]">
                    <span className="mono w-4 text-xs faint">{i + 1}</span>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-xs font-semibold">
                      {c.nome
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.nome}</span>
                      <span className="block text-xs muted">
                        {formatarTelefone(c.telefone)} · {c.visitas} visita{c.visitas > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="num text-sm">{reais(c.valor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 md:p-5 lg:col-span-2 xl:col-span-1" aria-labelledby="titulo-proximos">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="titulo-proximos" className="font-medium">
                Próximos horários
              </h2>
              <p className="text-xs muted">A partir de agora</p>
            </div>
            <Link href="/painel/agenda" className="text-xs muted hover:text-white">
              Agenda →
            </Link>
          </div>
          {d.proximos.length === 0 ? (
            <p className="py-10 text-center text-sm muted">Nenhum horário marcado ainda.</p>
          ) : (
            <ul className="mt-3 divide-hair">
              {d.proximos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="mono w-[86px] shrink-0 text-xs text-[var(--amber)]">{formatarDataHora(a.inicio, d.fuso).replace(",", "")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.cliente}</span>
                    <span className="block truncate text-xs muted">
                      {a.servico} · {a.profissional}
                    </span>
                  </span>
                  {a.status !== "confirmado" && <StatusBadge status={a.status} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Agendamentos por status" className="mt-6 flex flex-wrap gap-2">
        {(["confirmado", "concluido", "pendente_pagamento", "faltou", "cancelado"] as const).map((s) => (
          <Link key={s} href={listar({ status: s })} className="card card-hover flex items-center gap-3 px-3 py-2 text-sm">
            <StatusBadge status={s} />
            <span className="num font-semibold">{d.porStatus[s] ?? 0}</span>
          </Link>
        ))}
        <Link href={listar({})} className="btn btn-ghost ml-auto">
          Ver lista completa <Icone nome="seta" tamanho={14} />
        </Link>
      </section>
    </>
  );
}
