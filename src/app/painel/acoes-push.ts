"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { q } from "@/lib/db";

/** Remove uma inscrição push pelo id. Profissional só pode remover as próprias; dono/admin qualquer da empresa. */
export async function removerInscricaoPush(id: string): Promise<void> {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  if (u.papel === "profissional") {
    await q(`delete from push_inscricao where id = $1 and empresa_id = $2 and usuario_id = $3`, [id, u.empresa_id, u.id]);
  } else {
    await q(`delete from push_inscricao where id = $1 and empresa_id = $2`, [id, u.empresa_id]);
  }
  revalidatePath("/painel/notificacoes");
}
