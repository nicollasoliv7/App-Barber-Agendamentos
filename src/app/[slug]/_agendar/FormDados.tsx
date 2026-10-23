"use client";

import { reais } from "@/lib/tempo";
import { mascaraDoc, mascaraTelefone } from "../cliente-api";
import type { CampoPub, ServicoPub } from "../PaginaPublica";
import { diaLongo } from "./datas";
import type { Prof } from "./tipos";

/** Etapa 4: resumo + nome, WhatsApp e campos extras da barbearia. O botão de enviar fica na barra fixa (form="form-dados"). */
export default function FormDados(p: {
  servico: ServicoPub;
  prof: Prof;
  dia: string;
  hora: string;
  campos: CampoPub[];
  nome: string;
  onNome: (v: string) => void;
  telefone: string;
  onTelefone: (v: string) => void;
  extras: Record<string, string>;
  onExtras: (v: Record<string, string>) => void;
  lembrar: boolean;
  onLembrar: (v: boolean) => void;
  pagamentoObrigatorio: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { extras } = p;
  return (
    <form id="form-dados" onSubmit={p.onSubmit} className="grid gap-4 surgir" aria-labelledby="t-dados">
      <h2 id="t-dados" className="text-lg font-semibold">
        Seus dados
      </h2>
      <div className="card divide-hair text-sm">
        {[
          ["Serviço", `${p.servico.nome} · ${reais(p.servico.preco_centavos)}`],
          ["Profissional", p.prof.nome],
          ["Quando", `${diaLongo(p.dia)} às ${p.hora}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
            <span className="suave">{k}</span>
            <span className="text-right font-medium first-letter:uppercase">{v}</span>
          </div>
        ))}
      </div>
      <label className="grid gap-1.5">
        <span className="rotulo">Nome e sobrenome</span>
        <input required minLength={2} value={p.nome} onChange={(e) => p.onNome(e.target.value)} autoComplete="name" />
      </label>
      <label className="grid gap-1.5">
        <span className="rotulo">WhatsApp</span>
        <input
          required
          inputMode="tel"
          placeholder="(11) 91234-5678"
          value={p.telefone}
          onChange={(e) => p.onTelefone(mascaraTelefone(e.target.value))}
          autoComplete="tel"
          pattern="\(\d{2}\) \d{4,5}-\d{4}"
          title="DDD + número, ex.: (11) 91234-5678"
        />
      </label>
      {p.campos.map((c) => (
        <label key={c.chave} className="grid gap-1.5">
          <span className="rotulo">
            {c.rotulo} {!c.obrigatorio && <span className="faint">(opcional)</span>}
          </span>
          {c.tipo === "textarea" ? (
            <textarea required={c.obrigatorio} value={extras[c.chave] ?? ""} onChange={(e) => p.onExtras({ ...extras, [c.chave]: e.target.value })} rows={2} />
          ) : (
            <input
              required={c.obrigatorio}
              type={c.tipo === "data" ? "date" : "text"}
              inputMode={c.tipo === "cpf" || c.tipo === "cnpj" ? "numeric" : undefined}
              value={extras[c.chave] ?? ""}
              onChange={(e) =>
                p.onExtras({ ...extras, [c.chave]: c.tipo === "cpf" || c.tipo === "cnpj" ? mascaraDoc(e.target.value, c.tipo) : e.target.value })
              }
            />
          )}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm suave">
        <input type="checkbox" checked={p.lembrar} onChange={(e) => p.onLembrar(e.target.checked)} /> Lembrar meus dados neste aparelho
      </label>
      {p.pagamentoObrigatorio && (
        <p className="rounded-lg border border-[#ffb347]/30 bg-[#ffb347]/[0.07] px-3 py-2 text-xs text-[#ffcf8a]">
          Esta barbearia pede o pagamento via Pix para confirmar o horário (ambiente de teste: nenhum valor real é cobrado).
        </p>
      )}
    </form>
  );
}
