"use client";

import { useEffect, useState } from "react";
import { api, mascaraTelefone } from "../cliente-api";

/** Acesso do cliente ao histórico: telefone → senha, ou código por WhatsApp para criar/redefinir a senha. */
export default function LoginCliente({ slug, onEntrou }: { slug: string; onEntrou: () => void }) {
  const [etapa, setEtapa] = useState<"telefone" | "senha" | "codigo">("telefone");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [ver, setVer] = useState(false);
  const [info, setInfo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [reenvio, setReenvio] = useState(0);
  const base = `/api/public/${slug}/auth`;

  useEffect(() => {
    if (reenvio <= 0) return;
    const t = setTimeout(() => setReenvio(reenvio - 1), 1000);
    return () => clearTimeout(t);
  }, [reenvio]);

  async function rodar(fn: () => Promise<void>) {
    setErro("");
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function pedirCodigo() {
    let r: { reenvioEmSegundos: number; codigoDev?: string; enviado?: boolean };
    try {
      r = await api<{ reenvioEmSegundos: number; codigoDev?: string; enviado?: boolean }>(`${base}/codigo`, { json: { telefone } });
    } catch (e) {
      if ((e as { status?: number }).status !== 429) throw e;
      // já existe um código recente: segue para a etapa do código
      setEtapa("codigo");
      setReenvio(60);
      setInfo("Já enviamos um código há pouco. Use o último código que você recebeu no WhatsApp.");
      return;
    }
    setReenvio(r.reenvioEmSegundos);
    setEtapa("codigo");
    setInfo(
      `${
        r.enviado
          ? "Enviamos um código de 6 dígitos para o seu WhatsApp."
          : "Não foi possível enviar o código pelo WhatsApp agora. Fale com a barbearia ou use o link do seu agendamento."
      }${r.codigoDev ? ` (Modo demonstração: o código é ${r.codigoDev})` : ""}`,
    );
  }

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold">Seus agendamentos</h2>
      <p className="text-sm suave mb-4">Entre com o telefone que você usou para agendar.</p>

      {etapa === "telefone" && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(async () => {
              const r = await api<{ cadastrado: boolean; temSenha: boolean; nome: string | null }>(`${base}/telefone`, { json: { telefone } });
              if (r.temSenha) {
                setInfo(r.nome ? `Olá, ${r.nome}! Digite sua senha.` : "Digite sua senha.");
                setEtapa("senha");
              } else {
                if (!r.cadastrado) setInfo("Número ainda sem cadastro. Vamos criar seu acesso.");
                await pedirCodigo();
              }
            });
          }}
        >
          <input
            required
            inputMode="tel"
            placeholder="(11) 91234-5678"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            className="rounded-lg px-3 py-2"
          />
          <button disabled={ocupado} className="btn btn-quente w-full !py-3">
            Continuar
          </button>
        </form>
      )}

      {etapa === "senha" && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(async () => {
              await api(`${base}/login`, { json: { telefone, senha } });
              onEntrou();
            });
          }}
        >
          <p className="text-sm">{info}</p>
          <input required type={ver ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} className="rounded-lg px-3 py-2" placeholder="Senha" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar senha
          </label>
          <button disabled={ocupado} className="btn btn-quente w-full !py-3">
            Entrar
          </button>
          <button type="button" className="text-sm underline suave" onClick={() => rodar(pedirCodigo)}>
            Esqueci minha senha
          </button>
        </form>
      )}

      {etapa === "codigo" && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(async () => {
              await api(`${base}/senha`, { json: { telefone, codigo, senha, nome } });
              onEntrou();
            });
          }}
        >
          <p className="text-sm">{info}</p>
          <input
            required
            inputMode="numeric"
            maxLength={6}
            placeholder="Código de 6 dígitos"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            className="rounded-lg px-3 py-2 tracking-widest"
          />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome (se ainda não agendou)" className="rounded-lg px-3 py-2" />
          <input
            required
            minLength={6}
            type={ver ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Crie uma senha (mín. 6 caracteres)"
            className="rounded-lg px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar senha
          </label>
          <button disabled={ocupado} className="btn btn-quente w-full !py-3">
            Confirmar
          </button>
          <button type="button" disabled={reenvio > 0} className="text-sm underline suave disabled:no-underline" onClick={() => rodar(pedirCodigo)}>
            {reenvio > 0 ? `Reenviar código em ${reenvio}s` : "Reenviar código"}
          </button>
        </form>
      )}

      {erro && <p className="mt-3 text-sm text-[#ff9aa2]">{erro}</p>}
      {etapa !== "telefone" && (
        <button
          className="mt-3 text-sm suave"
          onClick={() => {
            setEtapa("telefone");
            setErro("");
            setInfo("");
          }}
        >
          ‹ Trocar telefone
        </button>
      )}
    </section>
  );
}
