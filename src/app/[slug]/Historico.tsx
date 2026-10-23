"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarDataHora, formatarDia, reais } from "@/lib/tempo";
import { api, mascaraTelefone, type PagamentoCfg } from "./cliente-api";
import Modal from "./Modal";
import Pagamento from "./Pagamento";

type Ag = {
  id: string;
  inicio: string;
  status: string;
  preco_centavos: number;
  servico: string;
  profissional: string;
  pago_centavos: number;
  token: string;
  pode_cancelar: boolean;
  pode_remarcar: boolean;
  cancelado_por: string | null;
};

const ROTULO: Record<string, string> = {
  pendente_pagamento: "Aguardando pagamento",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};

export default function Historico({ slug, pagamento }: { slug: string; pagamento: PagamentoCfg }) {
  const [estado, setEstado] = useState<"carregando" | "login" | "ok">("carregando");
  const [dados, setDados] = useState<{ cliente: { nome: string }; agendamentos: Ag[]; temMais: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [acao, setAcao] = useState<{ tipo: "cancelar" | "remarcar" | "pagar"; ag: Ag } | null>(null);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async (p = 0) => {
    try {
      const r = await api<{ cliente: { nome: string }; agendamentos: Ag[]; temMais: boolean }>(
        `/api/cliente/agendamentos?pagina=${p}&limite=10`,
      );
      setDados((prev) => (p === 0 || !prev ? r : { ...r, agendamentos: [...prev.agendamentos, ...r.agendamentos] }));
      setPagina(p);
      setEstado("ok");
    } catch (e) {
      if ((e as { status?: number }).status === 401) setEstado("login");
      else setMsg((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // carga inicial: o setState acontece só depois da resposta (assíncrono)
    api<{ cliente: { nome: string }; agendamentos: Ag[]; temMais: boolean }>(`/api/cliente/agendamentos?pagina=0&limite=10`)
      .then((r) => {
        setDados(r);
        setEstado("ok");
      })
      .catch((e) => (e.status === 401 ? setEstado("login") : setMsg(e.message)));
  }, []);
  const [agora] = useState(() => Date.now());

  if (estado === "carregando") return <p className="mt-10 text-center suave">Carregando…</p>;
  if (estado === "login") return <Login slug={slug} onEntrou={() => carregar(0)} />;

  return (
    <section className="mt-6 grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Olá, {dados?.cliente.nome.split(" ")[0]}</h2>
        <button
          className="text-sm underline suave"
          onClick={async () => {
            await api(`/api/public/${slug}/auth/logout`, { json: {} });
            setDados(null);
            setEstado("login");
          }}
        >
          Sair
        </button>
      </div>
      {msg && <p className="card rounded-lg p-3 text-sm">{msg}</p>}
      {dados?.agendamentos.length === 0 && <p className="suave">Você ainda não tem agendamentos.</p>}
      {dados?.agendamentos.map((a) => {
        const aberto = a.status === "confirmado" || a.status === "pendente_pagamento";
        const futuro = new Date(a.inicio).getTime() > agora;
        const podePagar = aberto && futuro && pagamento.modo !== "desativado" && a.pago_centavos === 0;
        return (
          <article key={a.id} className="card rounded-xl p-4" style={{ opacity: aberto && futuro ? 1 : 0.7 }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{a.servico}</div>
                <div className="text-sm suave">com {a.profissional}</div>
              </div>
              <span className="badge badge-sem-ponto">{ROTULO[a.status] ?? a.status}</span>
            </div>
            <div className="mt-2 text-sm first-letter:uppercase">{formatarDataHora(a.inicio)}</div>
            <div className="text-sm">
              {reais(a.preco_centavos)}
              {a.pago_centavos > 0 && <span className="suave"> · pago {reais(a.pago_centavos)}</span>}
            </div>
            {(podePagar || a.pode_remarcar || a.pode_cancelar) && (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {podePagar && (
                  <button className="btn btn-quente btn-sm" onClick={() => setAcao({ tipo: "pagar", ag: a })}>
                    Pagar
                  </button>
                )}
                {a.pode_remarcar && (
                  <button className="btn btn-sutil btn-sm" onClick={() => setAcao({ tipo: "remarcar", ag: a })}>
                    Remarcar
                  </button>
                )}
                {a.pode_cancelar && (
                  <button className="btn btn-sutil btn-sm" onClick={() => setAcao({ tipo: "cancelar", ag: a })}>
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
      {dados?.temMais && (
        <button className="btn btn-sutil w-full" onClick={() => carregar(pagina + 1)}>
          Ver mais
        </button>
      )}

      {acao?.tipo === "cancelar" && (
        <Modal titulo="Cancelar agendamento" onFechar={() => setAcao(null)}>
          <Cancelar
            ag={acao.ag}
            onFeito={() => {
              setAcao(null);
              setMsg("Agendamento cancelado.");
              carregar(0);
            }}
          />
        </Modal>
      )}
      {acao?.tipo === "remarcar" && (
        <Modal titulo="Remarcar agendamento" onFechar={() => setAcao(null)}>
          <Remarcar
            ag={acao.ag}
            onFeito={() => {
              setAcao(null);
              setMsg("Agendamento remarcado.");
              carregar(0);
            }}
          />
        </Modal>
      )}
      {acao?.tipo === "pagar" && (
        <Modal titulo="Pagamento" onFechar={() => setAcao(null)}>
          <Pagamento
            agendamentoId={acao.ag.id}
            token={acao.ag.token}
            preco={acao.ag.preco_centavos}
            cfg={pagamento}
            obrigatorio={acao.ag.status === "pendente_pagamento"}
            logado
            onPago={() => {
              setAcao(null);
              setMsg("Pagamento recebido. Obrigado!");
              carregar(0);
            }}
            onCancelado={() => {
              setAcao(null);
              carregar(0);
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function Cancelar({ ag, onFeito }: { ag: Ag; onFeito: () => void }) {
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

function Remarcar({ ag, onFeito }: { ag: Ag; onFeito: () => void }) {
  const [dias, setDias] = useState<string[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [inicioJanela, setInicioJanela] = useState(0);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<{ dias: string[] }>(`/api/cliente/agendamentos/${ag.id}/horarios`).then((r) => setDias(r.dias)).catch((e) => setErro(e.message));
  }, [ag.id]);
  useEffect(() => {
    if (!dia) return;
    api<{ horarios: string[] }>(`/api/cliente/agendamentos/${ag.id}/horarios?dia=${dia}`).then((r) => setHoras(r.horarios));
  }, [ag.id, dia]);

  const semana = dias?.slice(inicioJanela, inicioJanela + 7) ?? [];

  return (
    <div className="grid gap-4">
      <div className="card rounded-lg p-3 text-sm">
        Horário atual: <span className="first-letter:uppercase">{formatarDataHora(ag.inicio)}</span>
      </div>
      {!dias ? (
        <p className="suave text-sm">Carregando…</p>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <button disabled={inicioJanela === 0} onClick={() => setInicioJanela(Math.max(0, inicioJanela - 7))} className="px-2 disabled:opacity-30">
              ‹ anteriores
            </button>
            <button
              disabled={inicioJanela + 7 >= dias.length}
              onClick={() => setInicioJanela(inicioJanela + 7)}
              className="px-2 disabled:opacity-30"
            >
              próximos ›
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {semana.map((d) => (
              <button
                key={d}
                data-ativo={dia === d}
                onClick={() => {
                  setDia(d);
                  setHoras(null);
                  setHora(null);
                }} className="chip text-sm first-letter:uppercase">
                {formatarDia(d)}
              </button>
            ))}
          </div>
        </div>
      )}
      {dia && (
        <div className="grid grid-cols-4 gap-2">
          {!horas ? (
            <p className="suave text-sm col-span-4">Carregando…</p>
          ) : horas.length === 0 ? (
            <p className="suave text-sm col-span-4">Sem horários neste dia.</p>
          ) : (
            horas.map((h) => (
              <button key={h} data-ativo={hora === h} onClick={() => setHora(h)} className="chip mono text-sm">
                {h}
              </button>
            ))
          )}
        </div>
      )}
      {erro && <p className="text-sm text-[#ff9aa2]">{erro}</p>}
      <button
        disabled={!dia || !hora}
        className="btn btn-quente w-full !py-3"
        onClick={async () => {
          try {
            await api(`/api/cliente/agendamentos/${ag.id}/remarcar`, { json: { dia, hora } });
            onFeito();
          } catch (e) {
            setErro((e as Error).message);
          }
        }}
      >
        Remarcar para {dia ? formatarDia(dia) : "…"} {hora ?? ""}
      </button>
    </div>
  );
}

function Login({ slug, onEntrou }: { slug: string; onEntrou: () => void }) {
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
