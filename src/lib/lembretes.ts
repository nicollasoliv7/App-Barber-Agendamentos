import "server-only";
import { tx } from "./db";
import { notificar } from "./notificacoes";
import { formatarDataHora } from "./tempo";

const ANTECEDENCIA_H = Number(process.env.LEMBRETE_HORAS_ANTES ?? 3);

/** R14b: envia um lembrete para agendamentos confirmados que começam nas próximas N horas (uma vez só). */
export async function enviarLembretes(): Promise<number> {
  return tx(async (t) => {
    const ags = await t.query<{ id: string; empresa_id: string; inicio: Date; telefone: string; cliente: string; servico: string; empresa: string; endereco: string | null }>(
      `select a.id, a.empresa_id, a.inicio, c.telefone, c.nome as cliente, s.nome as servico, e.nome as empresa, e.endereco
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join empresa e on e.id = a.empresa_id
       where a.status = 'confirmado' and a.lembrete_enviado_em is null
         and a.inicio > now() and a.inicio <= now() + make_interval(hours => $1)
       for update of a`,
      [ANTECEDENCIA_H],
    );
    for (const a of ags) {
      await notificar(t, {
        empresaId: a.empresa_id,
        agendamentoId: a.id,
        destino: a.telefone,
        mensagem: `Lembrete: ${a.cliente.split(" ")[0]}, seu horário de ${a.servico} na ${a.empresa} é ${formatarDataHora(a.inicio)}.${a.endereco ? ` Endereço: ${a.endereco}.` : ""} Precisa remarcar? Acesse o Histórico na página de agendamento.`,
      });
      await t.query(`update agendamento set lembrete_enviado_em = now() where id = $1`, [a.id]);
    }
    return ags.length;
  });
}
