/**
 * Ponto único de saída de logs do servidor. Hoje escreve no console (é o que a
 * Vercel e o terminal coletam); trocar o destino é mudar só este arquivo.
 * Este é o único arquivo liberado da regra quality/no-direct-console.
 */
export const log = {
  info: (...partes: unknown[]) => console.log(...partes),
  erro: (...partes: unknown[]) => console.error(...partes),
};
