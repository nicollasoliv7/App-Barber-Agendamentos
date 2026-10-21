import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { Aurora, Logo } from "@/components/ui";
import LoginForm from "./LoginForm";

export const metadata = { title: "Entrar no painel" };

export default async function Page() {
  if (await usuarioPainel()) redirect("/painel");
  return (
    <main className="ui relative grid min-h-screen place-items-center overflow-hidden px-4">
      <Aurora />
      <div className="glass relative w-full max-w-sm rounded-2xl p-7 surgir">
        <Link href="/" className="inline-block">
          <Logo className="text-lg" />
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Entrar no painel</h1>
        <p className="mb-6 text-sm muted">Agenda, clientes e faturamento da sua barbearia.</p>
        <LoginForm />
        {(process.env.NODE_ENV !== "production" || process.env.MODO_DEMO === "1") && (
          <p className="mt-5 rounded-lg border border-[#ffb347]/30 bg-[#ffb347]/[0.07] p-3 text-xs text-[#ffcf8a]">
            Demonstração com dados fictícios — acesso de exemplo: <b className="mono">(11) 90000-0001</b> / <b className="mono">agendou123</b>
          </p>
        )}
      </div>
    </main>
  );
}
