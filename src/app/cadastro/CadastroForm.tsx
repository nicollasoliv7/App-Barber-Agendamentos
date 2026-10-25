"use client";

import { useActionState, useState } from "react";
import { mascaraTelefone } from "../[slug]/cliente-api";
import { cadastrar } from "./acoes";

export default function CadastroForm({ plano }: { plano: string }) {
  const [estado, acao, pendente] = useActionState(cadastrar, undefined);
  const [telefone, setTelefone] = useState("");
  return (
    <form action={acao} className="grid gap-3" aria-busy={pendente}>
      <input type="hidden" name="plano" value={plano} />
      <label className="grid gap-1.5">
        <span className="rotulo">Nome da barbearia</span>
        <input name="barbearia" required maxLength={80} autoComplete="organization" placeholder="Ex.: Barbearia do Centro" />
      </label>
      <label className="grid gap-1.5">
        <span className="rotulo">Seu nome</span>
        <input name="nome" required maxLength={80} autoComplete="name" />
      </label>
      <label className="grid gap-1.5">
        <span className="rotulo">Celular (WhatsApp) — será o seu login</span>
        <input
          name="telefone"
          type="tel"
          inputMode="numeric"
          required
          autoComplete="tel"
          placeholder="(11) 90000-0000"
          value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="rotulo">Senha (mínimo 8 caracteres)</span>
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {/* campo-isca: pessoas não veem; robôs preenchem */}
      <input name="site" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-2 text-xs muted">
        <input type="checkbox" name="termos" required className="mt-0.5" />
        <span>
          Li e aceito os{" "}
          <a href="/termos" target="_blank" rel="noopener" className="text-white underline underline-offset-4">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" rel="noopener" className="text-white underline underline-offset-4">
            política de privacidade
          </a>
          .
        </span>
      </label>
      {estado?.erro && (
        <p role="alert" className="text-sm text-[#ff9aa2]">
          {estado.erro}
        </p>
      )}
      <button disabled={pendente} className="btn btn-quente mt-1 w-full !py-2.5">
        {pendente ? "Criando sua conta…" : "Criar conta grátis"}
      </button>
    </form>
  );
}
