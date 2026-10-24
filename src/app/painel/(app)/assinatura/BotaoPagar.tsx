"use client";

import { useActionState } from "react";
import { pagarPlano } from "../../acoes-assinatura";

export default function BotaoPagar({ plano, rotulo, destaque, desabilitado }: { plano: string; rotulo: string; destaque?: boolean; desabilitado?: boolean }) {
  const [estado, acao, pendente] = useActionState(pagarPlano, undefined);
  return (
    <form action={acao} aria-busy={pendente} className="grid gap-2">
      <input type="hidden" name="plano" value={plano} />
      <button disabled={pendente || desabilitado} className={`btn w-full ${destaque ? "btn-quente" : "btn-key"}`}>
        {pendente ? "Abrindo pagamento…" : rotulo}
      </button>
      {estado?.erro && (
        <p role="alert" className="text-xs text-[#ff9aa2]">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
