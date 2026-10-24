import "server-only";
import { q, q1, tx, type Executor } from "../db";
import { ErroNegocio } from "../tipos";
import { conferirVagaClientes } from "../planos-sistema";
import { cpfValido, normalizarTelefone, soDigitos } from "../validacao";
import { lerArquivo, type Planilha } from "./leitura";

/**
 * Importação de clientes de outros sistemas.
 *
 * Fluxo (tudo validado no servidor):
 *   1. enviarArquivo   → lê CSV/XLSX, guarda um RASCUNHO e sugere o mapeamento
 *   2. analisar        → aplica o mapeamento, valida, acha duplicados (no arquivo e no banco) e devolve o relatório
 *   3. confirmar       → refaz a análise contra o banco atual e grava; o rascunho perde os dados brutos
 *
 * Princípios: nunca sobrescreve dados existentes; o telefone identifica o cliente;
 * campos inválidos opcionais são descartados (com aviso), linhas sem nome/telefone válidos são rejeitadas.
 */

import { CAMPOS, type CampoId, type Mapeamento, type Politica } from "./campos";
export { CAMPOS, NAO_IMPORTAVEL } from "./campos";
export type { CampoId, Mapeamento, Politica } from "./campos";

const SINONIMOS: Record<CampoId, string[]> = {
  nome: ["nome", "nome completo", "cliente", "name", "full name", "nome do cliente", "razao social"],
  sobrenome: ["sobrenome", "last name", "surname", "ultimo nome"],
  telefone: ["telefone", "celular", "whatsapp", "whats", "fone", "phone", "tel", "telefone celular", "contato", "mobile", "numero"],
  email: ["email", "e-mail", "e mail", "mail", "correio eletronico"],
  nascimento: ["nascimento", "data de nascimento", "data nascimento", "aniversario", "dt nascimento", "birthday", "birth date", "nasc"],
  cpf: ["cpf", "documento", "cpf/cnpj"],
  observacoes: ["observacoes", "observacao", "obs", "notas", "anotacoes", "notes", "comentarios"],
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function sugerirMapeamento(colunas: string[]): Mapeamento {
  const m: Mapeamento = {};
  const usadas = new Set<number>();
  for (const campo of CAMPOS) {
    const sins = SINONIMOS[campo.id];
    // 1º: igualdade exata; 2º: contém
    let idx = colunas.findIndex((c, i) => !usadas.has(i) && sins.includes(semAcento(c)));
    if (idx < 0) idx = colunas.findIndex((c, i) => !usadas.has(i) && sins.some((s) => s.length > 3 && semAcento(c).includes(s)));
    if (idx >= 0) {
      m[campo.id] = idx;
      usadas.add(idx);
    }
  }
  return m;
}

// ---------- Normalização de campos ----------

function telefoneDe(bruto: string, dddPadrao: string | null): string | null {
  let d = soDigitos(bruto.replace(/\.0+$/, ""));
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length >= 11 && d.startsWith("0")) d = d.replace(/^0+/, "");
  if ((d.length === 8 || d.length === 9) && dddPadrao) d = dddPadrao + d;
  return normalizarTelefone(d);
}

function dataDe(bruto: string): string | null {
  const s = bruto.trim();
  if (!s) return null;
  let a: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    [d, m, a] = [+r[1], +r[2], +r[3]];
    if (a < 100) a += a > new Date().getFullYear() % 100 ? 1900 : 2000;
  } else if (/^\d{4,5}(\.0+)?$/.test(s)) {
    // número de série do Excel (dias desde 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
    [a, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const hoje = new Date();
  if (a < 1900 || dt > hoje) return null;
  return dt.toISOString().slice(0, 10);
}

const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export interface LinhaAnalisada {
  linha: number; // número da linha no arquivo (cabeçalho = 1)
  situacao: "novo" | "existente" | "duplicado_arquivo" | "erro";
  nome: string;
  telefone: string | null;
  email: string | null;
  nascimento: string | null;
  cpf: string | null;
  observacoes: string | null;
  erros: string[];
  avisos: string[];
}

export interface Relatorio {
  total: number;
  novos: number;
  existentes: number;
  duplicadosArquivo: number;
  erros: number;
  avisos: number;
  linhas: LinhaAnalisada[];
}

function analisarLinhas(
  planilha: Planilha,
  map: Mapeamento,
  telefonesExistentes: Set<string>,
  dddPadrao: string | null,
): Relatorio {
  if (map.nome === undefined || map.telefone === undefined)
    throw new ErroNegocio("Escolha quais colunas têm o NOME e o TELEFONE — eles são obrigatórios.");
  const vistos = new Map<string, number>();
  const get = (l: string[], c?: number) => (c === undefined ? "" : (l[c] ?? "").trim());
  const linhas = planilha.linhas.map((l, i): LinhaAnalisada => {
    const erros: string[] = [];
    const avisos: string[] = [];
    const nome = [get(l, map.nome), get(l, map.sobrenome)].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 120);
    if (nome.length < 2) erros.push("Nome vazio");
    const telBruto = get(l, map.telefone);
    const telefone = telBruto ? telefoneDe(telBruto, dddPadrao) : null;
    if (!telBruto) erros.push("Telefone vazio");
    else if (!telefone)
      erros.push(soDigitos(telBruto).length <= 9 ? "Telefone sem DDD (defina um DDD padrão)" : `Telefone inválido: ${telBruto}`);

    let email: string | null = get(l, map.email).toLowerCase() || null;
    if (email && !emailValido(email)) {
      avisos.push(`E-mail inválido ignorado: ${email}`);
      email = null;
    }
    const nascBruto = get(l, map.nascimento);
    const nascimento = nascBruto ? dataDe(nascBruto) : null;
    if (nascBruto && !nascimento) avisos.push(`Data de nascimento não reconhecida: ${nascBruto}`);
    const cpfBruto = get(l, map.cpf);
    let cpf: string | null = null;
    if (cpfBruto) {
      if (cpfValido(cpfBruto)) cpf = soDigitos(cpfBruto).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      else avisos.push("CPF inválido ignorado");
    }
    const observacoes = get(l, map.observacoes).slice(0, 1000) || null;

    let situacao: LinhaAnalisada["situacao"] = "novo";
    if (erros.length) situacao = "erro";
    else if (telefone && vistos.has(telefone)) {
      situacao = "duplicado_arquivo";
      avisos.push(`Mesmo telefone da linha ${vistos.get(telefone)}`);
    } else if (telefone && telefonesExistentes.has(telefone)) situacao = "existente";
    if (telefone && situacao !== "erro" && !vistos.has(telefone)) vistos.set(telefone, i + 2);
    return { linha: i + 2, situacao, nome, telefone, email, nascimento, cpf, observacoes, erros, avisos };
  });
  return {
    total: linhas.length,
    novos: linhas.filter((x) => x.situacao === "novo").length,
    existentes: linhas.filter((x) => x.situacao === "existente").length,
    duplicadosArquivo: linhas.filter((x) => x.situacao === "duplicado_arquivo").length,
    erros: linhas.filter((x) => x.situacao === "erro").length,
    avisos: linhas.filter((x) => x.avisos.length > 0).length,
    linhas,
  };
}

async function telefonesDaEmpresa(ex: Executor | null, empresaId: string): Promise<Set<string>> {
  const sql = `select telefone from cliente where empresa_id = $1`;
  const rows = ex ? await ex.query<{ telefone: string }>(sql, [empresaId]) : await q<{ telefone: string }>(sql, [empresaId]);
  return new Set(rows.map((r) => r.telefone));
}

interface Rascunho {
  id: string;
  empresa_id: string;
  status: string;
  colunas: string[];
  linhas: string[][] | null;
  arquivo_nome: string;
  formato: string;
}

async function carregarRascunho(ex: Executor | null, empresaId: string, id: string): Promise<Rascunho> {
  const sql = `select id, empresa_id, status, colunas, linhas, arquivo_nome, formato from importacao where id = $1 and empresa_id = $2`;
  const r = ex ? (await ex.query<Rascunho>(sql, [id, empresaId]))[0] : await q1<Rascunho>(sql, [id, empresaId]);
  if (!r) throw new ErroNegocio("Importação não encontrada", 404);
  if (r.status !== "rascunho" || !r.linhas) throw new ErroNegocio("Esta importação já foi concluída ou cancelada.");
  return r;
}

function validarMapeamento(planilha: Planilha, bruto: unknown): Mapeamento {
  const m: Mapeamento = {};
  const usados = new Set<number>();
  if (bruto && typeof bruto === "object") {
    for (const c of CAMPOS) {
      const v = (bruto as Record<string, unknown>)[c.id];
      if (v === null || v === undefined || v === "") continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n >= planilha.colunas.length) throw new ErroNegocio("Mapeamento inválido");
      if (usados.has(n)) throw new ErroNegocio(`A coluna "${planilha.colunas[n]}" foi usada em dois campos.`);
      usados.add(n);
      m[c.id] = n;
    }
  }
  return m;
}

const dddValido = (s: unknown) => (typeof s === "string" && /^[1-9]\d$/.test(s) ? s : null);

// ---------- API pública do módulo ----------

export async function enviarArquivo(empresaId: string, usuarioId: string, nome: string, buf: Buffer) {
  const { planilha, formato } = await lerArquivo(nome, buf);
  const [r] = await q<{ id: string }>(
    `insert into importacao (empresa_id, usuario_id, formato, arquivo_nome, total_linhas, colunas, linhas)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning id`,
    [empresaId, usuarioId, formato, nome.slice(0, 200), planilha.linhas.length, JSON.stringify(planilha.colunas), JSON.stringify(planilha.linhas)],
  );
  return {
    id: r.id,
    formato,
    colunas: planilha.colunas,
    amostra: planilha.linhas.slice(0, 5),
    total: planilha.linhas.length,
    sugestao: sugerirMapeamento(planilha.colunas),
  };
}

export async function analisar(empresaId: string, id: string, mapeamentoBruto: unknown, ddd: unknown) {
  const r = await carregarRascunho(null, empresaId, id);
  const planilha = { colunas: r.colunas, linhas: r.linhas! };
  const map = validarMapeamento(planilha, mapeamentoBruto);
  return analisarLinhas(planilha, map, await telefonesDaEmpresa(null, empresaId), dddValido(ddd));
}

export async function confirmar(empresaId: string, id: string, mapeamentoBruto: unknown, ddd: unknown, politica: Politica) {
  if (politica !== "manter" && politica !== "completar") throw new ErroNegocio("Política de duplicados inválida");
  return tx(async (t) => {
    const r = await carregarRascunho(t, empresaId, id);
    await t.query(`select id from importacao where id = $1 for update`, [id]);
    const planilha = { colunas: r.colunas, linhas: r.linhas! };
    const map = validarMapeamento(planilha, mapeamentoBruto);
    const rel = analisarLinhas(planilha, map, await telefonesDaEmpresa(t, empresaId), dddValido(ddd));

    const extras = (l: LinhaAnalisada) => {
      const e: Record<string, string> = {};
      if (l.nascimento) e.nascimento = l.nascimento;
      if (l.cpf) e.cpf = l.cpf;
      return JSON.stringify(e);
    };

    let inseridos = 0;
    const novos = rel.linhas.filter((l) => l.situacao === "novo");
    await conferirVagaClientes(t, empresaId, novos.length, "importacao"); // limite do plano Gratuito (nada é gravado se passar)
    for (let i = 0; i < novos.length; i += 200) {
      const lote = novos.slice(i, i + 200);
      const params: unknown[] = [empresaId, id];
      const valores = lote.map((l) => {
        const b = params.length;
        params.push(l.nome, l.telefone, l.email, extras(l), l.observacoes);
        return `($1, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::jsonb, $${b + 5}, 'importacao', $2)`;
      });
      const ins = await t.query(
        `insert into cliente (empresa_id, nome, telefone, email, dados_extras, observacoes, origem, importacao_id)
         values ${valores.join(",")} on conflict (empresa_id, telefone) do nothing returning id`,
        params,
      );
      inseridos += ins.length;
    }

    let completados = 0;
    if (politica === "completar") {
      for (const l of rel.linhas.filter((x) => x.situacao === "existente")) {
        // só preenche o que está vazio; nome e dados existentes nunca são trocados
        const up = await t.query(
          `update cliente set
             email = coalesce(email, $3),
             observacoes = coalesce(observacoes, $4),
             dados_extras = $5::jsonb || dados_extras
           where empresa_id = $1 and telefone = $2
             and ((email is null and $3::text is not null) or (observacoes is null and $4::text is not null)
                  or not (dados_extras ?& array(select jsonb_object_keys($5::jsonb))))
           returning id`,
          [empresaId, l.telefone, l.email, l.observacoes, extras(l)],
        );
        completados += up.length;
      }
    }

    const resultado = {
      total: rel.total,
      inseridos,
      completados,
      mantidos: rel.existentes - completados,
      duplicadosArquivo: rel.duplicadosArquivo,
      erros: rel.erros,
      // relatório de erros sem os dados pessoais completos
      detalhesErros: rel.linhas.filter((l) => l.situacao === "erro").map((l) => ({ linha: l.linha, motivos: l.erros })),
      detalhesAvisos: rel.linhas
        .filter((l) => l.avisos.length && l.situacao !== "erro")
        .slice(0, 500)
        .map((l) => ({ linha: l.linha, motivos: l.avisos })),
    };
    await t.query(
      `update importacao set status = 'concluida', linhas = null, mapeamento = $2::jsonb, politica_duplicados = $3,
         resultado = $4::jsonb, concluido_em = now() where id = $1`,
      [id, JSON.stringify(map), politica, JSON.stringify(resultado)],
    );
    return resultado;
  });
}

export async function cancelar(empresaId: string, id: string) {
  await q(`update importacao set status = 'cancelada', linhas = null, concluido_em = now() where id = $1 and empresa_id = $2 and status = 'rascunho'`, [
    id,
    empresaId,
  ]);
}

export function modeloCsv(): string {
  return "﻿nome;telefone;email;data_nascimento;cpf;observacoes\r\nJoão da Silva;(11) 91234-5678;joao@exemplo.com;15/03/1990;;Prefere máquina 2\r\n";
}
