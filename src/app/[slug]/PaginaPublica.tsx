"use client";

import { useEffect, useState } from "react";
import { reais } from "@/lib/tempo";
import Agendar from "./Agendar";
import Historico from "./Historico";
import type { PagamentoCfg } from "./cliente-api";

export interface ServicoPub {
  id: string;
  nome: string;
  descricao: string | null;
  observacao: string | null;
  preco_centavos: number;
  duracao_min: number;
}
export interface CampoPub {
  chave: string;
  rotulo: string;
  tipo: "texto" | "cpf" | "cnpj" | "data" | "textarea";
  obrigatorio: boolean;
}

interface Props {
  empresa: { nome: string; slug: string; endereco: string | null; maps_url: string | null; logo_url: string | null };
  unidades: { id: string; nome: string }[];
  servicos: ServicoPub[];
  campos: CampoPub[];
  pagamento: PagamentoCfg;
}

export default function PaginaPublica({ empresa, unidades, servicos, campos, pagamento }: Props) {
  const [aba, setAba] = useState<"agendar" | "historico">("agendar");
  const [servico, setServico] = useState<ServicoPub | null>(null);
  const [aviso, setAviso] = useState(false);
  const [unidade, setUnidade] = useState(unidades[0]?.id ?? "");

  useEffect(() => {
    // localStorage só existe no navegador; ler aqui evita divergência de hidratação
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAviso(localStorage.getItem("agendou_privacidade") !== "ok");
    } catch {
      setAviso(true);
    }
  }, []);

  const iniciais = empresa.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-6">
      <header className="flex flex-col items-center text-center gap-2">
        {empresa.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={empresa.logo_url} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="h-24 w-24 rounded-full grid place-items-center text-3xl font-bold btn">{iniciais}</div>
        )}
        <h1 className="text-xl font-bold">{empresa.nome}</h1>
        {empresa.endereco && (
          <p className="text-sm suave">
            {empresa.endereco}
            {empresa.maps_url && (
              <>
                {" · "}
                <a href={empresa.maps_url} target="_blank" rel="noreferrer" className="underline">
                  Ver no mapa
                </a>
              </>
            )}
          </p>
        )}
        {unidades.length > 1 && (
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="rounded-lg px-3 py-2 text-sm">
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        )}
      </header>

      {aba === "agendar" ? (
        <section className="mt-6 grid gap-3" aria-label="Serviços">
          {servicos.length === 0 && <p className="text-center suave">Nenhum serviço disponível no momento.</p>}
          {servicos.map((s) => (
            <button
              key={s.id}
              onClick={() => setServico(s)}
              className="cartao rounded-xl p-4 text-left transition hover:scale-[1.01]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{s.nome}</span>
                <span className="font-semibold whitespace-nowrap">{reais(s.preco_centavos)}</span>
              </div>
              <div className="mt-1 text-sm suave">
                {s.duracao_min} min{s.observacao ? ` · ${s.observacao}` : ""}
              </div>
            </button>
          ))}
        </section>
      ) : (
        <Historico slug={empresa.slug} pagamento={pagamento} />
      )}

      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 cartao rounded-full p-1 flex gap-1 shadow-lg backdrop-blur">
        {(["agendar", "historico"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className="chip rounded-full px-6 py-2 text-sm font-medium border border-transparent"
            data-ativo={aba === a}
          >
            {a === "agendar" ? "Agendar" : "Histórico"}
          </button>
        ))}
      </nav>

      {servico && (
        <Agendar
          slug={empresa.slug}
          servico={servico}
          campos={campos}
          pagamento={pagamento}
          onFechar={() => setServico(null)}
          onVerHistorico={() => {
            setServico(null);
            setAba("historico");
          }}
        />
      )}

      {aviso && (
        <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-xl cartao rounded-xl p-4 text-sm shadow-xl">
          <p>
            Usamos seus dados (nome e telefone) apenas para gerenciar seus agendamentos e enviar avisos sobre eles, conforme a LGPD.
            Você pode pedir a exclusão dos seus dados a qualquer momento.
          </p>
          <button
            className="btn mt-3 rounded-lg px-4 py-2 font-medium"
            onClick={() => {
              try {
                localStorage.setItem("agendou_privacidade", "ok");
              } catch {}
              setAviso(false);
            }}
          >
            Entendi
          </button>
        </div>
      )}
    </div>
  );
}
