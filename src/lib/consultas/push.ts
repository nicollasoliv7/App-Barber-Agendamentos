import "server-only";
import { q } from "../db";

export type InscricaoPush = { id: string; aparelho: string | null; criado_em: Date };

export const inscricoesPush = (empresaId: string, usuarioId?: string) =>
  usuarioId
    ? q<InscricaoPush>(
        `select id, aparelho, criado_em from push_inscricao where empresa_id = $1 and usuario_id = $2 order by criado_em desc`,
        [empresaId, usuarioId],
      )
    : q<InscricaoPush>(
        `select id, aparelho, criado_em from push_inscricao where empresa_id = $1 order by criado_em desc`,
        [empresaId],
      );
