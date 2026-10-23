import "server-only";
import { tx } from "./db";
import { notificar } from "./notificacoes";
import { formatarDataHora } from "./tempo";
import { linkGerenciar } from "./agendamentos";
import { parametrosModelo, textoLembrete, type DadosMensagem } from "./mensagens";

const ANTECEDENCIA_H = Number(process.env.LEMBRETE_HORAS_ANTES ?? 3);

/**
 * R14b: lembrete para agendamentos confirmados que começam nas próximas N horas (uma vez só).
 * R53: só para barbearias com WhatsApp conectado, modelo de lembrete aprovado e lembretes ligados.
 */
export async function enviarLembretes(): Promise<number> {
  return tx(async (t) => {
    const ags = await t.query<{
      id: string;
      empresa_id: string;
      inicio: Date;
      token_publico: string;
      telefone: string;
      cliente: string;
      servico: string;
      profissional: string;
      empresa: string;
      slug: string;
    }>(
      `select a.id, a.empresa_id, a.inicio, a.token_publico, c.telefone, c.nome as cliente, s.nome as servico, p.nome as profissional,
              e.nome as empresa, e.slug
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       join profissional p on p.id = a.profissional_id join empresa e on e.id = a.empresa_id
       join whatsapp_conexao w on w.empresa_id = a.empresa_id
       where a.status = 'confirmado' and a.lembrete_enviado_em is null
         and w.status = 'conectado' and w.lembretes_ativos and w.modelo_lembrete is not null
         and a.inicio > now() and a.inicio <= now() + make_interval(hours => $1)
       for update of a`,
      [ANTECEDENCIA_H],
    );
    for (const a of ags) {
      const dados: DadosMensagem = {
        cliente: a.cliente,
        empresa: a.empresa,
        servico: a.servico,
        profissional: a.profissional,
        quando: formatarDataHora(a.inicio),
        link: linkGerenciar(a.slug, a),
      };
      await notificar(t, {
        empresaId: a.empresa_id,
        agendamentoId: a.id,
        destino: a.telefone,
        tipo: "lembrete",
        mensagem: textoLembrete(dados),
        parametros: parametrosModelo(dados),
      });
      await t.query(`update agendamento set lembrete_enviado_em = now() where id = $1`, [a.id]);
    }
    return ags.length;
  });
}
