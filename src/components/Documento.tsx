import Link from "next/link";
import { Aurora, Logo } from "@/components/ui";

/** Moldura das páginas institucionais (Termos de uso, Política de privacidade). */
export const CONTATO = "contato@agendou.com.br";
export const ATUALIZADO_EM = "24 de outubro de 2026";

export function Documento({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="ui relative min-h-screen overflow-hidden px-4 py-10">
      <Aurora suave />
      <article className="glass relative mx-auto w-full max-w-3xl rounded-2xl p-6 md:p-10 documento">
        <Link href="/" className="inline-block">
          <Logo className="text-lg" />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">{titulo}</h1>
        <p className="mt-2 text-sm muted">Última atualização: {ATUALIZADO_EM}</p>
        <div className="mt-8 grid gap-7 text-[15px] leading-relaxed text-[#d7d7d8]">{children}</div>
        <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-sm muted">
          <Link href="/termos" className="underline-offset-4 hover:text-white hover:underline">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="underline-offset-4 hover:text-white hover:underline">
            Política de privacidade
          </Link>
          <Link href="/cadastro" className="underline-offset-4 hover:text-white hover:underline">
            Criar conta
          </Link>
          <a href={`mailto:${CONTATO}`} className="underline-offset-4 hover:text-white hover:underline">
            {CONTATO}
          </a>
        </nav>
      </article>
    </main>
  );
}

export function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s${n}`} className="grid gap-3">
      <h2 id={`s${n}`} className="text-lg font-semibold text-white">
        {n}. {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="grid gap-2 pl-5 [list-style:disc] marker:text-[#ff6b4a]">
      {itens.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
