import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { Aurora, Icone, Logo } from "@/components/ui";
import { sair } from "../acoes";
import Menu from "./Menu";
import { situacaoAssinatura } from "@/lib/planos-sistema";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  const s = await situacaoAssinatura(u.empresa_id);
  const diasRestantes = s.diasRestantes;
  const aviso =
    s.limite !== null && s.clientes >= s.limite
      ? `Plano Gratuito: limite de ${s.limite} clientes atingido. Novos clientes ficam bloqueados até você assinar.`
      : s.limite !== null && s.clientes >= s.limite - 3
        ? `Plano Gratuito: ${s.clientes} de ${s.limite} clientes cadastrados.`
        : diasRestantes !== null && diasRestantes <= 7 && s.origem === "pagamento"
          ? `Seu plano vence em ${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}. Não há renovação automática.`
          : null;
  return (
    <div className="ui relative min-h-screen md:flex">
      <div className="fixed inset-0 -z-10">
        <Aurora suave />
      </div>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 btn btn-key">
        Pular para o conteúdo
      </a>
      <aside className="glass md:w-64 md:h-screen md:sticky md:top-0 md:rounded-none md:border-y-0 md:border-l-0 p-3 md:p-4 flex flex-col gap-3 md:gap-5 z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 px-1">
            <Logo className="text-[15px]" />
            <div className="mt-0.5 truncate text-xs muted">{u.empresa_nome}</div>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <Link href={`/${u.empresa_slug}`} target="_blank" className="btn btn-sutil btn-sm" aria-label="Abrir página pública">
              <Icone nome="link" tamanho={14} /> Página
            </Link>
            <form action={sair}>
              <button className="btn btn-sutil btn-sm" aria-label="Sair">
                <Icone nome="sair" tamanho={14} />
              </button>
            </form>
          </div>
        </div>
        <Menu />
        <div className="hidden md:grid gap-3 mt-auto">
          <Link href={`/${u.empresa_slug}`} target="_blank" className="card card-hover p-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Icone nome="link" tamanho={14} /> Página de agendamento
            </span>
            <span className="mono mt-1 block truncate text-[11px] muted">/{u.empresa_slug}</span>
          </Link>
          <div className="flex items-center justify-between gap-2 px-1 text-sm">
            <span className="truncate muted">{u.nome}</span>
            <form action={sair}>
              <button className="btn btn-sutil btn-sm" title="Sair">
                <Icone nome="sair" tamanho={14} /> Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main id="conteudo" className="relative flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1240px]">
          {aviso && (
            <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ffb347]/30 bg-[#ffb347]/[0.07] px-4 py-3 text-sm text-[#ffcf8a]">
              <span>{aviso}</span>
              <Link href="/painel/assinatura" className="btn btn-sutil btn-sm">
                Ver planos
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
