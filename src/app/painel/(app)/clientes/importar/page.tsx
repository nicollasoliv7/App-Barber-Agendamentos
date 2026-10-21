import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { FONTES_API, FONTES_ARQUIVO } from "@/lib/importacao/fontes";
import { NAO_IMPORTAVEL, CAMPOS } from "@/lib/importacao/campos";
import { Icone } from "@/components/ui";
import { Cabecalho } from "../../../Form";
import Importador from "./Importador";

export const metadata = { title: "Importar clientes" };

type Hist = {
  id: string;
  arquivo_nome: string | null;
  formato: string;
  status: string;
  total_linhas: number;
  resultado: { inseridos?: number; completados?: number; mantidos?: number; erros?: number } | null;
  criado_em: Date;
  autor: string | null;
};

export default async function Page() {
  const u = await usuarioOuLogin();
  const podeImportar = u.papel === "dono" || u.papel === "admin";
  const hist = await q<Hist>(
    `select i.id, i.arquivo_nome, i.formato, i.status, i.total_linhas, i.resultado, i.criado_em, up.nome as autor
     from importacao i left join usuario_painel up on up.id = i.usuario_id
     where i.empresa_id = $1 and i.status <> 'rascunho' order by i.criado_em desc limit 10`,
    [u.empresa_id],
  );

  return (
    <>
      <Link href="/painel/clientes" className="mb-4 inline-flex items-center gap-1 text-sm muted hover:text-white">
        ← Clientes
      </Link>
      <Cabecalho
        titulo="Importar clientes"
        descricao="Traga sua base de outro sistema de agendamento em poucos passos. Nada é gravado antes de você revisar e confirmar, e clientes que já existem nunca são sobrescritos."
      >
        {/* download de arquivo (route handler), não navegação: <a download> é o correto aqui */}
        <a href="/painel/importar-modelo" download className="btn btn-sutil">
          <Icone nome="download" tamanho={15} /> Baixar planilha-modelo
        </a>
      </Cabecalho>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{podeImportar ? <Importador /> : <p className="card p-6 text-sm">Só o dono ou um administrador pode importar clientes.</p>}</div>
        <aside className="grid content-start gap-4 text-sm">
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <Icone nome="check" tamanho={15} className="text-[#7ee2b0]" /> O que é importado
            </h2>
            <ul className="grid gap-1.5 muted">
              {CAMPOS.map((c) => (
                <li key={c.id}>
                  <span className="text-white">{c.rotulo}</span>
                  {c.obrigatorio && <span className="text-[#ffcf8a]"> · obrigatório</span>}
                  {c.dica && <span className="block text-xs faint">{c.dica}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <Icone nome="x" tamanho={15} className="text-[#ff9aa2]" /> O que não é importado
            </h2>
            <ul className="grid list-disc gap-1 pl-4 muted">
              {NAO_IMPORTAVEL.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-medium">Formatos aceitos</h2>
            <ul className="grid gap-1 muted">
              {FONTES_ARQUIVO.map((f) => (
                <li key={f.id}>
                  {f.nome} <span className="mono text-xs faint">{f.extensoes.join(" ")}</span>
                </li>
              ))}
              <li className="text-xs faint">Até 5 MB e 10.000 linhas por arquivo.</li>
            </ul>
            <p className="mt-3 text-xs muted">
              <b className="text-white">Integrações por API:</b>{" "}
              {FONTES_API.length === 0
                ? "nenhuma disponível ainda. A importação está preparada para receber conectores no futuro; por enquanto, exporte do sistema antigo em CSV ou Excel."
                : FONTES_API.map((f) => f.nome).join(", ")}
            </p>
          </section>
        </aside>
      </div>

      {hist.length > 0 && (
        <section className="card mt-8 overflow-x-auto" aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="px-4 pt-4 font-medium">
            Importações anteriores
          </h2>
          <table className="tabela mt-2 min-w-[640px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Arquivo</th>
                <th>Por</th>
                <th className="text-right">Linhas</th>
                <th className="text-right">Novos</th>
                <th className="text-right">Completados</th>
                <th className="text-right">Erros</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.id}>
                  <td className="mono text-[13px]">{new Date(h.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    {h.arquivo_nome ?? "—"} {h.status === "cancelada" && <span className="badge badge-neutro ml-1">cancelada</span>}
                  </td>
                  <td className="muted">{h.autor ?? "—"}</td>
                  <td className="text-right num">{h.total_linhas}</td>
                  <td className="text-right num">{h.resultado?.inseridos ?? "—"}</td>
                  <td className="text-right num">{h.resultado?.completados ?? "—"}</td>
                  <td className="text-right num">{h.resultado?.erros ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
