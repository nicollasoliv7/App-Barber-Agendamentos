import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import type { Profissional } from "@/lib/tipos";
import { salvarProfissional } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Profissionais" };

export default async function Page() {
  const u = await usuarioOuLogin();
  const [profs, servicos, vinc, unidades] = await Promise.all([
    q<Profissional>(`select * from profissional where empresa_id = $1 order by ativo desc, nome`, [u.empresa_id]),
    q<{ id: string; nome: string }>(`select id, nome from servico where empresa_id = $1 order by ordem, nome`, [u.empresa_id]),
    q<{ profissional_id: string; servico_id: string }>(
      `select ps.* from profissional_servico ps join profissional p on p.id = ps.profissional_id where p.empresa_id = $1`,
      [u.empresa_id],
    ),
    q<{ id: string; nome: string }>(`select id, nome from unidade where empresa_id = $1 and ativo order by nome`, [u.empresa_id]),
  ]);
  const faz = (p: string, s: string) => vinc.some((v) => v.profissional_id === p && v.servico_id === s);

  const campos = (p?: Profissional) => (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Campo rotulo="Nome">
        <input name="nome" required defaultValue={p?.nome} className={inp} />
      </Campo>
      <Campo rotulo="Telefone">
        <input name="telefone" defaultValue={p?.telefone ?? ""} className={inp} />
      </Campo>
      <Campo rotulo="Comissão (%)">
        <input name="comissao" type="number" min={0} max={100} required defaultValue={p?.comissao_pct ?? 40} className={inp} />
      </Campo>
      {unidades.length > 0 && (
        <Campo rotulo="Unidade">
          <select name="unidade" defaultValue={p?.unidade_id ?? ""} className={inp}>
            <option value="">Todas as unidades</option>
            {unidades.map((un) => (
              <option key={un.id} value={un.id}>
                {un.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {p && (
        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo
        </label>
      )}
      <fieldset className="md:col-span-4">
        <legend className="mb-1 text-sm muted">Serviços que realiza</legend>
        <div className="flex flex-wrap gap-2">
          {servicos.map((s) => (
            <label key={s.id} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-sm">
              <input type="checkbox" name="servicos" value={s.id} defaultChecked={p ? faz(p.id, s.id) : true} /> {s.nome}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 font-medium">Novo profissional</h2>
        <p className="mb-3 text-xs muted">Começa com expediente padrão (seg–sex 9h–18h, sáb 9h–14h), que você ajusta em Horários.</p>
        <Form action={salvarProfissional} className="grid gap-3 md:grid-cols-4" botao="Adicionar" resetar>
          {campos()}
        </Form>
      </section>
      {profs.map((p) => (
        <details key={p.id} className="card p-4 md:p-5">
          <summary className="cursor-pointer">
            <span className="font-semibold">{p.nome}</span>{" "}
            <span className="text-sm muted">
              comissão {p.comissao_pct}% {!p.ativo && "· inativo"}
            </span>
          </summary>
          <Form action={salvarProfissional} className="mt-4 grid gap-3 md:grid-cols-4">
            {campos(p)}
          </Form>
        </details>
      ))}
    </div>
  );
}
