"use server";

import { revalidatePath } from "next/cache";
import { usuarioPainel } from "@/lib/sessao";
import * as imp from "@/lib/importacao";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";
import { log } from "@/lib/log";

type Resp<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function gestor() {
  const u = await usuarioPainel();
  if (!u) throw new ErroNegocio("Sua sessão expirou. Entre de novo.", 401);
  if (u.papel !== "dono" && u.papel !== "admin") throw new ErroNegocio("Só o dono ou um administrador pode importar clientes.", 403);
  return u;
}

async function rodar<T>(fn: () => Promise<T>): Promise<Resp<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, erro: e.message };
    log.erro(e);
    return { ok: false, erro: "Não foi possível processar. Tente novamente." };
  }
}

export async function enviarArquivoImportacao(f: FormData) {
  return rodar(async () => {
    const u = await gestor();
    const arq = f.get("arquivo");
    if (!(arq instanceof File)) throw new ErroNegocio("Escolha um arquivo.");
    const buf = Buffer.from(await arq.arrayBuffer());
    return imp.enviarArquivo(u.empresa_id, u.id, arq.name, buf);
  });
}

export async function analisarImportacao(id: string, mapeamento: Record<string, number | null>, ddd: string) {
  return rodar(async () => {
    const u = await gestor();
    if (!isUuid(id)) throw new ErroNegocio("Importação inválida");
    return imp.analisar(u.empresa_id, id, mapeamento, ddd);
  });
}

export async function confirmarImportacao(id: string, mapeamento: Record<string, number | null>, ddd: string, politica: "manter" | "completar") {
  return rodar(async () => {
    const u = await gestor();
    if (!isUuid(id)) throw new ErroNegocio("Importação inválida");
    const r = await imp.confirmar(u.empresa_id, id, mapeamento, ddd, politica);
    revalidatePath("/painel/clientes", "layout");
    return r;
  });
}

export async function cancelarImportacao(id: string) {
  return rodar(async () => {
    const u = await gestor();
    if (isUuid(id)) await imp.cancelar(u.empresa_id, id);
    return true;
  });
}
