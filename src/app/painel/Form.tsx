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
    <form ref={ref} action={acao} className={className} aria-busy={pendente}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        {botao && (
          <button disabled={pendente} className="btn btn-quente">
            {pendente ? "Salvando…" : botao}
          </button>
        )}
        <span role="status" aria-live="polite" className="text-sm">
          {estado?.erro && <span className="text-[#ff9aa2]">{estado.erro}</span>}
          {estado?.ok && !pendente && <span className="text-[#7ee2b0]">✓ {estado.ok}</span>}
        </span>
      </div>
    </form>
  );
}

export function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className ?? ""}`}>
      <span className="rotulo">{rotulo}</span>
      {children}
    </label>
  );
}

export const inp = "input";

export function Cabecalho({ titulo, descricao, children }: { titulo: string; descricao?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm muted">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
