import { q } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { configAgendamento } from "@/lib/empresa";
import { lerFiltros, whereAgendamentos } from "@/lib/relatorios";
import { formatarDataHora, instanteLocal, somarDias } from "@/lib/tempo";
import { ROTULO_STATUS } from "@/components/ui";

const cel = (v: unknown) => {
  const s = String(v ?? "");
  // evita fórmula maliciosa ao abrir no Excel (CSV injection)
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

/** Exporta os agendamentos filtrados em CSV (separador ;, UTF-8 com BOM para abrir certo no Excel). */
export async function GET(req: Request) {
  const u = await usuarioPainel();
  if (!u) return new Response("Faça login", { status: 401 });
  const cfg = await configAgendamento(u.empresa_id);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = lerFiltros(sp, cfg.fuso_horario, "30d");
  const { where, params } = whereAgendamentos(u.empresa_id, f, instanteLocal(f.de, 0, cfg.fuso_horario), instanteLocal(somarDias(f.ate, 1), 0, cfg.fuso_horario));
  const rows = await q<Record<string, unknown>>(
    `select a.inicio, c.nome as cliente, c.telefone, s.nome as servico, pr.nome as profissional, a.preco_centavos, a.status, a.origem,
            coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago
     from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join profissional pr on pr.id = a.profissional_id
     where ${where} order by a.inicio limit 20000`,
    params,
  );
  const cab = ["Data e hora", "Cliente", "Telefone", "Serviço", "Profissional", "Valor (R$)", "Pago (R$)", "Status", "Origem"];
  const linhas = rows.map((r) =>
    [
      formatarDataHora(r.inicio as Date, cfg.fuso_horario),
      r.cliente,
      r.telefone,
      r.servico,
      r.profissional,
      ((r.preco_centavos as number) / 100).toFixed(2).replace(".", ","),
      ((r.pago as number) / 100).toFixed(2).replace(".", ","),
      ROTULO_STATUS[r.status as string] ?? r.status,
      r.origem === "painel" ? "Manual" : "Página pública",
    ]
      .map(cel)
      .join(";"),
  );
  const csv = "﻿" + [cab.join(";"), ...linhas].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="agendamentos_${f.de}_a_${f.ate}.csv"`,
      "cache-control": "no-store",
    },
  });
}
