"use client";

import { useActionState } from "react";
import { entrar } from "../acoes";

export default function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="grid gap-3">
      <input name="email" type="email" required placeholder="E-mail" className="rounded-lg border px-3 py-2" autoComplete="username" />
      <input name="senha" type="password" required placeholder="Senha" className="rounded-lg border px-3 py-2" autoComplete="current-password" />
      {estado?.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <button disabled={pendente} className="rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50">
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
