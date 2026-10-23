"use client";

import { useEffect, useState } from "react";
import { formatarDataHora, formatarDia } from "@/lib/tempo";
import { api } from "../cliente-api";
import type { Ag } from "./tipos";

/** Modal de remarcação: escolhe um novo dia (janela de 7) e horário. */
export default function Remarcar({ ag, onFeito }: { ag: Ag; onFeito: () => void }) {
  const [dias, setDias] = useState<string[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [inicioJanela, setInicioJanela] = useState(0);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<{ dias: string[] }>(`/api/cliente/agendamentos/${ag.id}/horarios`).then((r) => setDias(r.dias)).catch((e) => setErro(e.message));
  }, [ag.id]);
  useEffect(() => {
    if (!dia) return;
    api<{ horarios: string[] }>(`/api/cliente/agendamentos/${ag.id}/horarios?dia=${dia}`).then((r) => setHoras(r.horarios));
  }, [ag.id, dia]);

  const semana = dias?.slice(inicioJanela, inicioJanela + 7) ?? [];

  return (
    <div className="grid gap-4">
      <div className="card rounded-lg p-3 text-sm">
        Horário atual: <span className="first-letter:uppercase">{formatarDataHora(ag.inicio)}</span>
      </div>
      {!dias ? (
        <p className="suave text-sm">Carregando…</p>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <button disabled={inicioJanela === 0} onClick={() => setInicioJanela(Math.max(0, inicioJanela - 7))} className="px-2 disabled:opacity-30">
              ‹ anteriores
            </button>
            <button
              disabled={inicioJanela + 7 >= dias.length}
              onClick={() => setInicioJanela(inicioJanela + 7)}
              className="px-2 disabled:opacity-30"
            >
              próximos ›
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {semana.map((d) => (
              <button
                key={d}
                data-ativo={dia === d}
                onClick={() => {
                  setDia(d);
                  setHoras(null);
                  setHora(null);
                }} className="chip text-sm first-letter:uppercase">
                {formatarDia(d)}
              </button>
            ))}
          </div>
        </div>
      )}
      {dia && (
        <div className="grid grid-cols-4 gap-2">
          {!horas ? (
            <p className="suave text-sm col-span-4">Carregando…</p>
          ) : horas.length === 0 ? (
            <p className="suave text-sm col-span-4">Sem horários neste dia.</p>
          ) : (
            horas.map((h) => (
              <button key={h} data-ativo={hora === h} onClick={() => setHora(h)} className="chip mono text-sm">
                {h}
              </button>
            ))
          )}
        </div>
      )}
      {erro && <p className="text-sm text-[#ff9aa2]">{erro}</p>}
      <button
        disabled={!dia || !hora}
        className="btn btn-quente w-full !py-3"
        onClick={async () => {
          try {
            await api(`/api/cliente/agendamentos/${ag.id}/remarcar`, { json: { dia, hora } });
            onFeito();
          } catch (e) {
            setErro((e as Error).message);
          }
        }}
      >
        Remarcar para {dia ? formatarDia(dia) : "…"} {hora ?? ""}
      </button>
    </div>
  );
}
