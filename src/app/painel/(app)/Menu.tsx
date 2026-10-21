"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const itens = [
  ["/painel", "Agenda"],
  ["/painel/clientes", "Clientes"],
  ["/painel/servicos", "Serviços"],
  ["/painel/profissionais", "Profissionais"],
  ["/painel/horarios", "Horários"],
  ["/painel/bloqueios", "Folgas e bloqueios"],
  ["/painel/financeiro", "Financeiro"],
  ["/painel/notificacoes", "Notificações"],
  ["/painel/configuracoes", "Configurações"],
] as const;

export default function Menu() {
  const atual = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto text-sm">
      {itens.map(([href, rotulo]) => {
        const ativo = href === "/painel" ? atual === href : atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 ${ativo ? "bg-teal-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
