"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/ui";
import { api, type PagamentoCfg } from "./cliente-api";
import type { CampoPub, EmpresaPub, ServicoPub } from "./PaginaPublica";
import Pagamento from "./Pagamento";
import Confirmacao from "./_agendar/Confirmacao";
import EscolhaHorario from "./_agendar/EscolhaHorario";
import EscolhaProfissional from "./_agendar/EscolhaProfissional";
import EscolhaServico from "./_agendar/EscolhaServico";
import FormDados from "./_agendar/FormDados";
import { diaLongo } from "./_agendar/datas";
import type { Criado, Etapa, Prof } from "./_agendar/tipos";

interface Props {
  slug: string;
  empresa: EmpresaPub;
  endereco: string | null;
  unidade?: string;
  servicos: ServicoPub[];
  campos: CampoPub[];
  pagamento: PagamentoCfg;
  totalProfissionais: number;
  whatsappAtivo: boolean;
  cancelamentoH: number;
}

/** Fluxo público de agendamento em etapas. Guarda o estado; cada etapa é um componente em ./_agendar. */
export default function Agendar(p: Props) {
  const [etapa, setEtapa] = useState<Etapa>("servico");
  const [servico, setServico] = useState<ServicoPub | null>(null);
  const [profs, setProfs] = useState<Prof[] | null>(null);
  const [prof, setProf] = useState<Prof | null>(null);
  const [dias, setDias] = useState<string[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [pago, setPago] = useState(false);
  const [busca, setBusca] = useState("");
  const base = `/api/public/${p.slug}`;
  const uni = p.unidade ? `&unidade=${p.unidade}` : "";

  // dados salvos neste aparelho (conveniência; nada vai para o servidor antes de agendar)
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem("agendou_cliente") ?? "null");
      if (salvo?.nome) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNome(salvo.nome);
        setTelefone(salvo.telefone ?? "");
      }
    } catch {}
  }, []);

  // ao trocar de unidade, recomeça a escolha
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEtapa((e) => (e === "pronto" || e === "pagamento" ? e : "servico"));
  }, [p.unidade]);

  useEffect(() => {
    if (etapa === "pronto" || etapa === "pagamento") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [etapa]);

  function escolherServico(s: ServicoPub) {
    setServico(s);
    setProf(null);
    setProfs(null);
    setDias(null);
    setDia(null);
    setHoras(null);
    setHora(null);
    setErro("");
    api<{ profissionais: Prof[] }>(`${base}/profissionais?servico=${s.id}${uni}`)
      .then((r) => {
        setProfs(r.profissionais);
        if (r.profissionais.length === 1) escolherProf(r.profissionais[0], s);
        else setEtapa("profissional");
      })
      .catch((e) => setErro(e.message));
  }

  function escolherProf(pr: Prof, s: ServicoPub | null = servico) {
    if (!s) return;
    setProf(pr);
    setDias(null);
    setDia(null);
    setHoras(null);
    setHora(null);
    setEtapa("horario");
    api<{ dias: string[] }>(`${base}/dias?servico=${s.id}&profissional=${pr.id}${uni}`)
      .then((r) => {
        setDias(r.dias);
        if (r.dias[0]) escolherDia(r.dias[0], s, pr);
      })
      .catch((e) => setErro(e.message));
  }

  function escolherDia(d: string, s: ServicoPub | null = servico, pr: Prof | null = prof) {
    if (!s || !pr) return;
    setDia(d);
    setHoras(null);
    setHora(null);
    api<{ horarios: string[] }>(`${base}/horarios?servico=${s.id}&profissional=${pr.id}&dia=${d}${uni}`)
      .then((r) => setHoras(r.horarios))
      .catch((e) => setErro(e.message));
  }

  async function agendar(e: React.FormEvent) {
    e.preventDefault();
    if (!servico || !prof || !dia || !hora) return;
    setErro("");
    setEnviando(true);
    try {
      const r = await api<{ agendamento: Criado }>(`${base}/agendamentos`, {
        json: { servico: servico.id, profissional: prof.id, unidade: p.unidade, dia, hora, nome, telefone, extras },
      });
      try {
        if (lembrar) localStorage.setItem("agendou_cliente", JSON.stringify({ nome, telefone }));
        else localStorage.removeItem("agendou_cliente");
      } catch {}
      setCriado(r.agendamento);
      setEtapa(r.agendamento.status === "pendente_pagamento" ? "pagamento" : "pronto");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const e2 = err as Error & { status?: number };
      setErro(e2.message);
      if (e2.status === 409) {
        setEtapa("horario");
        escolherDia(dia);
      }
    } finally {
      setEnviando(false);
    }
  }

  function novoAgendamento() {
    setCriado(null);
    setPago(false);
    setServico(null);
    setProf(null);
    setDia(null);
    setHora(null);
    setEtapa("servico");
  }

  const passos: { id: Etapa; rotulo: string }[] = [
    { id: "servico", rotulo: "Serviço" },
    ...(p.totalProfissionais > 1 ? [{ id: "profissional" as Etapa, rotulo: "Profissional" }] : []),
    { id: "horario", rotulo: "Horário" },
    { id: "dados", rotulo: "Seus dados" },
  ];
  const idxAtual = passos.findIndex((x) => x.id === etapa);
  // ---------- Telas finais ----------
  if (etapa === "pagamento" && criado && servico) {
    return (
      <section className="card p-5 surgir" aria-labelledby="titulo-pag">
        <h2 id="titulo-pag" className="text-lg font-semibold">
          Falta pouco: confirme com o Pix
        </h2>
        <p className="mb-4 text-sm suave">Seu horário fica reservado enquanto o contador corre.</p>
        <Pagamento
          agendamentoId={criado.id}
          token={criado.token}
          preco={criado.preco_centavos}
          cfg={p.pagamento}
          obrigatorio
          onPago={() => {
            setPago(true);
            setEtapa("pronto");
          }}
          onCancelado={() => {
            setCriado(null);
            setErro("Pagamento não concluído. O horário foi liberado; escolha outro se quiser.");
            setEtapa("horario");
            if (dia) escolherDia(dia);
          }}
        />
      </section>
    );
  }

  if (etapa === "pronto" && criado && servico) {
    return (
      <Confirmacao
        base={base}
        empresa={p.empresa}
        endereco={p.endereco}
        servico={servico}
        prof={prof}
        dia={dia}
        hora={hora}
        nome={nome}
        criado={criado}
        pago={pago}
        pagamento={p.pagamento}
        whatsappAtivo={p.whatsappAtivo}
        cancelamentoH={p.cancelamentoH}
        onPago={() => setPago(true)}
        onNovo={novoAgendamento}
      />
    );
  }

  // ---------- Fluxo ----------
  return (
    <div>
      <ol className="mb-5 flex items-center gap-2" aria-label="Etapas">
        {passos.map((x, i) => {
          const feito = i < idxAtual;
          const ativo = i === idxAtual;
          return (
            <li key={x.id} className="flex flex-1 flex-col gap-1.5" aria-current={ativo ? "step" : undefined}>
              <span className="h-1 rounded-full transition-colors" style={{ background: feito || ativo ? "var(--t-primaria)" : "rgba(255,255,255,.12)", opacity: ativo ? 1 : feito ? 0.6 : 1 }} />
              <span className={`text-[11px] ${ativo ? "text-white" : "suave"}`}>{x.rotulo}</span>
            </li>
          );
        })}
      </ol>

      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[#ff4d5a]/40 bg-[#ff4d5a]/10 px-3 py-2.5 text-sm text-[#ffc2c7]">
          <Icone nome="alerta" tamanho={16} className="mt-0.5" />
          {erro}
        </div>
      )}

      {etapa !== "servico" && servico && (
        <button
          className="mb-4 flex items-center gap-1 text-sm suave hover:text-white"
          onClick={() => {
            setErro("");
            if (etapa === "dados") setEtapa("horario");
            else if (etapa === "horario" && (profs?.length ?? 0) > 1) setEtapa("profissional");
            else setEtapa("servico");
          }}
        >
          ← Voltar
        </button>
      )}

      {etapa === "servico" && <EscolhaServico servicos={p.servicos} busca={busca} onBusca={setBusca} onEscolher={escolherServico} />}

      {etapa === "profissional" && servico && <EscolhaProfissional servico={servico} profs={profs} onEscolher={(pr) => escolherProf(pr)} />}

      {etapa === "horario" && servico && prof && (
        <EscolhaHorario
          servico={servico}
          prof={prof}
          variosProfissionais={(profs?.length ?? 0) > 1}
          dias={dias}
          dia={dia}
          horas={horas}
          hora={hora}
          onDia={(d) => escolherDia(d)}
          onHora={setHora}
        />
      )}

      {etapa === "dados" && servico && prof && dia && hora && (
        <FormDados
          servico={servico}
          prof={prof}
          dia={dia}
          hora={hora}
          campos={p.campos}
          nome={nome}
          onNome={setNome}
          telefone={telefone}
          onTelefone={setTelefone}
          extras={extras}
          onExtras={setExtras}
          lembrar={lembrar}
          onLembrar={setLembrar}
          pagamentoObrigatorio={p.pagamento.modo === "obrigatorio"}
          onSubmit={agendar}
        />
      )}

      {/* Barra fixa de ação (mobile-first) */}
      {(etapa === "horario" || etapa === "dados") && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[color-mix(in_srgb,var(--t-fundo)_88%,transparent)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium">{servico?.nome}</div>
              <div className="truncate text-xs suave first-letter:uppercase">
                {dia && hora ? `${diaLongo(dia)} · ${hora}` : "Escolha um horário"}
              </div>
            </div>
            {etapa === "horario" ? (
              <button className="btn btn-quente !px-5 !py-3" disabled={!hora} onClick={() => setEtapa("dados")}>
                Continuar
              </button>
            ) : (
              <button form="form-dados" className="btn btn-quente !px-5 !py-3" disabled={enviando}>
                {enviando ? "Confirmando…" : "Confirmar agendamento"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
