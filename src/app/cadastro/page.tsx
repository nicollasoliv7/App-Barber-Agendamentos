import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { ehPlanoPago, LIMITE_GRATUITO, PLANOS_SISTEMA } from "@/lib/planos-sistema";
import { Aurora, Logo } from "@/components/ui";
import CadastroForm from "./CadastroForm";

export const metadata = { title: "Criar conta" };

export default async function Page({ searchParams }: PageProps<"/cadastro">) {
  const sp = await searchParams;
  const plano = typeof sp.plano === "string" && ehPlanoPago(sp.plano) ? sp.plano : "";
  if (await usuarioPainel()) redirect(plano ? `/painel/assinatura?plano=${plano}` : "/painel");
  return (
    <main className="ui relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <Aurora />
      <div className="glass relative w-full max-w-sm rounded-2xl p-7 surgir">
        <Link href="/" className="inline-block">
          <Logo className="text-lg" />
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Crie a conta da sua barbearia</h1>
        <p className="mb-6 text-sm muted">
          {plano
            ? `Você escolheu o plano ${PLANOS_SISTEMA[plano].nome}. Crie a conta e, em seguida, faça o pagamento.`
            : `Comece no plano Gratuito: todos os recursos, até ${LIMITE_GRATUITO} clientes cadastrados.`}
        </p>
        <CadastroForm plano={plano} />
        <p className="mt-5 text-center text-sm muted">
          Já tem conta?{" "}
          <Link href="/painel/login" className="text-white underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
