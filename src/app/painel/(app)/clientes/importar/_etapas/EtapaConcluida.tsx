"use client";

import Link from "next/link";
import { Icone } from "@/components/ui";
import Contador from "./Contador";
import { baixarCsv } from "./relatorioCsv";
import type { Resultado } from "./tipos";

/** Etapa 4: resultado da importação e relatório de erros/avisos. */
export default function EtapaConcluida({ res, onOutroArquivo }: { res: Resultado; onOutroArquivo: () => void }) {
  return (
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
        <button className="btn btn-sutil" onClick={onOutroArquivo}>
          Importar outro arquivo
        </button>
      </div>
    </div>
  );
}
