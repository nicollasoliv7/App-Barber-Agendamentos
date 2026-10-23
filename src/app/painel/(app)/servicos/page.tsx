import { servicosDaEmpresa } from "@/lib/consultas/cadastros";
import { usuarioOuLogin } from "@/lib/painel";
import type { Servico } from "@/lib/tipos";
import { salvarServico } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Serviços" };

const preco = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function Campos({ s }: { s?: Servico }) {
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Campo rotulo="Nome" className="md:col-span-2">
        <input name="nome" required defaultValue={s?.nome} className={inp} />
      </Campo>
      <Campo rotulo="Preço (R$)">
        <input name="preco" required inputMode="decimal" defaultValue={s ? preco(s.preco_centavos) : ""} placeholder="40,00" className={inp} />
      </Campo>
      <Campo rotulo="Duração (min)">
        <input name="duracao" type="number" min={5} max={600} step={5} required defaultValue={s?.duracao_min ?? 30} className={inp} />
      </Campo>
      <Campo rotulo="Descrição" className="md:col-span-2">
        <input name="descricao" defaultValue={s?.descricao ?? ""} className={inp} />
      </Campo>
      <Campo rotulo="Observação curta">
        <input name="observacao" defaultValue={s?.observacao ?? ""} placeholder="ex.: corte incluso" className={inp} />
      </Campo>
      <Campo rotulo="Ordem">
        <input name="ordem" type="number" defaultValue={s?.ordem ?? 0} className={inp} />
      </Campo>
      <Campo rotulo="Imagem (URL)" className="md:col-span-3">
        <input name="imagem_url" type="url" defaultValue={s?.imagem_url ?? ""} className={inp} />
      </Campo>
      <label className="flex items-center gap-2 text-sm self-end pb-2">
        <input type="checkbox" name="ativo" defaultChecked={s ? s.ativo : true} /> Ativo na página pública
      </label>
    </>
  );
}

export default async function Page() {
  const u = await usuarioOuLogin();
  const servicos = await servicosDaEmpresa(u.empresa_id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 font-medium">Novo serviço</h2>
        <Form action={salvarServico} className="grid gap-3 md:grid-cols-4" botao="Adicionar" resetar>
          <Campos />
        </Form>
      </section>
      {servicos.map((s) => (
        <details key={s.id} className="card p-4 md:p-5">
          <summary className="cursor-pointer flex flex-wrap gap-x-3 items-baseline">
            <span className="font-semibold">{s.nome}</span>
            <span className="text-sm muted">
              R$ {preco(s.preco_centavos)} · {s.duracao_min} min {!s.ativo && "· inativo"}
            </span>
          </summary>
          <Form action={salvarServico} className="mt-4 grid gap-3 md:grid-cols-4">
            <Campos s={s} />
          </Form>
        </details>
      ))}
    </div>
  );
}
