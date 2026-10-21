import Link from "next/link";
import { q } from "@/lib/db";
import { Aurora, Icone, Logo } from "@/components/ui";

export default async function Home() {
  const empresas = await q<{ nome: string; slug: string }>(`select nome, slug from empresa order by criado_em limit 1`);
  const demo = empresas[0]?.slug ? `/${empresas[0].slug}` : "/painel";

  return (
    <div className="ui relative min-h-screen overflow-hidden">
      <section className="relative isolate flex min-h-[100svh] flex-col items-center px-4 pb-16">
        <Aurora />

        {/* Menu em pílula flutuante */}
        <nav aria-label="Principal" className="glass relative z-10 mt-5 flex w-full max-w-3xl items-center justify-between gap-3 rounded-full py-2 pl-5 pr-2">
          <Link href="/" aria-label="Agendou, início">
            <Logo className="text-[15px]" />
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-[#9c9c9d] md:flex">
            <a href="#agendamento" className="hover:text-white">
              Agendamento
            </a>
            <a href="#crm" className="hover:text-white">
              CRM
            </a>
            <a href="#migracao" className="hover:text-white">
              Migração
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/painel/login" className="hidden px-3 text-sm font-medium text-[#9c9c9d] hover:text-white sm:block">
              Entrar
            </Link>
            <Link href={demo} className="btn btn-key btn-sm !rounded-full !px-4">
              Ver demonstração
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mt-16 flex max-w-3xl flex-col items-center text-center md:mt-24">
          <span className="eyebrow surgir">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--coral)]" /> Agenda online + CRM para barbearias
          </span>
          <h1 className="surgir mt-6 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:text-[52px] md:!text-[64px]" style={{ animationDelay: "60ms" }}>
            Sua barbearia com a agenda <span className="texto-quente">cheia</span>, sem trabalho manual.
          </h1>
          <p className="surgir mt-5 max-w-[640px] text-[17px] leading-relaxed tracking-[0.2px] text-white/70 md:text-lg" style={{ animationDelay: "120ms" }}>
            Um link para o Instagram e o WhatsApp: o cliente escolhe serviço, barbeiro e horário em segundos, sem cadastro. Você acompanha tudo num painel simples.
          </p>
          <div className="surgir mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row" style={{ animationDelay: "180ms" }}>
            <Link href={demo} className="btn btn-key !px-5 !py-3">
              <Icone nome="calendario" tamanho={16} /> Agendar como cliente
            </Link>
            <Link href="/painel/login" className="btn btn-key !px-5 !py-3">
              <Icone nome="grafico" tamanho={16} /> Abrir o painel
            </Link>
          </div>
          <p className="mono mt-4 text-xs text-[#9c9c9d]">agendou{demo} · demonstração com dados fictícios</p>
        </div>

        {/* Mockup do produto: agenda do dia como "launcher" */}
        <div className="glass relative z-10 mt-14 w-full max-w-2xl overflow-hidden rounded-[14px] shadow-[0_30px_80px_-30px_rgba(255,90,60,0.45)] surgir" style={{ animationDelay: "260ms" }} aria-hidden="true">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <Icone nome="busca" tamanho={16} className="text-[#9c9c9d]" />
            <span className="flex-1 text-sm text-white">
              hoje, sexta
              <span className="caret" />
            </span>
            <span className="kbd">Agenda</span>
          </div>
          <ul className="p-2 text-sm">
            {[
              ["09:00", "Lucas M.", "Corte + Barba", "Confirmado", true],
              ["09:50", "Pedro A.", "Corte", "Confirmado", false],
              ["10:30", "Diego R.", "Pigmentação", "Confirmado", false],
              ["11:00", "Nova reserva", "Sobrancelha", "agora mesmo", false],
            ].map(([h, n, s, st, ativo]) => (
              <li
                key={String(h)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${ativo ? "bg-[linear-gradient(90deg,rgba(255,47,58,0.22),rgba(255,107,74,0.12),transparent)] shadow-[inset_0_0_0_1px_rgba(255,107,74,0.35)]" : ""}`}
              >
                <span className="mono w-12 text-[13px] text-[var(--amber)]">{h}</span>
                <span className="flex-1 text-white">
                  {n} <span className="text-[#9c9c9d]">· {s}</span>
                </span>
                <span className="kbd">{st}</span>
              </li>
            ))}
          </ul>
          <div className="mono flex items-center justify-between border-t border-white/[0.08] px-4 py-2 text-[11px] text-[#9c9c9d]">
            <span>↑↓ navegar · enter abrir · esc fechar</span>
            <Logo className="text-[11px]" />
          </div>
        </div>

        <a href="#agendamento" className="btn btn-ghost relative z-10 mt-10">
          Como funciona ↓
        </a>
      </section>

      <section className="relative mx-auto grid max-w-5xl gap-4 px-4 pb-24 md:grid-cols-3">
        {[
          {
            id: "agendamento",
            icone: "calendario" as const,
            titulo: "Agendamento sem login",
            texto: "Página pública mobile-first com serviço, barbeiro (ou “sem preferência”), dia e horário. O cliente remarca ou cancela pelo próprio link.",
          },
          {
            id: "crm",
            icone: "grafico" as const,
            titulo: "CRM e números claros",
            texto: "Faturamento, ticket médio, serviços mais pedidos, clientes sumidos e histórico de cada cliente, com filtros por período, serviço e status.",
          },
          {
            id: "migracao",
            icone: "upload" as const,
            titulo: "Migração em minutos",
            texto: "Importe sua base de outro sistema em CSV ou Excel, com mapeamento de colunas, prévia, duplicados e relatório de erros antes de confirmar.",
          },
        ].map((c) => (
          <article key={c.id} id={c.id} className="card scroll-mt-8 p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-[var(--coral)]">
              <Icone nome={c.icone} tamanho={20} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{c.titulo}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{c.texto}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-white/[0.06] px-4 py-8 text-center text-xs text-[#9c9c9d]">
        <Logo className="text-sm text-white" />
        <p className="mt-2">Agenda online, CRM e migração de clientes para barbearias.</p>
      </footer>
    </div>
  );
}
