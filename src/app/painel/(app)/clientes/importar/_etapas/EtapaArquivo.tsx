"use client";

import { useState } from "react";
import { Icone } from "@/components/ui";

/** Etapa 1: enviar o arquivo (arrastar ou escolher). */
export default function EtapaArquivo({ ocupado, onArquivo }: { ocupado: boolean; onArquivo: (f: File) => void }) {
  const [arrastando, setArrastando] = useState(false);
  return (
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
          if (f) onArquivo(f);
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
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onArquivo(f);
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
  );
}
