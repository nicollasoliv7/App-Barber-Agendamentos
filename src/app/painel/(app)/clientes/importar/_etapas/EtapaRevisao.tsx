"use client";

import type { Politica } from "@/lib/importacao/campos";
import type { LinhaAnalisada, Relatorio } from "@/lib/importacao";
import { Icone } from "@/components/ui";
import { formatarTelefone } from "@/lib/validacao";
import Contador from "./Contador";
import { baixarCsv } from "./relatorioCsv";

export type FiltroLinhas = "todos" | LinhaAnalisada["situacao"];

const SITUACAO: Record<LinhaAnalisada["situacao"], { rotulo: string; classe: string }> = {
  novo: { rotulo: "Novo", classe: "badge-ok" },
  existente: { rotulo: "Já existe", classe: "badge-neutro" },
  duplicado_arquivo: { rotulo: "Repetido no arquivo", classe: "badge-warn" },
  erro: { rotulo: "Erro", classe: "badge-danger" },
};

/** Etapa 3: resumo da validação, política para clientes que já existem e linhas por situação. */
export default function EtapaRevisao(p: {
  rel: Relatorio;
  politica: Politica;
  setPolitica: (v: Politica) => void;
  filtro: FiltroLinhas;
  setFiltro: (v: FiltroLinhas) => void;
  ocupado: boolean;
  onConfirmar: () => void;
  onAjustarColunas: () => void;
  onCancelar: () => void;
}) {
  const { rel, politica, setPolitica, filtro, setFiltro, ocupado } = p;
  const linhasFiltradas = rel.linhas.filter((l) => filtro === "todos" || l.situacao === filtro);
  return (
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
        <button className="btn btn-quente" disabled={ocupado || rel.novos + (politica === "completar" ? rel.existentes : 0) === 0} onClick={p.onConfirmar}>
          {ocupado
            ? "Importando…"
            : politica === "completar" && rel.existentes
              ? `Importar ${rel.novos} e completar ${rel.existentes}`
              : `Importar ${rel.novos} cliente${rel.novos === 1 ? "" : "s"}`}
        </button>
        <button className="btn btn-sutil" onClick={p.onAjustarColunas} disabled={ocupado}>
          Ajustar colunas
        </button>
        <button className="btn btn-sutil" onClick={p.onCancelar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
