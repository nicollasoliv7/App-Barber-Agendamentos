"use client";

import { useActionState } from "react";
import { entrar } from "../acoes";

export default function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="grid gap-3" aria-busy={pendente}>
      <label className="grid gap-1.5">
        <span className="rotulo">E-mail</span>
        <input name="email" type="email" required autoComplete="username" />
      </label>
      <label className="grid gap-1.5">
        <span className="rotulo">Senha</span>
        <input name="senha" type="password" required autoComplete="current-password" />
      </label>
      {estado?.erro && (
        <p role="alert" className="text-sm text-[#ff9aa2]">
          {estado.erro}
        </p>
      )}
      <button disabled={pendente} className="btn btn-key mt-1 w-full !py-2.5">
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
