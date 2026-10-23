"use client";

import { Icone } from "@/components/ui";
import type { ServicoPub } from "../PaginaPublica";
import { QUALQUER, type Prof } from "./tipos";

/** Etapa 2: profissional (ou "Sem preferência" quando há mais de um). */
export default function EscolhaProfissional(p: { servico: ServicoPub; profs: Prof[] | null; onEscolher: (pr: Prof) => void }) {
  const { profs } = p;
  return (
    <section aria-labelledby="t-prof" className="surgir">
      <h2 id="t-prof" className="text-lg font-semibold">
        Com quem?
      </h2>
      <p className="mb-3 text-sm suave">{p.servico.nome}</p>
      {!profs ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-16" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-2">
          {[...(profs.length > 1 ? [QUALQUER] : []), ...profs].map((pr) => (
            <li key={pr.id}>
              <button onClick={() => p.onEscolher(pr)} className="card card-hover flex w-full items-center gap-3 p-3.5 text-left">
                <span
                  className="grid h-11 w-11 place-items-center rounded-full text-sm font-semibold"
                  style={{ background: pr.id === "qualquer" ? "rgba(255,255,255,.07)" : "color-mix(in srgb, var(--t-primaria) 28%, transparent)" }}
                >
                  {pr.id === "qualquer" ? (
                    <Icone nome="usuarios" tamanho={18} />
                  ) : (
                    pr.nome
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")
                  )}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{pr.nome}</span>
                  {pr.id === "qualquer" && <span className="block text-xs suave">Mais horários: escolhemos quem estiver livre</span>}
                </span>
                <Icone nome="seta" tamanho={16} className="suave" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
