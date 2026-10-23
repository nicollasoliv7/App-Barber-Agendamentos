import type { CampoId } from "@/lib/importacao/campos";

/** Resposta do envio do arquivo (etapa 1) e do resultado final (etapa 4). */
export type Envio = { id: string; formato: string; colunas: string[]; amostra: string[][]; total: number; sugestao: Partial<Record<CampoId, number>> };
export type Resultado = {
  total: number;
  inseridos: number;
  completados: number;
  mantidos: number;
  duplicadosArquivo: number;
  erros: number;
  detalhesErros: { linha: number; motivos: string[] }[];
  detalhesAvisos: { linha: number; motivos: string[] }[];
};
