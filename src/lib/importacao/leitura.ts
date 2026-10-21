import "server-only";
import { ErroNegocio } from "../tipos";

/** Planilha normalizada: cabeçalhos + linhas de texto. */
export interface Planilha {
  colunas: string[];
  linhas: string[][];
}

export const LIMITE_BYTES = 5 * 1024 * 1024;
export const LIMITE_LINHAS = 10000;

/** Decodifica UTF-8; se aparecerem caracteres inválidos, tenta Windows-1252 (exportações antigas do Excel no Brasil). */
function decodificar(buf: Buffer): string {
  let txt = new TextDecoder("utf-8").decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  return txt.replace(/^﻿/, "");
}

function detectarSeparador(primeiraLinha: string): string {
  const cand = [";", ",", "\t", "|"];
  let melhor = ",";
  let max = -1;
  for (const c of cand) {
    // conta fora de aspas
    let n = 0;
    let aspas = false;
    for (const ch of primeiraLinha) {
      if (ch === '"') aspas = !aspas;
      else if (ch === c && !aspas) n++;
    }
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  return melhor;
}

/** Parser CSV (RFC 4180): aspas, aspas escapadas, quebras de linha dentro de aspas, CRLF. */
export function lerCsv(buf: Buffer): Planilha {
  const txt = decodificar(buf);
  const sep = detectarSeparador(txt.split(/\r?\n/, 1)[0] ?? "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"') {
        if (txt[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return normalizar(linhas);
}

function celulaParaTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // datas do Excel chegam como Date em UTC
    return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  return String(v);
}

export async function lerXlsx(buf: Buffer): Promise<Planilha> {
  const { readSheet } = await import("read-excel-file/node");
  let dados: unknown[][];
  try {
    dados = (await readSheet(buf)) as unknown[][];
  } catch {
    throw new ErroNegocio("Não foi possível ler a planilha. Salve como .xlsx (Excel 2007 ou mais novo) ou exporte em CSV.");
  }
  return normalizar(dados.map((l) => l.map(celulaParaTexto)));
}

function normalizar(bruto: string[][]): Planilha {
  const linhas = bruto.map((l) => l.map((c) => c.replace(/\s+/g, " ").trim())).filter((l) => l.some((c) => c !== ""));
  if (linhas.length < 2) throw new ErroNegocio("O arquivo precisa ter uma linha de cabeçalho e pelo menos uma linha de dados.");
  const largura = Math.max(...linhas.map((l) => l.length));
  const cab = linhas[0];
  const colunas = Array.from({ length: largura }, (_, i) => cab[i] || `Coluna ${i + 1}`);
  const dados = linhas.slice(1).map((l) => Array.from({ length: largura }, (_, i) => l[i] ?? ""));
  if (dados.length > LIMITE_LINHAS) throw new ErroNegocio(`O arquivo tem ${dados.length} linhas. O limite por importação é ${LIMITE_LINHAS}; divida o arquivo.`);
  return { colunas, linhas: dados };
}

export async function lerArquivo(nome: string, buf: Buffer): Promise<{ planilha: Planilha; formato: "csv" | "xlsx" }> {
  if (buf.length === 0) throw new ErroNegocio("Arquivo vazio.");
  if (buf.length > LIMITE_BYTES) throw new ErroNegocio("Arquivo maior que 5 MB.");
  const ext = nome.toLowerCase().split(".").pop();
  const ehZip = buf[0] === 0x50 && buf[1] === 0x4b; // .xlsx é um zip
  if (ext === "xlsx" || (ehZip && ext !== "csv")) return { planilha: await lerXlsx(buf), formato: "xlsx" };
  if (ext === "xls") throw new ErroNegocio("Formato .xls (Excel 97-2003) não é suportado. Abra no Excel e salve como .xlsx ou CSV.");
  if (ext === "csv" || ext === "txt" || !ext) return { planilha: lerCsv(buf), formato: "csv" };
  throw new ErroNegocio("Envie um arquivo .csv ou .xlsx.");
}
