"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CAMPOS, type CampoId, type Politica } from "@/lib/importacao/campos";
import type { Relatorio, LinhaAnalisada } from "@/lib/importacao";
import { Icone } from "@/components/ui";
import { formatarTelefone } from "@/lib/validacao";
import { analisarImportacao, cancelarImportacao, confirmarImportacao, enviarArquivoImportacao } from "../../../acoes-importacao";

type Envio = { id: string; formato: string; colunas: string[]; amostra: string[][]; total: number; sugestao: Partial<Record<CampoId, number>> };
type Resultado = {
  total: number;
  inseridos: number;
  completados: number;
  mantidos: number;
  duplicadosArquivo: number;
  erros: number;
  detalhesErros: { linha: number; motivos: string[] }[];
  detalhesAvisos: { linha: number; motivos: string[] }[];
};

const ETAPAS = ["Arquivo", "Colunas", "Revisão", "Concluído"];
const SITUACAO: Record<LinhaAnalisada["situacao"], { rotulo: string; classe: string }> = {
  novo: { rotulo: "Novo", classe: "badge-ok" },
  existente: { rotulo: "Já existe", classe: "badge-neutro" },
  duplicado_arquivo: { rotulo: "Repetido no arquivo", classe: "badge-warn" },
  erro: { rotulo: "Erro", classe: "badge-danger" },
};

function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Importador() {
  const [etapa, setEtapa] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [map, setMap] = useState<Partial<Record<CampoId, number>>>({});
  const [ddd, setDdd] = useState("");
  const [politica, setPolitica] = useState<Politica>("manter");
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [filtro, setFiltro] = useState<"todos" | LinhaAnalisada["situacao"]>("todos");
  const [res, setRes] = useState<Resultado | null>(null);
  const input = useRef<HTMLInputElement>(null);

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

  const usadas = new Set(Object.values(map).filter((v) => v !== undefined));
  const faltaObrig = CAMPOS.filter((c) => c.obrigatorio && map[c.id] === undefined);
  const linhasFiltradas = rel ? rel.linhas.filter((l) => filtro === "todos" || l.situacao === filtro) : [];

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

      {etapa === 0 && (
        <div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const f = e.dataTransfer.files[0];
              if (f) enviar(f);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              arrastando ? "border-[var(--coral)] bg-[var(--coral)]/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]"
            }`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.06]">
              <Icone nome="upload" tamanho={22} />
            </span>
            <span className="font-medium">{ocupado ? "Lendo o arquivo…" : "Arraste o arquivo aqui ou clique para escolher"}</span>
            <span className="text-sm muted">CSV ou Excel (.xlsx) exportado do seu sistema atual · até 5 MB</span>
            <input
              ref={input}
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={ocupado}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) enviar(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="mt-4 grid gap-2 text-sm muted md:grid-cols-3">
            <p>
              <b className="text-white">1.</b> No sistema antigo, procure &quot;Exportar clientes&quot; ou &quot;Relatório de clientes&quot;.
            </p>
            <p>
              <b className="text-white">2.</b> Salve em CSV ou Excel. Não precisa arrumar as colunas.
            </p>
            <p>
              <b className="text-white">3.</b> Envie aqui: você confere tudo antes de importar.
            </p>
          </div>
        </div>
      )}

      {etapa === 1 && envio && (
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
            <button className="btn btn-quente" disabled={ocupado || faltaObrig.length > 0} onClick={analisar}>
              {ocupado ? "Analisando…" : "Validar dados"}
            </button>
            <button className="btn btn-sutil" onClick={() => recomecar()}>
              Trocar arquivo
            </button>
            {faltaObrig.length > 0 && <span className="text-sm text-[#ffcf8a]">Escolha a coluna de: {faltaObrig.map((c) => c.rotulo).join(" e ")}</span>}
          </div>
        </div>
      )}

      {etapa === 2 && rel && (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Contador rotulo="Novos clientes" valor={rel.novos} classe="text-[#7ee2b0]" texto="serão cadastrados" />
            <Contador rotulo="Já existem" valor={rel.existentes} texto="mesmo telefone" />
            <Contador rotulo="Repetidos no arquivo" valor={rel.duplicadosArquivo} classe="text-[#ffcf8a]" texto="só a 1ª ocorrência entra" />
            <Contador rotulo="Com erro" valor={rel.erros} classe="text-[#ff9aa2]" texto="não serão importados" />
          </div>

          {rel.existentes > 0 && (
            <fieldset className="card p-4">
              <legend className="px-1 text-sm font-medium">O que fazer com os {rel.existentes} cliente(s) que já existem?</legend>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 p-3 text-sm has-[:checked]:border-[var(--coral)]/70">
                  <input type="radio" name="pol" checked={politica === "manter"} onChange={() => setPolitica("manter")} className="mt-0.5" />
                  <span>
                    <b>Manter como estão</b> <span className="text-xs text-[#7ee2b0]">recomendado</span>
                    <span className="block text-xs muted">Nada muda nos clientes atuais.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 p-3 text-sm has-[:checked]:border-[var(--coral)]/70">
                  <input type="radio" name="pol" checked={politica === "completar"} onChange={() => setPolitica("completar")} className="mt-0.5" />
                  <span>
                    <b>Completar campos vazios</b>
                    <span className="block text-xs muted">Preenche só e-mail, observações, nascimento e CPF que estiverem em branco. Nunca troca o que já existe.</span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar linhas">
              {(["todos", "novo", "existente", "duplicado_arquivo", "erro"] as const).map((k) => (
                <button key={k} data-ativo={filtro === k} className="chip !py-1 !text-xs" onClick={() => setFiltro(k)}>
                  {k === "todos" ? `Todas (${rel.total})` : `${SITUACAO[k].rotulo} (${rel.linhas.filter((l) => l.situacao === k).length})`}
                </button>
              ))}
              {rel.erros > 0 && (
                <button
                  className="btn btn-sutil btn-sm ml-auto"
                  onClick={() =>
                    baixarCsv("erros-importacao.csv", [
                      ["Linha", "Nome", "Telefone", "Problema"],
                      ...rel.linhas.filter((l) => l.situacao === "erro").map((l) => [l.linha, l.nome, l.telefone ?? "", l.erros.join("; ")]),
                    ])
                  }
                >
                  <Icone nome="download" tamanho={13} /> Baixar linhas com erro
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-xl border border-white/[0.08]">
              <table className="tabela text-[13px]">
                <thead className="sticky top-0 bg-[#101215]">
                  <tr>
                    <th>Linha</th>
                    <th>Situação</th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th>Observações da validação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.slice(0, 300).map((l) => (
                    <tr key={l.linha}>
                      <td className="mono faint">{l.linha}</td>
                      <td>
                        <span className={`badge ${SITUACAO[l.situacao].classe}`}>{SITUACAO[l.situacao].rotulo}</span>
                      </td>
                      <td>{l.nome || <span className="faint">—</span>}</td>
                      <td className="mono whitespace-nowrap">{l.telefone ? formatarTelefone(l.telefone) : <span className="faint">—</span>}</td>
                      <td className="muted">{l.email ?? "—"}</td>
                      <td className="text-xs">
                        {l.erros.map((e) => (
                          <div key={e} className="text-[#ff9aa2]">
                            {e}
                          </div>
                        ))}
                        {l.avisos.map((e) => (
                          <div key={e} className="text-[#ffcf8a]">
                            {e}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhasFiltradas.length > 300 && <p className="p-3 text-center text-xs muted">Mostrando 300 de {linhasFiltradas.length} linhas.</p>}
              {linhasFiltradas.length === 0 && <p className="p-6 text-center text-sm muted">Nenhuma linha nesta categoria.</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-quente" disabled={ocupado || rel.novos + (politica === "completar" ? rel.existentes : 0) === 0} onClick={confirmar}>
              {ocupado
                ? "Importando…"
                : politica === "completar" && rel.existentes
                  ? `Importar ${rel.novos} e completar ${rel.existentes}`
                  : `Importar ${rel.novos} cliente${rel.novos === 1 ? "" : "s"}`}
            </button>
            <button className="btn btn-sutil" onClick={() => setEtapa(1)} disabled={ocupado}>
              Ajustar colunas
            </button>
            <button className="btn btn-sutil" onClick={() => recomecar()} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {etapa === 3 && res && (
        <div className="grid gap-5" role="status">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#3ecf8e]/15 text-[#7ee2b0]">
              <Icone nome="check" tamanho={22} />
            </span>
            <div>
              <p className="text-lg font-semibold">Importação concluída</p>
              <p className="text-sm muted">Os dados brutos do arquivo foram descartados; ficou só o resumo abaixo.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Contador rotulo="Cadastrados" valor={res.inseridos} classe="text-[#7ee2b0]" />
            <Contador rotulo="Completados" valor={res.completados} />
            <Contador rotulo="Mantidos sem mudança" valor={res.mantidos} />
            <Contador rotulo="Não importados" valor={res.erros + res.duplicadosArquivo} classe="text-[#ff9aa2]" texto="erros + repetidos" />
          </div>
          {res.detalhesErros.length > 0 && (
            <button
              className="btn btn-sutil w-fit"
              onClick={() =>
                baixarCsv("relatorio-importacao.csv", [
                  ["Linha", "Tipo", "Detalhe"],
                  ...res.detalhesErros.map((e) => [e.linha, "Erro (não importada)", e.motivos.join("; ")]),
                  ...res.detalhesAvisos.map((e) => [e.linha, "Aviso", e.motivos.join("; ")]),
                ])
              }
            >
              <Icone nome="download" tamanho={14} /> Baixar relatório de erros e avisos
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/painel/clientes?seg=importados" className="btn btn-key">
              Ver clientes importados
            </Link>
            <button className="btn btn-sutil" onClick={() => recomecar(false)}>
              Importar outro arquivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Contador({ rotulo, valor, classe = "", texto }: { rotulo: string; valor: number; classe?: string; texto?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="text-xs muted">{rotulo}</div>
      <div className={`text-2xl font-semibold num ${classe}`}>{valor}</div>
      {texto && <div className="text-[11px] faint">{texto}</div>}
    </div>
  );
}
