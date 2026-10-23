"use client";

import { useMemo } from "react";
import type { ServicoPub } from "../PaginaPublica";
import { partesDia } from "./datas";
import type { Prof } from "./tipos";

/** Etapa 3: faixa de dias e horários agrupados por turno. */
export default function EscolhaHorario(p: {
  servico: ServicoPub;
  prof: Prof;
  variosProfissionais: boolean;
  dias: string[] | null;
  dia: string | null;
  horas: string[] | null;
  hora: string | null;
  onDia: (d: string) => void;
  onHora: (h: string) => void;
}) {
  const { dias, dia, horas, hora } = p;
  const grupos = useMemo(() => {
    const g: { rotulo: string; itens: string[] }[] = [
      { rotulo: "Manhã", itens: [] },
      { rotulo: "Tarde", itens: [] },
      { rotulo: "Noite", itens: [] },
    ];
    for (const h of horas ?? []) {
      const hh = Number(h.slice(0, 2));
      g[hh < 12 ? 0 : hh < 18 ? 1 : 2].itens.push(h);
    }
    return g.filter((x) => x.itens.length);
  }, [horas]);

  return (
    <section aria-labelledby="t-hora" className="surgir">
      <h2 id="t-hora" className="text-lg font-semibold">
        Escolha o dia e o horário
      </h2>
      <p className="mb-4 text-sm suave">
        {p.servico.nome} · {p.prof.nome} · {p.servico.duracao_min} min
      </p>
      {!dias ? (
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="esqueleto h-[72px] w-[60px] shrink-0" />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="font-medium">Sem horários livres nos próximos dias</p>
          <p className="mt-1 text-sm suave">{p.variosProfissionais ? "Tente outro profissional ou “Sem preferência”." : "Tente outro serviço ou volte mais tarde."}</p>
        </div>
      ) : (
        <>
          <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Dias disponíveis">
            {dias.map((d) => {
              const x = partesDia(d);
              return (
                <button
                  key={d}
                  role="option"
                  aria-selected={dia === d}
                  data-ativo={dia === d}
                  onClick={() => p.onDia(d)}
                  className="chip !flex-col !gap-0 !rounded-xl !px-0 !py-2 w-[60px] shrink-0"
                >
                  <span className="text-[11px] uppercase suave">{x.semana}</span>
                  <span className="text-lg font-semibold leading-tight">{x.dia}</span>
                  <span className="text-[11px] suave">{x.mes}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            {!horas ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="esqueleto h-10" />
                ))}
              </div>
            ) : horas.length === 0 ? (
              <p className="card p-5 text-center text-sm suave">Este dia lotou. Escolha outro dia.</p>
            ) : (
              grupos.map((g) => (
                <div key={g.rotulo} className="mb-4">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider suave">{g.rotulo}</h3>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="listbox" aria-label={`Horários da ${g.rotulo.toLowerCase()}`}>
                    {g.itens.map((h) => (
                      <button key={h} role="option" aria-selected={hora === h} data-ativo={hora === h} onClick={() => p.onHora(h)} className="chip mono !px-0 !text-[14px]">
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
