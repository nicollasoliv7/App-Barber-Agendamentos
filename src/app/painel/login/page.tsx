import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import LoginForm from "./LoginForm";

export const metadata = { title: "Entrar no painel" };

export default async function Page() {
  if (await usuarioPainel()) redirect("/painel");
  return (
    <main className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">Agendou</h1>
        <p className="mb-6 text-sm text-slate-500">Painel da empresa</p>
        <LoginForm />
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Ambiente de desenvolvimento — acesso de exemplo: <b>dono@agendou.dev</b> / <b>agendou123</b>
          </p>
        )}
      </div>
    </main>
  );
}
