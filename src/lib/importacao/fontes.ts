/**
 * Fontes de importação de clientes.
 *
 * Hoje existem apenas fontes de ARQUIVO (CSV e Excel). A estrutura está pronta para
 * integrações por API: cada conector novo implementa `FonteApi`, devolvendo uma
 * `Planilha` (colunas + linhas). Daí em diante ela segue exatamente o mesmo
 * caminho (mapeamento → análise → confirmação), com as mesmas validações.
 *
 * Nenhum conector de API está implementado: a lista `FONTES_API` está vazia de
 * propósito, e a tela informa isso em vez de exibir integrações que não funcionam.
 */
import type { Planilha } from "./leitura";

export interface FonteArquivo {
  id: "csv" | "xlsx";
  nome: string;
  extensoes: string[];
}

export interface FonteApi {
  /** identificador gravado em importacao.fonte */
  id: string;
  nome: string;
  /** credenciais que o dono precisa informar (ex.: token da API do sistema antigo) */
  credenciais: { chave: string; rotulo: string; segredo: boolean }[];
  /** busca os clientes no sistema de origem e devolve no formato comum */
  buscarClientes(credenciais: Record<string, string>): Promise<Planilha>;
}

export const FONTES_ARQUIVO: FonteArquivo[] = [
  { id: "csv", nome: "CSV (exportação da maioria dos sistemas)", extensoes: [".csv", ".txt"] },
  { id: "xlsx", nome: "Excel (.xlsx)", extensoes: [".xlsx"] },
];

export const FONTES_API: FonteApi[] = [];
