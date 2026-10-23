"use client";

import { CAMPOS, type CampoId } from "@/lib/importacao/campos";
import type { Envio } from "./tipos";

type Mapa = Partial<Record<CampoId, number>>;

/** Etapa 2: dizer qual coluna do arquivo corresponde a cada informação, com prévia. */
export default function EtapaColunas(p: {
  envio: Envio;
  map: Mapa;
  setMap: (fn: (m: Mapa) => Mapa) => void;
  ddd: string;
  setDdd: (v: string) => void;
  ocupado: boolean;
  onAnalisar: () => void;
  onTrocarArquivo: () => void;
}) {
  const { envio, map, setMap, ddd, setDdd, ocupado } = p;
  const usadas = new Set(Object.values(map).filter((v) => v !== undefined));
  const faltaObrig = CAMPOS.filter((c) => c.obrigatorio && map[c.id] === undefined);
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <b>{envio.total}</b> linha{envio.total === 1 ? "" : "s"} encontradas em <span className="mono">{envio.formato.toUpperCase()}</span>. Diga qual coluna do
        seu arquivo corresponde a cada informação. Já sugerimos o que reconhecemos.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.id} className="grid gap-1.5">
            <span className="rotulo">
              {c.rotulo} {c.obrigatorio ? <span className="text-[#ffcf8a]">*</span> : <span className="faint">(opcional)</span>}
            </span>
            <select
              value={map[c.id] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setMap((m) => {
                  const n = { ...m };
                  if (v === "") delete n[c.id];
                  else n[c.id] = Number(v);
                  return n;
                });
              }}
              className="input"
            >
              <option value="">— não importar —</option>
              {envio.colunas.map((col, i) => (
                <option key={i} value={i} disabled={usadas.has(i) && map[c.id] !== i}>
                  {col}
                  {envio.amostra[0]?.[i] ? `  (ex.: ${envio.amostra[0][i].slice(0, 24)})` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="grid gap-1.5">
          <span className="rotulo">
            DDD padrão <span className="faint">(para telefones sem DDD)</span>
          </span>
          <input value={ddd} onChange={(e) => setDdd(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="ex.: 11" className="input" />
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Prévia do arquivo (5 primeiras linhas)</h3>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="tabela text-[13px]">
            <thead>
              <tr>
                {envio.colunas.map((c, i) => {
                  const campo = CAMPOS.find((x) => map[x.id] === i);
                  return (
                    <th key={i}>
                      {c}
                      {campo && <span className="ml-1 rounded bg-[var(--coral)]/20 px-1.5 py-0.5 text-[10px] text-white">→ {campo.rotulo}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {envio.amostra.map((l, i) => (
                <tr key={i}>
                  {l.map((v, j) => (
                    <td key={j} className={`whitespace-nowrap ${CAMPOS.some((x) => map[x.id] === j) ? "" : "faint"}`}>
                      {v || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-quente" disabled={ocupado || faltaObrig.length > 0} onClick={p.onAnalisar}>
          {ocupado ? "Analisando…" : "Validar dados"}
        </button>
        <button className="btn btn-sutil" onClick={p.onTrocarArquivo}>
          Trocar arquivo
        </button>
        {faltaObrig.length > 0 && <span className="text-sm text-[#ffcf8a]">Escolha a coluna de: {faltaObrig.map((c) => c.rotulo).join(" e ")}</span>}
      </div>
    </div>
  );
}
