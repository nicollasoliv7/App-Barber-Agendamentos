"use client";

import { useState } from "react";
import { formatarDataHora } from "@/lib/tempo";
import { api } from "../cliente-api";
import type { Ag } from "./tipos";

/** Modal de confirmação do cancelamento pelo cliente. */
export default function Cancelar({ ag, onFeito }: { ag: Ag; onFeito: () => void }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="grid gap-3">
      <p>
        Cancelar <strong>{ag.servico}</strong> em <span className="first-letter:uppercase">{formatarDataHora(ag.inicio)}</span>?
      </p>
      {ag.pago_centavos > 0 && <p className="text-sm suave">O valor pago será tratado diretamente com a barbearia.</p>}
      {erro && <p className="text-sm text-[#ff9aa2]">{erro}</p>}
      <button
        disabled={ocupado}
        className="btn btn-quente w-full !py-3"
        onClick={async () => {
          setOcupado(true);
          try {
            await api(`/api/cliente/agendamentos/${ag.id}/cancelar`, { json: {} });
            onFeito();
          } catch (e) {
            setErro((e as Error).message);
            setOcupado(false);
          }
        }}
      >
        Sim, cancelar
      </button>
    </div>
  );
}
