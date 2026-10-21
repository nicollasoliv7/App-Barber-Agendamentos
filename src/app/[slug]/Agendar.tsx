"use client";

import { useEffect, useState } from "react";
import { formatarDia, reais } from "@/lib/tempo";
import { api, mascaraDoc, mascaraTelefone, type PagamentoCfg } from "./cliente-api";
import type { CampoPub, ServicoPub } from "./PaginaPublica";
import Pagamento from "./Pagamento";
import Modal from "./Modal";

interface Props {
  slug: string;
  servico: ServicoPub;
  campos: CampoPub[];
  pagamento: PagamentoCfg;
  onFechar: () => void;
  onVerHistorico: () => void;
}

type Criado = { id: string; status: string; inicio: string; preco_centavos: number; token: string };

export default function Agendar({ slug, servico, campos, pagamento, onFechar, onVerHistorico }: Props) {
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[] | null>(null);
  const [prof, setProf] = useState<{ id: string; nome: string } | null>(null);
  const [dias, setDias] = useState<string[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [pagando, setPagando] = useState(false);
  const [pago, setPago] = useState(false);

  const base = `/api/public/${slug}`;

  function escolherProf(p: { id: string; nome: string }) {
    setProf(p);
    setDias(null);
    setDia(null);
    setHoras(null);
    setHora(null);
  }
  function escolherDia(d: string) {
    setDia(d);
    setHoras(null);
    setHora(null);
  }

  useEffect(() => {
    api<{ profissionais: { id: string; nome: string }[] }>(`${base}/profissionais?servico=${servico.id}`)
      .then((r) => {
        setProfissionais(r.profissionais);
        if (r.profissionais.length === 1) escolherProf(r.profissionais[0]);
      })
      .catch((e) => setErro(e.message));
  }, [base, servico.id]);

  useEffect(() => {
    if (!prof) return;
    api<{ dias: string[] }>(`${base}/dias?servico=${servico.id}&profissional=${prof.id}`)
      .then((r) => setDias(r.dias))
      .catch((e) => setErro(e.message));
  }, [base, servico.id, prof]);

  useEffect(() => {
    if (!prof || !dia) return;
    api<{ horarios: string[] }>(`${base}/horarios?servico=${servico.id}&profissional=${prof.id}&dia=${dia}`)
      .then((r) => setHoras(r.horarios))
      .catch((e) => setErro(e.message));
  }, [base, servico.id, prof, dia]);

  async function agendar(e: React.FormEvent) {
    e.preventDefault();
    if (!prof || !dia || !hora) return;
    setErro("");
    setEnviando(true);
    try {
      const r = await api<{ agendamento: Criado }>(`${base}/agendamentos`, {
        json: { servico: servico.id, profissional: prof.id, dia, hora, nome, telefone, extras },
      });
      setCriado(r.agendamento);
      if (r.agendamento.status === "pendente_pagamento") setPagando(true);
    } catch (err) {
      const e2 = err as Error & { status?: number };
      setErro(e2.message);
      if (e2.status === 409 && prof && dia) {
        // horário tomado: recarrega horários
        api<{ horarios: string[] }>(`${base}/horarios?servico=${servico.id}&profissional=${prof.id}&dia=${dia}`).then((r) => {
          setHoras(r.horarios);
          setHora(null);
        });
      }
    } finally {
      setEnviando(false);
    }
  }

  if (criado && pagando) {
    return (
      <Modal titulo="Pagamento" onFechar={onFechar}>
        <Pagamento
          agendamentoId={criado.id}
          token={criado.token}
          preco={criado.preco_centavos}
          cfg={pagamento}
          obrigatorio={criado.status === "pendente_pagamento"}
          onPago={() => {
            setPago(true);
            setPagando(false);
          }}
          onCancelado={() => {
            setPagando(false);
            setCriado(null);
            setHora(null);
            setErro("Pagamento cancelado. O horário foi liberado.");
            if (prof && dia)
              api<{ horarios: string[] }>(`${base}/horarios?servico=${servico.id}&profissional=${prof.id}&dia=${dia}`).then((r) =>
                setHoras(r.horarios),
              );
          }}
        />
      </Modal>
    );
  }

  if (criado) {
    return (
      <Modal titulo="Agendamento confirmado" onFechar={onFechar}>
        <div className="text-center grid gap-3">
          <div className="text-5xl">✓</div>
          <p className="text-lg font-semibold">Tudo certo, {nome.split(" ")[0]}!</p>
          <p className="suave">
            {servico.nome} com {prof?.nome}
            <br />
            {dia && formatarDia(dia)} às {hora}
          </p>
          <p className="text-sm suave">Você vai receber a confirmação no WhatsApp.</p>
          {pago && <p className="font-medium">Pagamento recebido.</p>}
          {!pago && pagamento.modo === "opcional" && (
            <button className="btn rounded-lg py-3 font-semibold" onClick={() => setPagando(true)}>
              Pagar agora (Pix)
            </button>
          )}
          <button className="cartao rounded-lg py-3" onClick={onVerHistorico}>
            Ver meus agendamentos
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={servico.nome} onFechar={onFechar}>
      <p className="suave text-sm -mt-2 mb-4">
        {reais(servico.preco_centavos)} · {servico.duracao_min} min
        {servico.descricao ? ` · ${servico.descricao}` : ""}
      </p>

      <Passo titulo="Profissional">
        {!profissionais ? (
          <Carregando />
        ) : profissionais.length === 0 ? (
          <p className="suave text-sm">Nenhum profissional disponível.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profissionais.map((p) => (
              <Chip key={p.id} ativo={prof?.id === p.id} onClick={() => escolherProf(p)}>
                {p.nome}
              </Chip>
            ))}
          </div>
        )}
      </Passo>

      {prof && (
        <Passo titulo="Dia">
          {!dias ? (
            <Carregando />
          ) : dias.length === 0 ? (
            <p className="suave text-sm">Sem dias livres nos próximos dias.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dias.map((d) => (
                <Chip key={d} ativo={dia === d} onClick={() => escolherDia(d)}>
                  <span className="whitespace-nowrap first-letter:uppercase">{formatarDia(d)}</span>
                </Chip>
              ))}
            </div>
          )}
        </Passo>
      )}

      {dia && (
        <Passo titulo="Horário">
          {!horas ? (
            <Carregando />
          ) : horas.length === 0 ? (
            <p className="suave text-sm">Sem horários livres neste dia.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {horas.map((h) => (
                <Chip key={h} ativo={hora === h} onClick={() => setHora(h)}>
                  {h}
                </Chip>
              ))}
            </div>
          )}
        </Passo>
      )}

      {hora && (
        <form onSubmit={agendar} className="grid gap-3">
          <div className="cartao rounded-xl p-3 text-sm">
            <div className="font-semibold mb-1">Resumo</div>
            <div>
              {servico.nome} · {prof?.nome}
            </div>
            <div className="first-letter:uppercase">
              {formatarDia(dia!)} às {hora} · {reais(servico.preco_centavos)}
            </div>
          </div>
          <label className="grid gap-1 text-sm">
            Nome e sobrenome
            <input required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-lg px-3 py-2" autoComplete="name" />
          </label>
          <label className="grid gap-1 text-sm">
            Telefone (WhatsApp)
            <input
              required
              inputMode="tel"
              placeholder="(11) 91234-5678"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              className="rounded-lg px-3 py-2"
              autoComplete="tel"
            />
          </label>
          {campos.map((c) => (
            <label key={c.chave} className="grid gap-1 text-sm">
              {c.rotulo}
              {!c.obrigatorio && <span className="suave text-xs -mt-1">opcional</span>}
              {c.tipo === "textarea" ? (
                <textarea
                  required={c.obrigatorio}
                  value={extras[c.chave] ?? ""}
                  onChange={(e) => setExtras({ ...extras, [c.chave]: e.target.value })}
                  className="rounded-lg px-3 py-2"
                  rows={2}
                />
              ) : (
                <input
                  required={c.obrigatorio}
                  type={c.tipo === "data" ? "date" : "text"}
                  inputMode={c.tipo === "cpf" || c.tipo === "cnpj" ? "numeric" : undefined}
                  value={extras[c.chave] ?? ""}
                  onChange={(e) =>
                    setExtras({
                      ...extras,
                      [c.chave]: c.tipo === "cpf" || c.tipo === "cnpj" ? mascaraDoc(e.target.value, c.tipo) : e.target.value,
                    })
                  }
                  className="rounded-lg px-3 py-2"
                />
              )}
            </label>
          ))}
          {pagamento.modo === "obrigatorio" && (
            <p className="text-xs suave">Esta barbearia pede pagamento antecipado via Pix para confirmar o horário.</p>
          )}
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <button disabled={enviando} className="btn rounded-lg py-3 font-semibold">
            {enviando ? "Agendando…" : "Agendar"}
          </button>
        </form>
      )}
      {!hora && erro && <p className="text-sm text-red-400">{erro}</p>}
    </Modal>
  );
}

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide suave">{titulo}</h3>
      {children}
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-ativo={ativo} className="chip cartao rounded-lg px-3 py-2 text-sm">
      {children}
    </button>
  );
}

function Carregando() {
  return <div className="suave text-sm animate-pulse">Carregando…</div>;
}
