import { modeloCsv } from "@/lib/importacao";
import { usuarioPainel } from "@/lib/sessao";

/** Planilha-modelo para quem vai montar a lista à mão. */
export async function GET() {
  if (!(await usuarioPainel())) return new Response("Faça login", { status: 401 });
  return new Response(modeloCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="modelo-clientes.csv"' },
  });
}
