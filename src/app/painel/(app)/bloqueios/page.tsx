import { bloqueiosFuturos, profissionaisOpcoes } from "@/lib/consultas/cadastros";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora } from "@/lib/tempo";
import { adicionarBloqueio, removerBloqueio } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Folgas e bloqueios" };

export default async function Page() {
  const u = await usuarioOuLogin();
  const profs = await profissionaisOpcoes(u.empresa_id);
  const bls = await bloqueiosFuturos(u.empresa_id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Folgas e bloqueios</h1>
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 font-medium">Novo bloqueio</h2>
        <Form action={adicionarBloqueio} className="grid gap-3 md:grid-cols-3" botao="Bloquear" resetar>
          <Campo rotulo="Quem">
            <select name="profissional" className={inp}>
              <option value="">Toda a empresa (fechado)</option>
              {profs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="De (dia)">
            <input type="date" name="dia_inicio" required className={inp} />
          </Campo>
          <Campo rotulo="Até (dia) — opcional">
            <input type="date" name="dia_fim" className={inp} />
          </Campo>
          <Campo rotulo="Hora inicial — vazio = dia todo">
            <input type="time" name="hora_inicio" className={inp} />
          </Campo>
          <Campo rotulo="Hora final">
            <input type="time" name="hora_fim" className={inp} />
          </Campo>
          <Campo rotulo="Motivo">
            <input name="motivo" placeholder="Folga, feriado, curso…" className={inp} />
          </Campo>
        </Form>
      </section>
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 font-medium">Próximos bloqueios</h2>
        {bls.length === 0 && <p className="text-sm faint">Nenhum bloqueio futuro.</p>}
        <ul className="divide-hair text-sm">
          {bls.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <span>
                <b>{b.profissional ?? "Empresa toda"}</b> · {formatarDataHora(b.inicio)} → {formatarDataHora(b.fim)} {b.motivo && `· ${b.motivo}`}
              </span>
              <form action={removerBloqueio}>
                <input type="hidden" name="id" value={b.id} />
                <button className="text-[#ff9aa2]">Remover</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
