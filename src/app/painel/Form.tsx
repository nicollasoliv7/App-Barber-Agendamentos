"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Estado } from "./acoes";

/** Formulário com feedback (erro/sucesso) para server actions. */
export function Form({
  action,
  children,
  className,
  botao = "Salvar",
  resetar,
}: {
  action: (s: Estado, f: FormData) => Promise<Estado>;
  children: React.ReactNode;
  className?: string;
  botao?: string | null;
  resetar?: boolean;
}) {
  const [estado, acao, pendente] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetar && estado?.ok) ref.current?.reset();
  }, [estado, resetar]);
  return (
    <form ref={ref} action={acao} className={className}>
      {children}
      <div className="flex items-center gap-3">
        {botao && (
          <button disabled={pendente} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pendente ? "Salvando…" : botao}
          </button>
        )}
        {estado?.erro && <span className="text-sm text-red-600">{estado.erro}</span>}
        {estado?.ok && !pendente && <span className="text-sm text-teal-700">{estado.ok}</span>}
      </div>
    </form>
  );
}

export function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ""}`}>
      <span className="text-slate-600">{rotulo}</span>
      {children}
    </label>
  );
}

export const inp = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
