import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { configAgendamento } from "@/lib/empresa";
import { expirarPendentes } from "@/lib/disponibilidade";
import { diaLocal, formatarDia, instanteLocal, minutosLocal, hhmm, reais, somarDias } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { mudarStatus, novoAgendamentoManual, registrarPagamentoLocal } from "../acoes";
import { Campo, Form, inp } from "../Form";

export const metadata = { title: "Agenda" };

const COR: Record<string, string> = {
  confirmado: "bg-teal-100 text-teal-800",
  pendente_pagamento: "bg-amber-100 text-amber-800",
  concluido: "bg-slate-200 text-slate-700",
  cancelado: "bg-red-100 text-red-700 line-through",
  faltou: "bg-orange-100 text-orange-800",
};
const ROT: Record<string, string> = {
  confirmado: "Confirmado",
  pendente_pagamento: "Aguardando Pix",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

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
};

export default async function Agenda({ searchParams }: PageProps<"/painel">) {
  const u = (await usuarioPainel())!;
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
      `select a.id, a.inicio, a.fim, a.status, a.origem, a.preco_centavos, a.profissional_id, a.cancelado_por,
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

  const ativos = ags.filter((a) => a.status !== "cancelado");
  const previsto = ativos.filter((a) => a.status !== "faltou").reduce((s, a) => s + a.preco_centavos, 0);
  const recebido = ags.reduce((s, a) => s + a.pago, 0);
  const hm = (d: Date) => hhmm(minutosLocal(new Date(d), cfg.fuso_horario));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-auto">Agenda</h1>
        <Link href={`/painel?dia=${somarDias(dia, -1)}`} className="rounded-lg bg-white px-3 py-2 shadow-sm" aria-label="Dia anterior">
          ‹
        </Link>
        <form className="flex gap-2">
          <input type="date" name="dia" defaultValue={dia} className={inp} />
          <button className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">Ir</button>
        </form>
        <Link href={`/painel?dia=${somarDias(dia, 1)}`} className="rounded-lg bg-white px-3 py-2 shadow-sm" aria-label="Próximo dia">
          ›
        </Link>
        {dia !== hoje && (
          <Link href="/painel" className="text-sm text-teal-700 underline">
            Hoje
          </Link>
        )}
      </header>

      <p className="-mt-4 text-slate-500 first-letter:uppercase">{formatarDia(dia)}</p>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi rotulo="Agendamentos" valor={String(ativos.length)} />
        <Kpi rotulo="Aguardando Pix" valor={String(ags.filter((a) => a.status === "pendente_pagamento").length)} />
        <Kpi rotulo="Previsto no dia" valor={reais(previsto)} />
        <Kpi rotulo="Recebido" valor={reais(recebido)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {profs.map((p) => {
          const lista = ags.filter((a) => a.profissional_id === p.id);
          const bls = bloqueios.filter((b) => !b.profissional_id || b.profissional_id === p.id);
          return (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold">{p.nome}</h2>
              {bls.map((b, i) => (
                <div key={i} className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  Bloqueado {hm(b.inicio)}–{hm(b.fim)} {b.motivo ? `· ${b.motivo}` : ""}
                </div>
              ))}
              {lista.length === 0 && <p className="text-sm text-slate-400">Nenhum agendamento.</p>}
              <ul className="grid gap-2">
                {lista.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {hm(a.inicio)}–{hm(a.fim)} · {a.servico}
                        </div>
                        <div>
                          {a.cliente} ·{" "}
                          <a className="text-teal-700" href={`https://wa.me/55${a.telefone}`} target="_blank" rel="noreferrer">
                            {formatarTelefone(a.telefone)}
                          </a>
                        </div>
                        <div className="text-slate-500">
                          {reais(a.preco_centavos)}
                          {a.pago > 0 && ` · pago ${reais(a.pago)}`}
                          {a.origem === "painel" && " · manual"}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${COR[a.status]}`}>{ROT[a.status]}</span>
                    </div>
                    {a.status !== "cancelado" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["concluido", "faltou", "cancelado"] as const)
                          .filter((s) => s !== a.status)
                          .map((s) => (
                            <form key={s} action={mudarStatus}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="status" value={s} />
                              <button className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50">
                                {s === "concluido" ? "Concluir" : s === "faltou" ? "Faltou" : "Cancelar"}
                              </button>
                            </form>
                          ))}
                        {a.status !== "confirmado" && (
                          <form action={mudarStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="confirmado" />
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50">Confirmar</button>
                          </form>
                        )}
                        {a.pago < a.preco_centavos && (
                          <form action={registrarPagamentoLocal}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50">Recebi no local</button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Novo agendamento manual</h2>
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
            <input name="nome" required className={inp} />
          </Campo>
          <Campo rotulo="Telefone">
            <input name="telefone" required inputMode="tel" placeholder="(11) 91234-5678" className={inp} />
          </Campo>
          <Campo rotulo="Observação">
            <input name="observacao" className={inp} />
          </Campo>
          <p className="md:col-span-4 text-xs text-slate-500">
            Agendamento manual respeita o expediente, as folgas e os conflitos, mas ignora a antecedência mínima.
          </p>
        </Form>
      </section>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="text-xl font-bold">{valor}</div>
    </div>
  );
}
