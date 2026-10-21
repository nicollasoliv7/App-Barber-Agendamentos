import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function hashSenha(senha: string): string {
  const sal = randomBytes(16).toString("hex");
  const h = scryptSync(senha, sal, 64).toString("hex");
  return `scrypt$${sal}$${h}`;
}

export function conferirSenha(senha: string, armazenado: string | null | undefined): boolean {
  if (!armazenado) return false;
  const [alg, sal, h] = armazenado.split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const calc = scryptSync(senha, sal, 64);
  const esperado = Buffer.from(h, "hex");
  return esperado.length === calc.length && timingSafeEqual(calc, esperado);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const tokenAleatorio = (bytes = 24) => randomBytes(bytes).toString("hex");
