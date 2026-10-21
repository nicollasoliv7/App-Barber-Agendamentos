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
  unidades: { id: string; nome: string; endereco: string | null; maps_url: string | null }[];
  pixel?: string | null;
  servicos: ServicoPub[];
  campos: CampoPub[];
  pagamento: PagamentoCfg;
}

export default function PaginaPublica({ empresa, unidades, servicos, campos, pagamento, pixel }: Props) {
  const [aba, setAba] = useState<"agendar" | "historico">("agendar");
  const [servico, setServico] = useState<ServicoPub | null>(null);
  const [aviso, setAviso] = useState<boolean | null>(null); // null = ainda não sabemos (antes de ler o navegador)
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

  // Pixel de campanha: só carrega depois que o visitante viu e aceitou o aviso de privacidade (LGPD)
  useEffect(() => {
    if (aviso !== false || !pixel || !/^\d{5,20}$/.test(pixel)) return;
    const w = window as unknown as { fbq?: unknown };
    if (w.fbq) return;
    const sc = document.createElement("script");
    sc.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`;
    document.head.appendChild(sc);
  }, [aviso, pixel]);

  const unidadeAtual = unidades.find((u) => u.id === unidade);
  const endereco = unidadeAtual?.endereco ?? empresa.endereco;
  const mapsUrl = unidadeAtual?.maps_url ?? empresa.maps_url;

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
        {unidades.length > 1 && (
          <select
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm"
            aria-label="Unidade"
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        )}
        {unidades.length === 1 && <p className="text-sm font-medium">{unidades[0].nome}</p>}
        {endereco && (
          <p className="text-sm suave">
            {endereco}
            {mapsUrl && (
              <>
                {" · "}
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="underline">
                  Ver no mapa
                </a>
              </>
            )}
          </p>
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
          unidade={unidade || undefined}
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
