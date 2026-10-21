import "server-only";
import { NextResponse } from "next/server";
import { ErroNegocio } from "./tipos";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Envolve um handler: erros de negócio viram JSON {erro}, o resto vira 500. */
export async function rota(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroNegocio) return NextResponse.json({ erro: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ erro: "Erro inesperado. Tente novamente." }, { status: 500 });
  }
}

export async function corpo<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErroNegocio("JSON inválido");
  }
}
