"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarDataHora, reais } from "@/lib/tempo";
import type { AgendamentoPublico } from "@/lib/gerenciar";
import { Aurora, Icone, StatusBadge } from "@/components/ui";
import { api } from "../../cliente-api";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const partes = (d: string) => {
  const [a, m, dd] = d.split("-").map(Number);
  return { semana: SEMANA[new Date(Date.UTC(a, m - 1, dd)).getUTCDay()], dia: dd, mes: MESES[m - 1] };
};

export default function Gerenciar({ slug, token, inicial, erro: erroInicial }: { slug: string; token: string; inicial: AgendamentoPublico | null; erro: string }) {
  const [ag, setAg] = useState(inicial);
  const [modo, setModo] = useState<"ver" | "remarcar" | "cancelar">("ver");
  const [dias, setDias] = useState<string[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [erro, setErro] = useState(erroInicial);
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const base = `/api/public/${slug}/agendamentos/${ag?.id}`;

  async function recarregar() {
    const r = await api<{ agendamento: AgendamentoPublico }>(`${base}?t=${token}`);
    setAg(r.agendamento);
  }
  function abrirRemarcar() {
    setModo("remarcar");
    setErro("");
    setDias(null);
    api<{ dias: string[] }>(`${base}/horarios?t=${token}`)
      .then((r) => {
        setDias(r.dias);
        if (r.dias[0]) escolherDia(r.dias[0]);
      })
      .catch((e) => setErro(e.message));
  }
  function escolherDia(d: string) {
    setDia(d);
    setHora(null);
    setHoras(null);
    api<{ horarios: string[] }>(`${base}/horarios?t=${token}&dia=${d}`)
      .then((r) => setHoras(r.horarios))
      .catch((e) => setErro(e.message));
  }
  async function executar(fn: () => Promise<unknown>, msg: string) {
    setErro("");
    setOcupado(true);
    try {
      await fn();
      await recarregar();
      setOk(msg);
      setModo("ver");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] overflow-hidden">
        <Aurora suave />
      </div>
      <main className="relative mx-auto max-w-lg px-4 pb-16 pt-10">
        <Link href={`/${slug}`} className="text-sm suave hover:text-white">
          ← {ag?.empresa.nome ?? "Voltar"}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Seu agendamento</h1>

        {erro && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#ff4d5a]/40 bg-[#ff4d5a]/10 px-3 py-2.5 text-sm text-[#ffc2c7]">
            <Icone nome="alerta" tamanho={16} className="mt-0.5" /> {erro}
          </div>
        )}
        {ok && (
          <div role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 px-3 py-2.5 text-sm text-[#a6efcb]">
            <Icone nome="check" tamanho={16} /> {ok}
          </div>
        )}

        {ag && (
          <>
            <div className="card mt-5 overflow-hidden">
              <div className="flex items-start justify-between gap-3 p-5">
                <div>
                  <p className="text-lg font-semibold">{ag.servico}</p>
                  <p className="text-sm suave">com {ag.profissional}</p>
                </div>
                <StatusBadge status={ag.status} />
              </div>
              <dl className="divide-hair border-t border-white/[0.08] text-sm">
                <div className="flex justify-between gap-4 px-5 py-3">
                  <dt className="suave">Quando</dt>
                  <dd className="font-medium first-letter:uppercase">{formatarDataHora(ag.inicio)}</dd>
                </div>
                <div className="flex justify-between gap-4 px-5 py-3">
                  <dt className="suave">Valor</dt>
                  <dd className="font-medium">
                    {reais(ag.preco_centavos)}
                    {ag.pago_centavos > 0 && ` · pago ${reais(ag.pago_centavos)}`}
                  </dd>
                </div>
                {ag.empresa.endereco && (
                  <div className="flex justify-between gap-4 px-5 py-3">
                    <dt className="suave">Onde</dt>
                    <dd className="text-right">
                      {ag.empresa.maps_url ? (
                        <a href={ag.empresa.maps_url} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2">
                          {ag.empresa.endereco}
                        </a>
                      ) : (
                        ag.empresa.endereco
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {modo === "ver" && (
              <div className="mt-4 grid gap-2">
                {ag.status !== "cancelado" && (
                  <a className="btn btn-sutil" href={`${base}/ics?t=${token}`}>
                    <Icone nome="calendario" tamanho={15} /> Adicionar à agenda
                  </a>
                )}
                {ag.pode_remarcar && (
                  <button className="btn btn-key" onClick={abrirRemarcar}>
                    Remarcar
                  </button>
                )}
                {ag.pode_cancelar && (
                  <button className="btn btn-perigo" onClick={() => setModo("cancelar")}>
                    Cancelar agendamento
                  </button>
                )}
                {!ag.pode_cancelar && (ag.status === "confirmado" || ag.status === "pendente_pagamento") && (
                  <p className="text-center text-xs suave">
                    Remarcações e cancelamentos pelo link valem até {ag.limite_cancelamento_h}h antes. Depois disso, fale com a barbearia.
                  </p>
                )}
                {ag.empresa.telefone_whatsapp && (
                  <a className="btn btn-ghost mx-auto mt-2" href={`https://wa.me/55${ag.empresa.telefone_whatsapp}`} target="_blank" rel="noreferrer">
                    <Icone nome="whatsapp" tamanho={15} /> Falar com a barbearia
                  </a>
                )}
                {ag.status === "cancelado" && (
                  <Link href={`/${slug}`} className="btn btn-quente mt-2">
                    Agendar novo horário
                  </Link>
                )}
              </div>
            )}

            {modo === "cancelar" && (
              <div className="card mt-4 p-5">
                <p className="font-medium">Cancelar este horário?</p>
                <p className="mt-1 text-sm suave">O horário fica livre para outra pessoa.{ag.pago_centavos > 0 ? " O valor pago é tratado direto com a barbearia." : ""}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="btn btn-sutil" onClick={() => setModo("ver")}>
                    Voltar
                  </button>
                  <button
                    className="btn btn-perigo"
                    disabled={ocupado}
                    onClick={() => executar(() => api(`${base}/cancelar`, { json: { t: token } }), "Agendamento cancelado.")}
                  >
                    {ocupado ? "Cancelando…" : "Sim, cancelar"}
                  </button>
                </div>
              </div>
            )}

            {modo === "remarcar" && (
              <div className="card mt-4 p-5">
                <p className="mb-3 font-medium">Escolha o novo horário</p>
                {!dias ? (
                  <div className="esqueleto h-[72px]" />
                ) : dias.length === 0 ? (
                  <p className="text-sm suave">Sem horários livres nos próximos dias.</p>
                ) : (
                  <div className="sem-barra -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                    {dias.map((d) => {
                      const x = partes(d);
                      return (
                        <button key={d} data-ativo={dia === d} aria-pressed={dia === d} onClick={() => escolherDia(d)} className="chip !flex-col !gap-0 !rounded-xl !px-0 !py-2 w-[58px] shrink-0">
                          <span className="text-[11px] uppercase suave">{x.semana}</span>
                          <span className="text-lg font-semibold leading-tight">{x.dia}</span>
                          <span className="text-[11px] suave">{x.mes}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {dia && (
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {!horas
                      ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="esqueleto h-10" />)
                      : horas.map((h) => (
                          <button key={h} data-ativo={hora === h} aria-pressed={hora === h} onClick={() => setHora(h)} className="chip mono !px-0">
                            {h}
                          </button>
                        ))}
                    {horas && horas.length === 0 && <p className="col-span-4 text-sm suave">Dia lotado. Escolha outro.</p>}
                  </div>
                )}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button className="btn btn-sutil" onClick={() => setModo("ver")}>
                    Voltar
                  </button>
                  <button
                    className="btn btn-quente"
                    disabled={!dia || !hora || ocupado}
                    onClick={() => executar(() => api(`${base}/remarcar`, { json: { t: token, dia, hora } }), "Pronto! Seu horário foi remarcado.")}
                  >
                    {ocupado ? "Remarcando…" : "Confirmar novo horário"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {!ag && (
          <Link href={`/${slug}`} className="btn btn-quente mt-6 w-full">
            Ir para a página de agendamento
          </Link>
        )}
      </main>
    </div>
  );
}
