import { rota } from "@/lib/api";
import { buscarPorToken } from "@/lib/gerenciar";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** Arquivo de calendário (.ics) do agendamento: funciona em Google Agenda, Apple e Outlook. */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos/[id]/ics">) {
  return rota(async () => {
    const { slug, id } = await ctx.params;
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    const a = await buscarPorToken(slug, id, new URL(req.url).searchParams.get("t") ?? "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Agendou//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${a.id}@agendou`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(new Date(a.inicio))}`,
      `DTEND:${fmt(new Date(a.fim))}`,
      `SUMMARY:${esc(`${a.servico} — ${a.empresa.nome}`)}`,
      `DESCRIPTION:${esc(`Com ${a.profissional}`)}`,
      a.empresa.endereco ? `LOCATION:${esc(a.empresa.endereco)}` : "",
      a.status === "cancelado" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Lembrete do seu horário",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");
    return new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="agendamento.ics"` },
    });
  });
}
