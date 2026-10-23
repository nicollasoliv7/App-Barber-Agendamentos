"use client";

import { useState } from "react";
import type { CampoId, Politica } from "@/lib/importacao/campos";
import type { Relatorio } from "@/lib/importacao";
import { Icone } from "@/components/ui";
import { analisarImportacao, cancelarImportacao, confirmarImportacao, enviarArquivoImportacao } from "../../../acoes-importacao";
import EtapaArquivo from "./_etapas/EtapaArquivo";
import EtapaColunas from "./_etapas/EtapaColunas";
import EtapaConcluida from "./_etapas/EtapaConcluida";
import EtapaRevisao, { type FiltroLinhas } from "./_etapas/EtapaRevisao";
import type { Envio, Resultado } from "./_etapas/tipos";

const ETAPAS = ["Arquivo", "Colunas", "Revisão", "Concluído"];

/** Assistente de importação de clientes (arquivo → colunas → revisão → concluído). Cada etapa fica em ./_etapas. */
export default function Importador() {
  const [etapa, setEtapa] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [map, setMap] = useState<Partial<Record<CampoId, number>>>({});
  const [ddd, setDdd] = useState("");
  const [politica, setPolitica] = useState<Politica>("manter");
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [filtro, setFiltro] = useState<FiltroLinhas>("todos");
  const [res, setRes] = useState<Resultado | null>(null);

  async function enviar(arquivo: File) {
    setErro("");
    if (arquivo.size > 5 * 1024 * 1024) return setErro("Arquivo maior que 5 MB.");
    setOcupado(true);
    const fd = new FormData();
    fd.set("arquivo", arquivo);
    const r = await enviarArquivoImportacao(fd).catch(() => ({ ok: false as const, erro: "Falha no envio. Verifique sua conexão." }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setEnvio(r.dados);
    setMap(r.dados.sugestao);
    setEtapa(1);
  }

  async function analisar() {
    if (!envio) return;
    setErro("");
    setOcupado(true);
    const r = await analisarImportacao(envio.id, map as Record<string, number | null>, ddd);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setRel(r.dados);
    setFiltro(r.dados.erros ? "erro" : "todos");
    setEtapa(2);
  }

  async function confirmar() {
    if (!envio) return;
    setErro("");
    setOcupado(true);
    const r = await confirmarImportacao(envio.id, map as Record<string, number | null>, ddd, politica);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setRes(r.dados);
    setEtapa(3);
  }

  async function recomecar(cancelar = true) {
    if (cancelar && envio && etapa < 3) await cancelarImportacao(envio.id);
    setEnvio(null);
    setRel(null);
    setRes(null);
    setMap({});
    setErro("");
    setEtapa(0);
  }

  return (
    <div className="card p-4 md:p-6">
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Etapas da importação">
        {ETAPAS.map((e, i) => (
          <li key={e} aria-current={i === etapa ? "step" : undefined} className={`flex items-center gap-2 text-sm ${i === etapa ? "text-white" : i < etapa ? "text-[#7ee2b0]" : "faint"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${i === etapa ? "border-[var(--coral)] bg-[var(--coral)]/20" : "border-white/15"}`}>
              {i < etapa ? "✓" : i + 1}
            </span>
            {e}
            {i < ETAPAS.length - 1 && <span className="mx-1 h-px w-6 bg-white/15" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[#ff4d5a]/40 bg-[#ff4d5a]/10 px-3 py-2 text-sm text-[#ffb3b9]">
          <Icone nome="alerta" tamanho={16} className="mt-0.5" /> {erro}
        </div>
      )}

      {etapa === 0 && <EtapaArquivo ocupado={ocupado} onArquivo={enviar} />}

      {etapa === 1 && envio && (
        <EtapaColunas envio={envio} map={map} setMap={setMap} ddd={ddd} setDdd={setDdd} ocupado={ocupado} onAnalisar={analisar} onTrocarArquivo={() => recomecar()} />
      )}

      {etapa === 2 && rel && (
        <EtapaRevisao
          rel={rel}
          politica={politica}
          setPolitica={setPolitica}
          filtro={filtro}
          setFiltro={setFiltro}
          ocupado={ocupado}
          onConfirmar={confirmar}
          onAjustarColunas={() => setEtapa(1)}
          onCancelar={() => recomecar()}
        />
      )}

      {etapa === 3 && res && <EtapaConcluida res={res} onOutroArquivo={() => recomecar(false)} />}
    </div>
  );
}
