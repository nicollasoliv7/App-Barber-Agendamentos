"use client";

import { reais } from "@/lib/tempo";
import { Icone } from "@/components/ui";
import type { ServicoPub } from "../PaginaPublica";

/** Etapa 1: lista de serviços (com busca quando há muitos). */
export default function EscolhaServico(p: { servicos: ServicoPub[]; busca: string; onBusca: (v: string) => void; onEscolher: (s: ServicoPub) => void }) {
  const filtrados = p.servicos.filter((s) => !p.busca || s.nome.toLowerCase().includes(p.busca.toLowerCase()));
  return (
    <section aria-labelledby="t-serv" className="surgir">
      <h2 id="t-serv" className="mb-3 text-lg font-semibold">
        Qual serviço você quer?
      </h2>
      {p.servicos.length > 8 && (
        <div className="relative mb-3">
          <Icone nome="busca" tamanho={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 suave" />
          <input value={p.busca} onChange={(e) => p.onBusca(e.target.value)} placeholder="Buscar serviço" aria-label="Buscar serviço" className="!pl-9" />
        </div>
      )}
      {p.servicos.length === 0 && <p className="card p-6 text-center suave">Nenhum serviço disponível no momento.</p>}
      <ul className="grid gap-2">
        {filtrados.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => p.onEscolher(s)}
              className="card card-hover group flex w-full items-center gap-3 p-4 text-left"
              aria-label={`${s.nome}, ${reais(s.preco_centavos)}, ${s.duracao_min} minutos`}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.nome}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm suave">
                  <span className="inline-flex items-center gap-1">
                    <Icone nome="relogio" tamanho={13} /> {s.duracao_min} min
                  </span>
                  {s.observacao && <span>· {s.observacao}</span>}
                </span>
                {s.descricao && <span className="mt-1 block text-xs suave">{s.descricao}</span>}
              </span>
              <span className="text-right">
                <span className="block font-semibold num">{reais(s.preco_centavos)}</span>
              </span>
              <Icone nome="seta" tamanho={16} className="suave transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
