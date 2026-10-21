/** Utilitários de data/hora com fuso da empresa (sem dependências). */

export const FUSO_PADRAO = "America/Sao_Paulo";

/** Offset (em minutos) do fuso em relação ao UTC num instante. Ex.: São Paulo = -180. */
export function offsetMin(instante: Date, fuso: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

/** "2026-10-21" + 540 min → instante UTC correspondente a 09:00 no fuso. */
export function instanteLocal(dia: string, minutos: number, fuso: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const palpite = new Date(Date.UTC(a, m - 1, d, 0, minutos));
  const off = offsetMin(palpite, fuso);
  const r = new Date(palpite.getTime() - off * 60000);
  const off2 = offsetMin(r, fuso);
  return off2 === off ? r : new Date(palpite.getTime() - off2 * 60000);
}

/** Data local (YYYY-MM-DD) de um instante no fuso. */
export function diaLocal(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** Minutos desde 00:00 local. */
export function minutosLocal(instante: Date, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: fuso, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return +p.hour * 60 + +p.minute;
}

/** Dia da semana (0=domingo) de uma data YYYY-MM-DD. */
export function diaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function paraMinutos(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(":").map(Number);
  return h * 60 + m;
}

export function formatarDataHora(instante: Date | string, fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instante));
}

export function formatarDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
