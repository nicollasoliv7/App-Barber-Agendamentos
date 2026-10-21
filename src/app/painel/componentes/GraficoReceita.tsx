"use client";

import { useState } from "react";
import { reais } from "@/lib/tempo";

type Ponto = { dia: string; valor: number; qtd: number };

const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const compacto = (c: number) => {
  const r = c / 100;
  return r >= 1000 ? `R$ ${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(r)}`;
};

/** Colunas de receita por dia (série única, cor validada para o fundo escuro), com tooltip e versão em tabela. */
export default function GraficoReceita({ serie }: { serie: Ponto[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const max = Math.max(...serie.map((s) => s.valor), 1);
  // escala "redonda" para os ticks
  const passo = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const topo = Math.ceil(max / passo) * passo;
  const ticks = [0, topo / 2, topo];
  const W = 100;
  const largura = W / serie.length;
  const barra = Math.min(largura * 0.62, 6);
  const total = serie.reduce((s, p) => s + p.valor, 0);
  const pico = serie.reduce((a, b) => (b.valor > a.valor ? b : a), serie[0]);
  const rotulosCada = Math.ceil(serie.length / 6);

  return (
    <section className="card min-w-0 p-4 md:p-5" aria-labelledby="titulo-receita">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="titulo-receita" className="font-medium">
            Receita por dia
          </h2>
          <p className="text-xs muted">Confirmados + concluídos · total {reais(total)}</p>
        </div>
        <button className="btn btn-sutil btn-sm" onClick={() => setTabela(!tabela)} aria-pressed={tabela}>
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {tabela ? (
        <div className="max-h-72 overflow-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="text-right">Atendimentos</th>
                <th className="text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((p) => (
                <tr key={p.dia}>
                  <td className="mono text-[13px]">{curto(p.dia)}</td>
                  <td className="text-right num">{p.qtd}</td>
                  <td className="text-right num">{reais(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : total === 0 ? (
        <p className="py-16 text-center text-sm muted">Nenhuma receita no período e filtros escolhidos.</p>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <div className="flex h-56 flex-col-reverse justify-between py-0 text-right text-[11px] muted mono" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0">
                  {compacto(t)}
                </span>
              ))}
            </div>
            <div className="relative h-56">
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-white/[0.07]" style={{ bottom: `${(t / topo) * 100}%` }} />
              ))}
              <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`Receita diária; pico de ${reais(pico.valor)} em ${curto(pico.dia)}`}>
                {serie.map((p, i) => {
                  const h = (p.valor / topo) * 100;
                  const x = i * largura + (largura - barra) / 2;
                  return (
                    <g key={p.dia}>
                      {h > 0 && (
                        <rect
                          x={x}
                          y={100 - h}
                          width={barra}
                          height={h}
                          rx={Math.min(barra / 2, 1.2)}
                          fill="var(--chart)"
                          opacity={hover === null || hover === i ? 1 : 0.45}
                          style={{ transition: "opacity .15s" }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {/* alvos de hover/foco maiores que as barras */}
              <div className="absolute inset-0 flex">
                {serie.map((p, i) => (
                  <button
                    key={p.dia}
                    type="button"
                    className="h-full min-w-0 flex-1 p-0 focus:outline-none focus-visible:bg-white/[0.05]"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${curto(p.dia)}: ${reais(p.valor)}, ${p.qtd} atendimento(s)`}
                  />
                ))}
              </div>
              {hover !== null && (
                <div
                  className="glass pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg px-3 py-2 text-xs"
                  style={{ left: `${((hover + 0.5) / serie.length) * 100}%`, bottom: `calc(${(serie[hover].valor / topo) * 100}% + 10px)` }}
                >
                  <div className="text-sm font-semibold num">{reais(serie[hover].valor)}</div>
                  <div className="muted">
                    {curto(serie[hover].dia)} · {serie[hover].qtd} atend.
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* rótulos posicionados de forma absoluta: não alargam o card em telas pequenas */}
          <div className="relative ml-[52px] mt-2 h-4 text-[11px] muted mono" aria-hidden="true">
            {serie.map((p, i) =>
              i % rotulosCada === 0 ? (
                <span key={p.dia} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / serie.length) * 100}%` }}>
                  {curto(p.dia)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}
    </section>
  );
}
