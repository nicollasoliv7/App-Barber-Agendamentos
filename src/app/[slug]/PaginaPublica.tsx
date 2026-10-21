"use client";

import { useEffect, useState } from "react";
import { Aurora, Icone } from "@/components/ui";
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
export interface EmpresaPub {
  nome: string;
  slug: string;
  endereco: string | null;
  maps_url: string | null;
  logo_url: string | null;
  whatsapp: string | null;
}

interface Props {
  empresa: EmpresaPub;
  unidades: { id: string; nome: string; endereco: string | null; maps_url: string | null }[];
  pixel?: string | null;
  totalProfissionais: number;
  whatsappAtivo: boolean;
  regras: { cancelamentoH: number };
  servicos: ServicoPub[];
  campos: CampoPub[];
  pagamento: PagamentoCfg;
}

export default function PaginaPublica(props: Props) {
  const { empresa, unidades, pixel, servicos, campos, pagamento } = props;
  const [aba, setAba] = useState<"agendar" | "historico">("agendar");
  const [unidade, setUnidade] = useState(unidades[0]?.id ?? "");
  // Aviso de cookies só existe quando a empresa usa pixel de campanha (é o único rastreamento da página)
  const [consentimento, setConsentimento] = useState<"sim" | "nao" | null>(null);

  useEffect(() => {
    if (!pixel) return;
    try {
      const v = localStorage.getItem("agendou_pixel");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConsentimento(v === "sim" || v === "nao" ? v : null);
    } catch {}
  }, [pixel]);

  // Pixel de campanha: só carrega depois do aceite (LGPD, R34)
  useEffect(() => {
    if (consentimento !== "sim" || !pixel || !/^\d{5,20}$/.test(pixel)) return;
    const w = window as unknown as { fbq?: unknown };
    if (w.fbq) return;
    const sc = document.createElement("script");
    sc.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`;
    document.head.appendChild(sc);
  }, [consentimento, pixel]);

  const unidadeAtual = unidades.find((u) => u.id === unidade);
  const endereco = unidadeAtual?.endereco ?? empresa.endereco;
  const mapsUrl = unidadeAtual?.maps_url ?? empresa.maps_url;
  const iniciais = empresa.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden">
        <Aurora />
      </div>

      <div className="relative mx-auto max-w-xl px-4 pb-32 pt-8">
        <header className="flex flex-col items-center gap-3 text-center surgir">
          {empresa.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logo_url} alt={`Logo da ${empresa.nome}`} className="h-20 w-20 rounded-2xl object-cover ring-1 ring-white/15" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-2xl text-2xl font-semibold text-white ring-1 ring-white/20" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--t-primaria) 70%, #ffd29a), var(--t-primaria))" }}>
              {iniciais}
            </div>
          )}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{empresa.nome}</h1>
          {unidades.length > 1 && (
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade" className="!w-auto !rounded-full !px-4 !py-1.5 text-sm">
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
          {unidades.length === 1 && <p className="text-sm font-medium">{unidades[0].nome}</p>}
          {endereco && (
            <p className="flex items-center gap-1.5 text-sm suave">
              <Icone nome="mapa" tamanho={14} />
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:decoration-white">
                  {endereco}
                </a>
              ) : (
                endereco
              )}
            </p>
          )}
          <ul className="mt-1 flex flex-wrap justify-center gap-2 text-xs" aria-label="Vantagens">
            <li className="eyebrow">
              <Icone nome="raio" tamanho={12} /> Confirmação na hora
            </li>
            <li className="eyebrow">
              <Icone nome="escudo" tamanho={12} /> Sem cadastro
            </li>
            <li className="eyebrow">
              <Icone nome="calendario" tamanho={12} /> Remarque pelo link
            </li>
          </ul>
        </header>

        <nav className="mt-7 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1 backdrop-blur" aria-label="Seções">
          {(["agendar", "historico"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              aria-current={aba === a ? "page" : undefined}
              className={`rounded-lg py-2 text-sm font-medium transition-colors ${aba === a ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" : "suave hover:text-white"}`}
            >
              {a === "agendar" ? "Agendar horário" : "Meus agendamentos"}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {aba === "agendar" ? (
            <Agendar
              slug={empresa.slug}
              empresa={empresa}
              endereco={endereco}
              unidade={unidade || undefined}
              servicos={servicos}
              campos={campos}
              pagamento={pagamento}
              totalProfissionais={props.totalProfissionais}
              whatsappAtivo={props.whatsappAtivo}
              cancelamentoH={props.regras.cancelamentoH}
            />
          ) : (
            <Historico slug={empresa.slug} pagamento={pagamento} />
          )}
        </div>

        <footer className="mt-12 text-center text-xs suave">
          Seus dados (nome e telefone) são usados só para gerenciar seus agendamentos nesta barbearia, conforme a LGPD.
          <br />
          Agendamento por <span className="font-medium text-white/80">Agendou</span>
        </footer>
      </div>

      {pixel && consentimento === null && (
        <div role="dialog" aria-label="Cookies" className="glass fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-xl p-4 text-sm">
          <p>Esta página usa um cookie de campanha (pixel) para medir anúncios. Você aceita?</p>
          <div className="mt-3 flex gap-2">
            {(["sim", "nao"] as const).map((v) => (
              <button
                key={v}
                className={`btn ${v === "sim" ? "btn-key" : "btn-sutil"}`}
                onClick={() => {
                  try {
                    localStorage.setItem("agendou_pixel", v);
                  } catch {}
                  setConsentimento(v);
                }}
              >
                {v === "sim" ? "Aceitar" : "Recusar"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
