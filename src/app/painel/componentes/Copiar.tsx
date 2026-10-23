"use client";

import { useState } from "react";
import { Icone } from "@/components/ui";

/** Botão que copia um texto (ex.: modelo de mensagem, endereço do webhook). */
export default function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sutil btn-sm shrink-0"
      onClick={() =>
        navigator.clipboard?.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        })
      }
    >
      <Icone nome={ok ? "check" : "copiar"} tamanho={13} /> {ok ? "Copiado" : rotulo}
    </button>
  );
}
