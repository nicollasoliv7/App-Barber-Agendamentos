"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/ui";

const itens = [
  ["/painel", "Visão geral", "grafico"],
  ["/painel/agenda", "Agenda do dia", "calendario"],
  ["/painel/agendamentos", "Agendamentos", "lista"],
  ["/painel/clientes", "Clientes", "usuarios"],
  ["/painel/financeiro", "Financeiro", "dinheiro"],
  ["/painel/planos", "Planos", "recorrente"],
  ["/painel/servicos", "Serviços", "tesoura"],
  ["/painel/profissionais", "Profissionais", "pessoa"],
  ["/painel/horarios", "Horários", "relogio"],
  ["/painel/bloqueios", "Folgas e bloqueios", "bloqueio"],
  ["/painel/whatsapp", "WhatsApp", "whatsapp"],
  ["/painel/notificacoes", "Notificações", "sino"],
  ["/painel/configuracoes", "Configurações", "engrenagem"],
  ["/painel/assinatura", "Assinatura", "escudo"],
] as const;

export default function Menu() {
  const atual = usePathname();
  return (
    <nav aria-label="Menu do painel" className="sem-barra -mx-1 flex md:flex-col gap-0.5 overflow-x-auto px-1 text-sm">
      {itens.map(([href, rotulo, icone]) => {
        const ativo = href === "/painel" ? atual === href : atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${
              ativo ? "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-[#9c9c9d] hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icone nome={icone} tamanho={16} className={ativo ? "text-[var(--coral)]" : ""} />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
