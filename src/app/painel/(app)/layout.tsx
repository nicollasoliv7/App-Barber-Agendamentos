import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { sair } from "../acoes";
import Menu from "./Menu";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <aside className="bg-slate-900 text-slate-100 md:w-60 md:min-h-screen md:sticky md:top-0 p-4 flex md:flex-col gap-4">
        <div className="hidden md:block">
          <div className="text-lg font-bold">Agendou</div>
          <div className="text-xs text-slate-400 truncate">{u.empresa_nome}</div>
        </div>
        <Menu />
        <div className="hidden md:grid gap-2 mt-auto text-sm">
          <Link href={`/${u.empresa_slug}`} target="_blank" className="text-teal-300 hover:underline">
            Abrir página pública ↗
          </Link>
          <div className="text-slate-400 truncate">{u.nome}</div>
          <form action={sair}>
            <button className="text-slate-400 hover:text-white">Sair</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 min-w-0">{children}</main>
    </div>
  );
}
