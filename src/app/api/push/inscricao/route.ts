import { corpo, ok, rota } from "@/lib/api";
import { q } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { ErroNegocio } from "@/lib/tipos";

/** Salva ou remove uma inscrição push do aparelho atual. */

export async function POST(req: Request) {
  return rota(async () => {
    const u = await usuarioPainel();
    if (!u) throw new ErroNegocio("Não autenticado", 401);

    const b = await corpo<{ endpoint: string; p256dh: string; auth: string; aparelho?: string }>(req);
    if (!b.endpoint || !b.p256dh || !b.auth) throw new ErroNegocio("Campos obrigatórios: endpoint, p256dh, auth");

    await q(
      `insert into push_inscricao (empresa_id, usuario_id, endpoint, p256dh, auth, aparelho)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (endpoint) do update
         set usuario_id = excluded.usuario_id, empresa_id = excluded.empresa_id,
             aparelho = excluded.aparelho, criado_em = push_inscricao.criado_em`,
      [u.empresa_id, u.id, b.endpoint, b.p256dh, b.auth, b.aparelho?.slice(0, 100) ?? null],
    );
    return ok({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return rota(async () => {
    const u = await usuarioPainel();
    if (!u) throw new ErroNegocio("Não autenticado", 401);

    const b = await corpo<{ endpoint?: string; id?: string }>(req);
    const soProprios = u.papel === "profissional";
    if (b.id) {
      await q(
        soProprios
          ? `delete from push_inscricao where id = $1 and empresa_id = $2 and usuario_id = $3`
          : `delete from push_inscricao where id = $1 and empresa_id = $2`,
        soProprios ? [b.id, u.empresa_id, u.id] : [b.id, u.empresa_id],
      );
    } else if (b.endpoint) {
      await q(
        soProprios
          ? `delete from push_inscricao where endpoint = $1 and empresa_id = $2 and usuario_id = $3`
          : `delete from push_inscricao where endpoint = $1 and empresa_id = $2`,
        soProprios ? [b.endpoint, u.empresa_id, u.id] : [b.endpoint, u.empresa_id],
      );
    } else {
      throw new ErroNegocio("Informe endpoint ou id");
    }
    return ok({ ok: true });
  });
}
