import Link from "next/link";
import { q } from "@/lib/db";

export default async function Home() {
  const empresas = await q<{ nome: string; slug: string }>(`select nome, slug from empresa order by nome`);
  return (
    <main className="mx-auto max-w-xl w-full px-4 py-16">
      <h1 className="text-3xl font-bold">Agendou</h1>
      <p className="mt-2 text-slate-600">Agendamento online para barbearias e salões.</p>
      <div className="mt-8 grid gap-3">
        {empresas.map((e) => (
          <Link key={e.slug} href={`/${e.slug}`} className="rounded-xl border bg-white p-4 hover:border-teal-600">
            <div className="font-semibold">{e.nome}</div>
            <div className="text-sm text-slate-500">/{e.slug} — página pública de agendamento</div>
          </Link>
        ))}
        <Link href="/painel" className="rounded-xl bg-slate-900 p-4 text-white text-center font-medium">
          Entrar no painel da empresa
        </Link>
      </div>
    </main>
  );
}
