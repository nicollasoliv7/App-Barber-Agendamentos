import { ok, rota } from "@/lib/api";
import { tx } from "@/lib/db";
import { notificarPushEmpresa } from "@/lib/push";
import { usuarioPainel } from "@/lib/sessao";
import { ErroNegocio } from "@/lib/tipos";

/** Envia uma notificação push de teste para todos os aparelhos inscritos da empresa. */
export async function POST() {
  return rota(async () => {
    const u = await usuarioPainel();
    if (!u) throw new ErroNegocio("Não autenticado", 401);

    await tx(async (t) => {
      await notificarPushEmpresa(t, {
        empresaId: u.empresa_id,
        titulo: "Agendou · Teste",
        corpo: "Notificações push funcionando! Você receberá alertas de agendamentos aqui.",
        tipo: "teste",
      });
    });

    return ok({ ok: true, mensagem: "Notificação de teste enviada para os aparelhos inscritos." });
  });
}
