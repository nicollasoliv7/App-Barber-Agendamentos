import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDoCliente, historicoDeAtendimentos, indicadoresDoCliente, servicosPreferidos } from "@/lib/consultas/clientes";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora, reais } from "@/lib/tempo";
import { formatarTelefone, isUuid } from "@/lib/validacao";
import { Icone, Kpi, StatusBadge } from "@/components/ui";
import { salvarCliente } from "../../../acoes";
import PlanoDoCliente from "./PlanoDoCliente";
import CobrancasDoCliente from "./cobrancas";
import { Campo, Form } from "../../../Form";

export const metadata = { title: "Ficha do cliente" };

const ROTULO_EXTRA: Record<string, string> = { nascimento: "Nascimento", cpf: "CPF", descricao: "Observação no agendamento" };

export default async function FichaCliente({ params }: PageProps<"/painel/clientes/[id]">) {
  const u = await usuarioOuLogin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await fichaDoCliente(id, u.empresa_id);
  if (!c) notFound();
  const [hist, [k], fav] = await Promise.all([
    historicoDeAtendimentos(id, u.empresa_id),
    indicadoresDoCliente(id, u.empresa_id),
    servicosPreferidos(id, u.empresa_id),
  ]);
  const ticket = k.visitas_pagas ? Math.round(k.gasto / k.visitas_pagas) : 0; // atendimentos cobertos 100% pelo plano não entram
  const extras = Object.entries(c.dados_extras ?? {}).filter(([, v]) => v);

  return (
    <>
      <Link href="/painel/clientes" className="mb-4 inline-flex items-center gap-1 text-sm muted hover:text-white">
        ← Clientes
      </Link>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#ffb347] via-[#ff6b4a] to-[#ff2f3a] text-lg font-semibold text-black/80">
            {c.nome
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.nome}</h1>
            <p className="text-sm muted">
              {formatarTelefone(c.telefone)}
              {c.email ? ` · ${c.email}` : ""} · cliente desde {new Date(c.criado_em).toLocaleDateString("pt-BR")}
              {c.origem === "importacao" && ` · importado${c.arquivo_nome ? ` de ${c.arquivo_nome}` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`https://wa.me/55${c.telefone}`} target="_blank" rel="noreferrer" className="btn btn-sutil">
            <Icone nome="whatsapp" tamanho={15} /> WhatsApp
          </a>
          <Link href="/painel/agenda" className="btn btn-key">
            <Icone nome="calendario" tamanho={15} /> Agendar
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Indicadores do cliente">
        <Kpi rotulo="Visitas concluídas" valor={String(k.visitas)} />
        <Kpi rotulo="Total gasto" valor={reais(k.gasto)} detalhe="em atendimentos" />
        <Kpi rotulo="Ticket médio" valor={reais(ticket)} detalhe={k.visitas_pagas < k.visitas ? "sem os cobertos pelo plano" : undefined} />
        <Kpi rotulo="Faltas / cancel." valor={`${k.faltas} / ${k.cancelados}`} />
        <Kpi rotulo="Próximo horário" valor={k.proximo ? formatarDataHora(k.proximo) : "—"} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-x-auto" aria-labelledby="titulo-hist">
          <h2 id="titulo-hist" className="px-4 pt-4 font-medium">
            Histórico de agendamentos
          </h2>
          {hist.length === 0 ? (
            <p className="p-8 text-center text-sm muted">
              Nenhum agendamento ainda{c.origem === "importacao" ? " (o histórico do sistema anterior não é importado)" : ""}.
            </p>
          ) : (
            <table className="tabela mt-2 min-w-[560px]">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th className="text-right">Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hist.map((a) => (
                  <tr key={a.id}>
                    <td className="mono whitespace-nowrap text-[13px]">{formatarDataHora(a.inicio)}</td>
                    <td>{a.servico}</td>
                    <td className="muted">{a.profissional}</td>
                    <td className="text-right num">
                      {reais(a.preco_centavos)}
                      {a.valor_coberto_centavos > 0 && (
                        <div className="text-xs text-[#7ee2b0]">
                          {a.valor_coberto_centavos >= a.preco_centavos ? "coberto pelo plano" : `plano cobre ${reais(a.valor_coberto_centavos)}`}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid content-start gap-6">
          <PlanoDoCliente clienteId={c.id} empresaId={u.empresa_id} gestor={u.papel === "dono" || u.papel === "admin"} />
          <CobrancasDoCliente clienteId={c.id} empresaId={u.empresa_id} />
          <section className="card p-4" aria-labelledby="titulo-dados">
            <h2 id="titulo-dados" className="mb-3 font-medium">
              Dados do cliente
            </h2>
            <Form action={salvarCliente} className="grid gap-3">
              <input type="hidden" name="id" value={c.id} />
              <Campo rotulo="Nome">
                <input name="nome" defaultValue={c.nome} required className="input" />
              </Campo>
              <Campo rotulo="E-mail">
                <input name="email" type="email" defaultValue={c.email ?? ""} className="input" />
              </Campo>
              <Campo rotulo="Observações (só a equipe vê)">
                <textarea name="observacoes" defaultValue={c.observacoes ?? ""} rows={3} className="input" placeholder="Preferências, máquina, alergias…" />
              </Campo>
            </Form>
            <p className="mt-3 text-xs muted">O telefone identifica o cliente e não pode ser alterado aqui.</p>
          </section>
          {(extras.length > 0 || fav.length > 0) && (
            <section className="card p-4 text-sm">
              {fav.length > 0 && (
                <>
                  <h2 className="mb-2 font-medium">Serviços preferidos</h2>
                  <ul className="mb-4 grid gap-1">
                    {fav.map((s) => (
                      <li key={s.nome} className="flex justify-between">
                        <span>{s.nome}</span>
                        <span className="muted num">{s.qtd}×</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {extras.length > 0 && (
                <>
                  <h2 className="mb-2 font-medium">Informações extras</h2>
                  <dl className="grid gap-1">
                    {extras.map(([kk, vv]) => (
                      <div key={kk} className="flex justify-between gap-3">
                        <dt className="muted">{ROTULO_EXTRA[kk] ?? kk}</dt>
                        <dd className="text-right">{kk === "nascimento" && /^\d{4}-\d{2}-\d{2}$/.test(vv) ? `${vv.slice(8, 10)}/${vv.slice(5, 7)}/${vv.slice(0, 4)}` : vv}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </section>
          )}
          <p className="px-1 text-xs muted">
            Acesso ao histórico pela página pública: {c.telefone_verificado ? "senha cadastrada" : "ainda não criou senha"}.
          </p>
        </div>
      </div>
    </>
  );
}
