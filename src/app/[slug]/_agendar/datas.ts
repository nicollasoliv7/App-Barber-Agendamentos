/** Datas do fluxo público de agendamento (dias como AAAA-MM-DD, sem fuso). */

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function partesDia(d: string) {
  const [a, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dd));
  return { semana: SEMANA[dt.getUTCDay()], dia: dd, mes: MESES[m - 1] };
}

export const diaLongo = (d: string) => {
  const p = partesDia(d);
  return `${p.semana}, ${p.dia} de ${p.mes}`;
};

/** Formato de data do link "adicionar ao Google Agenda". */
export const googleData = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
