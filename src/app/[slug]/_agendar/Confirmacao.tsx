"use client";

import { useState } from "react";
import { reais } from "@/lib/tempo";
import { Icone } from "@/components/ui";
import { linkWhatsapp } from "@/lib/mensagens";
import type { PagamentoCfg } from "../cliente-api";
import type { EmpresaPub, ServicoPub } from "../PaginaPublica";
import Pagamento from "../Pagamento";
import { diaLongo, googleData } from "./datas";
import type { Criado, Prof } from "./tipos";

/** Tela final do agendamento: comprovante, agenda do celular, link de gerenciar e pagamento opcional. */
export default function Confirmacao(p: {
  base: string;
  empresa: EmpresaPub;
  endereco: string | null;
  servico: ServicoPub;
  prof: Prof | null;
  dia: string | null;
  hora: string | null;
  nome: string;
  criado: Criado;
  pago: boolean;
  pagamento: PagamentoCfg;
  whatsappAtivo: boolean;
  cancelamentoH: number;
  onPago: () => void;
  onNovo: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const { criado, servico, dia, hora } = p;
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
            ["Profissional", criado.profissional ?? p.prof?.nome ?? ""],
            ["Quando", `${dia ? diaLongo(dia) : ""} às ${hora}`],
            [
              "Valor",
              criado.valor_a_pagar === 0
                ? "Incluído no seu plano"
                : reais(criado.valor_a_pagar ?? criado.preco_centavos) + (criado.valor_a_pagar !== undefined && criado.valor_a_pagar < criado.preco_centavos ? " (com seu plano)" : "") + (p.pago ? " · pago" : ""),
            ],
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
            `Olá! Acabei de agendar ${servico.nome} com ${criado.profissional ?? p.prof?.nome ?? ""} para ${dia ? diaLongo(dia) : ""} às ${hora}. Nome: ${p.nome.trim()}.`,
          )}
        >
          <Icone nome="whatsapp" tamanho={15} /> Avisar a barbearia pelo WhatsApp
        </a>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a className="btn btn-sutil" href={`${p.base}/agendamentos/${criado.id}/ics?t=${criado.token}`}>
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

      {!p.pago && p.pagamento.modo === "opcional" && criado.valor_a_pagar !== 0 && (
        <div className="card mt-4 p-4">
          <p className="text-sm font-medium">Quer adiantar o pagamento?</p>
          <p className="mb-3 text-xs suave">Opcional. Você também pode pagar na barbearia.</p>
          <Pagamento agendamentoId={criado.id} token={criado.token} preco={criado.valor_a_pagar ?? criado.preco_centavos} cfg={p.pagamento} obrigatorio={false} onPago={p.onPago} onCancelado={() => {}} />
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
        <button className="text-sm suave underline-offset-2 hover:underline" onClick={p.onNovo}>
          Fazer outro agendamento
        </button>
      </div>
    </section>
  );
}
