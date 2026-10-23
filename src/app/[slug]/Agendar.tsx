"use client";

import { useEffect, useMemo, useState } from "react";
import { reais } from "@/lib/tempo";
import { Icone } from "@/components/ui";
import { api, mascaraDoc, mascaraTelefone, type PagamentoCfg } from "./cliente-api";
import type { CampoPub, EmpresaPub, ServicoPub } from "./PaginaPublica";
import Pagamento from "./Pagamento";
import { linkWhatsapp } from "@/lib/mensagens";

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

type Prof = { id: string; nome: string };
type Criado = {
  id: string;
  status: string;
  inicio: string;
  fim: string;
  preco_centavos: number;
  profissional: string | null;
  token: string;
  gerenciar: string;
  /** status real da confirmação automática por WhatsApp (null = não gerada ainda) */
  whatsapp?: string | null;
};
type Etapa = "servico" | "profissional" | "horario" | "dados" | "pagamento" | "pronto";

const QUALQUER: Prof = { id: "qualquer", nome: "Sem preferência" };
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function partesDia(d: string) {
  const [a, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dd));
  return { semana: SEMANA[dt.getUTCDay()], dia: dd, mes: MESES[m - 1] };
}
const diaLongo = (d: string) => {
  const p = partesDia(d);
  return `${p.semana}, ${p.dia} de ${p.mes}`;
};
const googleData = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

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
  const [copiado, setCopiado] = useState(false);
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
  const grupos = useMemo(() => {
    const g: { rotulo: string; itens: string[] }[] = [
      { rotulo: "Manhã", itens: [] },
      { rotulo: "Tarde", itens: [] },
      { rotulo: "Noite", itens: [] },
    ];
    for (const h of horas ?? []) {
      const hh = Number(h.slice(0, 2));
      g[hh < 12 ? 0 : hh < 18 ? 1 : 2].itens.push(h);
    }
    return g.filter((x) => x.itens.length);
  }, [horas]);
  const servicosFiltrados = p.servicos.filter((s) => !busca || s.nome.toLowerCase().includes(busca.toLowerCase()));

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
    const titulo = `${servico.nome} — ${p.empresa.nome}`;
    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${googleData(criado.inicio)}/${googleData(criado.fim)}&details=${encodeURIComponent(`Com ${criado.profissional ?? ""}`)}${p.endereco ? `&location=${encodeURIComponent(p.endereco)}` : ""}`;
    const urlGerenciar = typeof window !== "undefined" ? `${window.location.origin}${criado.gerenciar}` : criado.gerenciar;
    return (
      <section className="surgir" aria-live="polite">
        <div className="card overflow-hidden">
          <div className="flex flex-col items-center gap-2 px-5 pb-5 pt-7 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#3ecf8e]/15 text-[#7ee2b0] ring-1 ring-[#3ecf8e]/30">
              <Icone nome="check" tamanho={28} />
            </span>
            <h2 className="mt-1 text-xl font-semibold">Agendamento confirmado!</h2>
            <p className="text-sm suave">
              {criado.whatsapp === "aceito" ? "A confirmação está a caminho do seu WhatsApp." : "Guarde este comprovante ou adicione à sua agenda."}
            </p>
          </div>
          <dl className="divide-hair border-t border-white/[0.08] text-sm">
            {[
              ["Serviço", servico.nome],
              ["Profissional", criado.profissional ?? prof?.nome ?? ""],
              ["Quando", `${dia ? diaLongo(dia) : ""} às ${hora}`],
              ["Valor", reais(criado.preco_centavos) + (pago ? " · pago" : "")],
              ...(p.endereco ? [["Onde", p.endereco]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3">
                <dt className="suave">{k}</dt>
                <dd className="text-right font-medium first-letter:uppercase">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {p.empresa.whatsapp && criado.whatsapp !== "aceito" && !(criado.whatsapp == null && p.whatsappAtivo) && (
          <a
            className="btn btn-sutil mt-4 w-full"
            target="_blank"
            rel="noreferrer"
            href={linkWhatsapp(
              p.empresa.whatsapp,
              `Olá! Acabei de agendar ${servico.nome} com ${criado.profissional ?? prof?.nome ?? ""} para ${dia ? diaLongo(dia) : ""} às ${hora}. Nome: ${nome.trim()}.`,
            )}
          >
            <Icone nome="whatsapp" tamanho={15} /> Avisar a barbearia pelo WhatsApp
          </a>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a className="btn btn-sutil" href={`${base}/agendamentos/${criado.id}/ics?t=${criado.token}`}>
            <Icone nome="calendario" tamanho={15} /> Agenda do celular
          </a>
          <a className="btn btn-sutil" href={google} target="_blank" rel="noreferrer">
            <Icone nome="calendario" tamanho={15} /> Google Agenda
          </a>
        </div>

        <div className="card mt-4 p-4 text-sm">
          <p className="font-medium">Precisa remarcar ou cancelar?</p>
          <p className="mt-1 suave">
            Use este link, sem senha
            {p.cancelamentoH > 0 ? ` (até ${p.cancelamentoH}h antes do horário)` : ""}. Guarde-o.
          </p>
          <div className="mt-3 flex gap-2">
            <a href={criado.gerenciar} className="btn btn-sutil flex-1">
              Gerenciar agendamento
            </a>
            <button
              className="btn btn-key"
              onClick={() =>
                navigator.clipboard?.writeText(urlGerenciar).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1600);
                })
              }
            >
              <Icone nome={copiado ? "check" : "copiar"} tamanho={14} /> {copiado ? "Copiado" : "Copiar link"}
            </button>
          </div>
        </div>

        {!pago && p.pagamento.modo === "opcional" && (
          <div className="card mt-4 p-4">
            <p className="text-sm font-medium">Quer adiantar o pagamento?</p>
            <p className="mb-3 text-xs suave">Opcional. Você também pode pagar na barbearia.</p>
            <Pagamento agendamentoId={criado.id} token={criado.token} preco={criado.preco_centavos} cfg={p.pagamento} obrigatorio={false} onPago={() => setPago(true)} onCancelado={() => {}} />
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {p.empresa.whatsapp && (
            <a
              className="btn btn-ghost"
              href={`https://wa.me/55${p.empresa.whatsapp}?text=${encodeURIComponent(`Olá! Acabei de agendar ${servico.nome} para ${dia ? diaLongo(dia) : ""} às ${hora}.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icone nome="whatsapp" tamanho={15} /> Falar com a barbearia
            </a>
          )}
          <button className="text-sm suave underline-offset-2 hover:underline" onClick={novoAgendamento}>
            Fazer outro agendamento
          </button>
        </div>
      </section>
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

      {etapa === "servico" && (
        <section aria-labelledby="t-serv" className="surgir">
          <h2 id="t-serv" className="mb-3 text-lg font-semibold">
            Qual serviço você quer?
          </h2>
          {p.servicos.length > 8 && (
            <div className="relative mb-3">
              <Icone nome="busca" tamanho={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 suave" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço" aria-label="Buscar serviço" className="!pl-9" />
            </div>
          )}
          {p.servicos.length === 0 && <p className="card p-6 text-center suave">Nenhum serviço disponível no momento.</p>}
          <ul className="grid gap-2">
            {servicosFiltrados.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => escolherServico(s)}
                  className="card card-hover group flex w-full items-center gap-3 p-4 text-left"
                  aria-label={`${s.nome}, ${reais(s.preco_centavos)}, ${s.duracao_min} minutos`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.nome}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm suave">
                      <span className="inline-flex items-center gap-1">
                        <Icone nome="relogio" tamanho={13} /> {s.duracao_min} min
                      </span>
                      {s.observacao && <span>· {s.observacao}</span>}
                    </span>
                    {s.descricao && <span className="mt-1 block text-xs suave">{s.descricao}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold num">{reais(s.preco_centavos)}</span>
                  </span>
                  <Icone nome="seta" tamanho={16} className="suave transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {etapa === "profissional" && servico && (
        <section aria-labelledby="t-prof" className="surgir">
          <h2 id="t-prof" className="text-lg font-semibold">
            Com quem?
          </h2>
          <p className="mb-3 text-sm suave">{servico.nome}</p>
          {!profs ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="esqueleto h-16" />
              ))}
            </div>
          ) : (
            <ul className="grid gap-2">
              {[...(profs.length > 1 ? [QUALQUER] : []), ...profs].map((pr) => (
                <li key={pr.id}>
                  <button onClick={() => escolherProf(pr)} className="card card-hover flex w-full items-center gap-3 p-3.5 text-left">
                    <span
                      className="grid h-11 w-11 place-items-center rounded-full text-sm font-semibold"
                      style={{ background: pr.id === "qualquer" ? "rgba(255,255,255,.07)" : "color-mix(in srgb, var(--t-primaria) 28%, transparent)" }}
                    >
                      {pr.id === "qualquer" ? (
                        <Icone nome="usuarios" tamanho={18} />
                      ) : (
                        pr.nome
                          .split(" ")
                          .map((x) => x[0])
                          .slice(0, 2)
                          .join("")
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium">{pr.nome}</span>
                      {pr.id === "qualquer" && <span className="block text-xs suave">Mais horários: escolhemos quem estiver livre</span>}
                    </span>
                    <Icone nome="seta" tamanho={16} className="suave" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {etapa === "horario" && servico && prof && (
        <section aria-labelledby="t-hora" className="surgir">
          <h2 id="t-hora" className="text-lg font-semibold">
            Escolha o dia e o horário
          </h2>
          <p className="mb-4 text-sm suave">
            {servico.nome} · {prof.nome} · {servico.duracao_min} min
          </p>
          {!dias ? (
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="esqueleto h-[72px] w-[60px] shrink-0" />
              ))}
            </div>
          ) : dias.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="font-medium">Sem horários livres nos próximos dias</p>
              <p className="mt-1 text-sm suave">{(profs?.length ?? 0) > 1 ? "Tente outro profissional ou “Sem preferência”." : "Tente outro serviço ou volte mais tarde."}</p>
            </div>
          ) : (
            <>
              <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Dias disponíveis">
                {dias.map((d) => {
                  const x = partesDia(d);
                  return (
                    <button
                      key={d}
                      role="option"
                      aria-selected={dia === d}
                      data-ativo={dia === d}
                      onClick={() => escolherDia(d)}
                      className="chip !flex-col !gap-0 !rounded-xl !px-0 !py-2 w-[60px] shrink-0"
                    >
                      <span className="text-[11px] uppercase suave">{x.semana}</span>
                      <span className="text-lg font-semibold leading-tight">{x.dia}</span>
                      <span className="text-[11px] suave">{x.mes}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5">
                {!horas ? (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="esqueleto h-10" />
                    ))}
                  </div>
                ) : horas.length === 0 ? (
                  <p className="card p-5 text-center text-sm suave">Este dia lotou. Escolha outro dia.</p>
                ) : (
                  grupos.map((g) => (
                    <div key={g.rotulo} className="mb-4">
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider suave">{g.rotulo}</h3>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="listbox" aria-label={`Horários da ${g.rotulo.toLowerCase()}`}>
                        {g.itens.map((h) => (
                          <button key={h} role="option" aria-selected={hora === h} data-ativo={hora === h} onClick={() => setHora(h)} className="chip mono !px-0 !text-[14px]">
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      )}

      {etapa === "dados" && servico && prof && dia && hora && (
        <form id="form-dados" onSubmit={agendar} className="grid gap-4 surgir" aria-labelledby="t-dados">
          <h2 id="t-dados" className="text-lg font-semibold">
            Seus dados
          </h2>
          <div className="card divide-hair text-sm">
            {[
              ["Serviço", `${servico.nome} · ${reais(servico.preco_centavos)}`],
              ["Profissional", prof.nome],
              ["Quando", `${diaLongo(dia)} às ${hora}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <span className="suave">{k}</span>
                <span className="text-right font-medium first-letter:uppercase">{v}</span>
              </div>
            ))}
          </div>
          <label className="grid gap-1.5">
            <span className="rotulo">Nome e sobrenome</span>
            <input required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </label>
          <label className="grid gap-1.5">
            <span className="rotulo">WhatsApp</span>
            <input
              required
              inputMode="tel"
              placeholder="(11) 91234-5678"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
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
                <textarea required={c.obrigatorio} value={extras[c.chave] ?? ""} onChange={(e) => setExtras({ ...extras, [c.chave]: e.target.value })} rows={2} />
              ) : (
                <input
                  required={c.obrigatorio}
                  type={c.tipo === "data" ? "date" : "text"}
                  inputMode={c.tipo === "cpf" || c.tipo === "cnpj" ? "numeric" : undefined}
                  value={extras[c.chave] ?? ""}
                  onChange={(e) =>
                    setExtras({ ...extras, [c.chave]: c.tipo === "cpf" || c.tipo === "cnpj" ? mascaraDoc(e.target.value, c.tipo) : e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm suave">
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Lembrar meus dados neste aparelho
          </label>
          {p.pagamento.modo === "obrigatorio" && (
            <p className="rounded-lg border border-[#ffb347]/30 bg-[#ffb347]/[0.07] px-3 py-2 text-xs text-[#ffcf8a]">
              Esta barbearia pede o pagamento via Pix para confirmar o horário (ambiente de teste: nenhum valor real é cobrado).
            </p>
          )}
        </form>
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
