import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { DIAS_SEMANA, hhmm } from "@/lib/tempo";
import { adicionarFaixa, removerFaixa } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Horários" };

export default async function Page() {
  const u = await usuarioOuLogin();
  const profs = await q<{ id: string; nome: string }>(`select id, nome from profissional where empresa_id = $1 and ativo order by nome`, [u.empresa_id]);
  const faixas = await q<{ id: string; profissional_id: string; dia_semana: number; inicio_min: number; fim_min: number }>(
    `select d.* from disponibilidade d join profissional p on p.id = d.profissional_id where p.empresa_id = $1 order by dia_semana, inicio_min`,
    [u.empresa_id],
  );
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horários de atendimento</h1>
        <p className="text-sm muted">Cada profissional pode ter várias faixas por dia. O intervalo de almoço é o espaço entre duas faixas.</p>
      </div>
      {profs.map((p) => (
        <section key={p.id} className="card p-4 md:p-5">
          <h2 className="mb-3 font-medium">{p.nome}</h2>
          <div className="grid gap-2 md:grid-cols-7">
            {DIAS_SEMANA.map((nome, d) => (
              <div key={d} className="rounded-lg border border-white/10 p-2 text-sm">
                <div className="mb-1 font-medium">{nome}</div>
                {faixas
                  .filter((f) => f.profissional_id === p.id && f.dia_semana === d)
                  .map((f) => (
                    <form key={f.id} action={removerFaixa} className="flex items-center justify-between">
                      <input type="hidden" name="id" value={f.id} />
                      <span>
                        {hhmm(f.inicio_min)}–{hhmm(f.fim_min)}
                      </span>
                      <button className="text-[#ff9aa2]" aria-label="Remover faixa">
                        ×
                      </button>
                    </form>
                  ))}
                {!faixas.some((f) => f.profissional_id === p.id && f.dia_semana === d) && <span className="faint">Fechado</span>}
              </div>
            ))}
          </div>
          <Form action={adicionarFaixa} className="mt-4 flex flex-wrap items-end gap-3" botao="Adicionar faixa">
            <input type="hidden" name="profissional" value={p.id} />
            <fieldset className="flex flex-wrap gap-2 text-sm">
              {DIAS_SEMANA.map((n, d) => (
                <label key={d} className="flex items-center gap-1">
                  <input type="checkbox" name="dias" value={d} /> {n.slice(0, 3)}
                </label>
              ))}
            </fieldset>
            <Campo rotulo="Início">
              <input type="time" name="inicio" required defaultValue="09:00" className={inp} />
            </Campo>
            <Campo rotulo="Fim">
              <input type="time" name="fim" required defaultValue="18:00" className={inp} />
            </Campo>
          </Form>
        </section>
      ))}
    </div>
  );
}
