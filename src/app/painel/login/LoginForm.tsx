"use client";

import { useActionState, useState } from "react";
import { mascaraTelefone } from "../../[slug]/cliente-api";
import { entrar } from "../acoes";

export default function LoginForm() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  const [telefone, setTelefone] = useState("");
  return (
    <form action={acao} className="grid gap-3" aria-busy={pendente}>
      <label className="grid gap-1.5">
        <span className="rotulo">Celular (WhatsApp)</span>
        <input
          name="telefone"
          type="tel"
          inputMode="numeric"
          required
          autoComplete="username"
          placeholder="(11) 90000-0000"
          value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
        />
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
