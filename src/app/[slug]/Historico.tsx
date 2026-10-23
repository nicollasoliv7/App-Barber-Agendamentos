"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarDataHora, reais } from "@/lib/tempo";
import { api, type PagamentoCfg } from "./cliente-api";
import Modal from "./Modal";
import Pagamento from "./Pagamento";
import Cancelar from "./_historico/Cancelar";
import LoginCliente from "./_historico/LoginCliente";
import Remarcar from "./_historico/Remarcar";
import type { Ag } from "./_historico/tipos";

const ROTULO: Record<string, string> = {
  pendente_pagamento: "Aguardando pagamento",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};

/** Área "Meus agendamentos": lista, cancelar, remarcar e pagar. O acesso fica em ./_historico/LoginCliente. */
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
  if (estado === "login") return <LoginCliente slug={slug} onEntrou={() => carregar(0)} />;

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
