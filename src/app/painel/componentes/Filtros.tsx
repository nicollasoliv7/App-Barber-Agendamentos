"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icone } from "@/components/ui";

type Opcao = { id: string; nome: string };

const PERIODOS = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["mes", "Este mês"],
  ["mes_passado", "Mês passado"],
] as const;

const STATUS = [
  ["", "Todos os status"],
  ["confirmado", "Confirmados"],
  ["concluido", "Concluídos"],
  ["pendente_pagamento", "Aguardando Pix"],
  ["cancelado", "Cancelados"],
  ["faltou", "Faltas"],
] as const;

/** Barra de filtros única (período, serviço, profissional, status e busca de cliente) que atualiza a URL. */
export default function Filtros({
  servicos,
  profissionais,
  periodoAtual,
  de,
  ate,
  busca = false,
  periodos = PERIODOS as unknown as readonly (readonly [string, string])[],
}: {
  servicos: Opcao[];
  profissionais: Opcao[];
  periodoAtual: string;
  de: string;
  ate: string;
  busca?: boolean;
  periodos?: readonly (readonly [string, string])[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const [personalizado, setPersonalizado] = useState(periodoAtual === "personalizado");
  const [texto, setTexto] = useState(sp.get("q") ?? "");

  function aplicar(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    p.delete("pagina");
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    iniciar(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  const ativos = ["servico", "profissional", "status", "q"].filter((k) => sp.get(k)).length;

  return (
    <div className="card mb-6 p-3" aria-busy={pendente}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1.5">
          {periodos.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              data-ativo={!personalizado && periodoAtual === id}
              className="chip !py-1.5 !text-[13px]"
              onClick={() => {
                setPersonalizado(false);
                aplicar({ periodo: id, de: null, ate: null });
              }}
            >
              {rotulo}
            </button>
          ))}
          <button type="button" data-ativo={personalizado} className="chip !py-1.5 !text-[13px]" onClick={() => setPersonalizado(true)}>
            Personalizado
          </button>
        </div>
        {personalizado && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              aplicar({ periodo: null, de: String(f.get("de")), ate: String(f.get("ate")) });
            }}
          >
            <input type="date" name="de" defaultValue={de} aria-label="Data inicial" className="!w-auto !py-1.5" />
            <span className="muted text-sm">até</span>
            <input type="date" name="ate" defaultValue={ate} aria-label="Data final" className="!w-auto !py-1.5" />
            <button className="btn btn-sutil btn-sm">Aplicar</button>
          </form>
        )}
        {pendente && <span className="ml-auto text-xs muted carregando">Atualizando…</span>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {busca && (
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              aplicar({ q: texto.trim() || null });
            }}
          >
            <Icone nome="busca" tamanho={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={() => texto.trim() !== (sp.get("q") ?? "") && aplicar({ q: texto.trim() || null })}
              placeholder="Cliente: nome ou telefone"
              aria-label="Buscar cliente"
              className="!pl-9 !py-2"
            />
          </form>
        )}
        <select aria-label="Serviço" value={sp.get("servico") ?? ""} onChange={(e) => aplicar({ servico: e.target.value })} className="!py-2">
          <option value="">Todos os serviços</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Profissional"
          value={sp.get("profissional") ?? ""}
          onChange={(e) => aplicar({ profissional: e.target.value })}
          className="!py-2"
        >
          <option value="">Todos os profissionais</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={sp.get("status") ?? ""} onChange={(e) => aplicar({ status: e.target.value })} className="!py-2">
          {STATUS.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {ativos > 0 && (
        <button
          type="button"
          className="mt-2 text-xs muted underline-offset-2 hover:underline"
          onClick={() => {
            setTexto("");
            aplicar({ servico: null, profissional: null, status: null, q: null, cliente: null });
          }}
        >
          Limpar {ativos} filtro{ativos > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
