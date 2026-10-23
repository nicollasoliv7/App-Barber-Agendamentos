import Link from "next/link";
import { assinantes, clientesParaBusca, planosDaEmpresa, servicosAtivosComPreco, type PlanoComServicos } from "@/lib/consultas/planos";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento } from "@/lib/empresa";
import { PERIODOS, resumoPlanos, STATUS_ASSINATURA, TOLERANCIA_DIAS } from "@/lib/planos";
import { diaLocal, instanteLocal, reais, somarDias } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { Kpi } from "@/components/ui";
import { Cabecalho, Campo, Form, inp } from "../../Form";
import { assinarPlanoAcao, salvarPlanoAcao } from "../../acoes-planos";

export const metadata = { title: "Planos" };

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const paraReais = (c: number) => (c / 100).toFixed(2).replace(".", ",");


export default async function Page({ searchParams }: PageProps<"/painel/planos">) {
  const u = await usuarioOuLogin();
  const gestor = u.papel === "dono" || u.papel === "admin";
  const sp = await searchParams;
  const filtro = typeof sp.st === "string" && STATUS_ASSINATURA[sp.st] ? sp.st : "abertas";
  const cfg = await configAgendamento(u.empresa_id);
  const hoje = diaLocal(new Date(), cfg.fuso_horario);
  const iniMes = instanteLocal(`${hoje.slice(0, 8)}01`, 0, cfg.fuso_horario);
  const fimMes = instanteLocal(somarDias(hoje, 1), 0, cfg.fuso_horario);

  const resumo = await resumoPlanos(u.empresa_id, iniMes, fimMes); // também sincroniza ciclos e status
  const [planos, servicos, assinaturas, clientes] = await Promise.all([
    planosDaEmpresa(u.empresa_id),
    servicosAtivosComPreco(u.empresa_id),
    assinantes(u.empresa_id, filtro),
    clientesParaBusca(u.empresa_id),
  ]);
  const ativos = planos.filter((p) => p.ativo);

  return (
    <>
      <Cabecalho
        titulo="Planos mensais"
        descricao="Módulo opcional. Transforme clientes frequentes em clientes recorrentes com planos personalizados e tenha mais previsibilidade de faturamento. A agenda, os clientes e o financeiro funcionam normalmente sem ele."
      />

      {planos.length === 0 ? (
        <section className="card mb-6 p-5 md:p-6" aria-labelledby="titulo-comecar">
          <h2 id="titulo-comecar" className="text-lg font-semibold">
            Quer começar a vender planos?
          </h2>
          <ol className="mt-3 grid gap-2 text-sm muted">
            <li>1. Crie um plano abaixo: preço, período e os serviços incluídos (com limite de usos, se quiser).</li>
            <li>2. Abra a ficha de um cliente (ou use “Adicionar assinante” aqui) e ative o plano.</li>
            <li>3. Quando esse cliente agendar um serviço do plano, o atendimento já aparece como coberto, sem cobrar de novo.</li>
          </ol>
          <p className="mt-3 text-xs faint">As mensalidades são registradas por você (Pix, dinheiro, cartão). Cobrança automática ainda não está disponível.</p>
        </section>
      ) : (
        <>
          <section aria-label="Indicadores dos planos" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi icone="usuarios" rotulo="Assinaturas ativas" valor={String(resumo.ativas)} detalhe={resumo.pendentes ? `${resumo.pendentes} aguardando 1º pagamento` : undefined} />
            <Kpi icone="grafico" rotulo="Receita recorrente mensal" valor={reais(resumo.recorrenteMensal)} detalhe="das assinaturas ativas" />
            <Kpi icone="dinheiro" rotulo="Recebido de planos no mês" valor={reais(resumo.recebido)} detalhe="mensalidades pagas" />
            <Kpi
              icone="alerta"
              rotulo="Mensalidades em aberto"
              valor={reais(resumo.emAberto.valor)}
              detalhe={`${resumo.emAberto.qtd} em aberto${resumo.inadimplentes ? ` · ${resumo.inadimplentes} atrasada${resumo.inadimplentes > 1 ? "s" : ""}` : ""}`}
            />
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="card overflow-x-auto" aria-labelledby="titulo-assinantes">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
                <h2 id="titulo-assinantes" className="font-medium">
                  Assinantes
                </h2>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
                  {[["abertas", "Em andamento"], ...Object.entries(STATUS_ASSINATURA).map(([k, v]) => [k, v.rotulo])].map(([k, r]) => (
                    <Link key={k} href={`/painel/planos?st=${k}`} data-ativo={filtro === k} className="chip !py-1 !text-[12px]">
                      {r}
                    </Link>
                  ))}
                </div>
              </div>
              {assinaturas.length === 0 ? (
                <p className="p-8 text-center text-sm muted">Nenhuma assinatura nesta situação.</p>
              ) : (
                <table className="tabela mt-2 min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Plano</th>
                      <th>Situação</th>
                      <th>Renova em</th>
                      <th className="text-right">Valor</th>
                      <th className="text-right">Usos no ciclo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assinaturas.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/painel/clientes/${a.cliente_id}`} className="font-medium hover:underline underline-offset-2">
                            {a.cliente}
                          </Link>
                          <div className="text-xs muted">{formatarTelefone(a.telefone)}</div>
                        </td>
                        <td>{a.plano}</td>
                        <td>
                          <span className={`badge ${STATUS_ASSINATURA[a.status].classe}`}>{STATUS_ASSINATURA[a.status].rotulo}</span>
                        </td>
                        <td className="mono text-[13px]">{a.status === "cancelada" ? "—" : fmt(a.ciclo_fim)}</td>
                        <td className="text-right num">
                          {reais(a.preco_centavos)}
                          <div className="text-xs faint">{PERIODOS[a.periodo_meses].toLowerCase()}</div>
                        </td>
                        <td className="text-right num">{a.usos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="px-4 pb-4 pt-2 text-xs faint">
                “Mensalidade atrasada” = vencida há mais de {TOLERANCIA_DIAS} dias sem pagamento registrado. Registre pagamentos na ficha do cliente ou em Financeiro.
              </p>
            </section>

            <div className="grid content-start gap-6">
              <section className="card p-4" aria-labelledby="titulo-renovacoes">
                <h2 id="titulo-renovacoes" className="font-medium">
                  Próximas renovações
                </h2>
                <p className="text-xs muted">Até 7 dias</p>
                {resumo.renovacoes.length === 0 ? (
                  <p className="py-6 text-center text-sm muted">Nenhuma renovação nos próximos dias.</p>
                ) : (
                  <ul className="mt-2 divide-hair text-sm">
                    {resumo.renovacoes.map((r) => (
                      <li key={r.assinatura_id} className="flex items-center justify-between gap-2 py-2">
                        <Link href={`/painel/clientes/${r.cliente_id}`} className="min-w-0 truncate hover:underline underline-offset-2">
                          {r.cliente}
                          <span className="block text-xs muted">{r.plano}</span>
                        </Link>
                        <span className="text-right">
                          <span className="mono text-[13px] text-[var(--amber)]">{fmt(r.ciclo_fim)}</span>
                          <span className="block text-xs muted num">{reais(r.valor)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {gestor && ativos.length > 0 && (
                <section className="card p-4" aria-labelledby="titulo-adicionar">
                  <h2 id="titulo-adicionar" className="mb-3 font-medium">
                    Adicionar assinante
                  </h2>
                  <Form action={assinarPlanoAcao} botao="Ativar plano" resetar className="grid gap-3">
                    <Campo rotulo="Cliente (nome ou celular)">
                      <input name="cliente" list="lista-clientes" required className={inp} placeholder="Digite para buscar" autoComplete="off" />
                    </Campo>
                    <datalist id="lista-clientes">
                      {clientes.map((c) => (
                        <option key={c.telefone} value={`${c.nome} · ${formatarTelefone(c.telefone)}`} />
                      ))}
                    </datalist>
                    <Campo rotulo="Plano">
                      <select name="plano_id" required className={inp}>
                        {ativos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome} · {reais(p.preco_centavos)}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo rotulo="Início">
                      <input type="date" name="inicio" defaultValue={hoje} required className={inp} />
                    </Campo>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="pago_agora" /> Já recebi o primeiro pagamento
                    </label>
                    <Campo rotulo="Forma de pagamento (se já recebeu)">
                      <select name="metodo" className={inp} defaultValue="pix">
                        <option value="pix">Pix</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="cartao">Cartão</option>
                        <option value="transferencia">Transferência</option>
                        <option value="outro">Outro</option>
                      </select>
                    </Campo>
                  </Form>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      <section className="mt-6" aria-labelledby="titulo-planos">
        <h2 id="titulo-planos" className="mb-3 font-medium">
          {planos.length ? "Seus planos" : "Criar o primeiro plano"}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {planos.map((p) => (
            <article key={p.id} className={`card p-4 ${p.ativo ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">
                    {p.nome} {!p.ativo && <span className="badge badge-neutro ml-1">Inativo</span>}
                  </h3>
                  <p className="text-sm">
                    <span className="num font-medium">{reais(p.preco_centavos)}</span> <span className="muted">· {PERIODOS[p.periodo_meses].toLowerCase()}</span>
                  </p>
                </div>
                <span className="text-xs muted">
                  {p.assinantes} assinante{p.assinantes === 1 ? "" : "s"}
                </span>
              </div>
              {p.descricao && <p className="mt-2 text-sm muted">{p.descricao}</p>}
              <ul className="mt-3 grid gap-1 text-sm">
                {p.servicos.map((s) => (
                  <li key={s.servico_id} className="flex justify-between gap-2">
                    <span>{s.nome}</span>
                    <span className="muted">
                      {s.limite_por_ciclo ? `${s.limite_por_ciclo}× por ciclo` : "sem limite"}
                      {s.valor_cliente_centavos > 0 && ` · cliente paga ${reais(s.valor_cliente_centavos)}`}
                    </span>
                  </li>
                ))}
                {p.beneficios && <li className="muted">+ {p.beneficios}</li>}
              </ul>
              {gestor && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs muted">Editar plano</summary>
                  <FormPlano plano={p} servicos={servicos} />
                </details>
              )}
            </article>
          ))}
          {gestor && (
            <article className="card p-4">
              {planos.length > 0 ? (
                <details>
                  <summary className="cursor-pointer font-medium">+ Novo plano</summary>
                  <FormPlano servicos={servicos} />
                </details>
              ) : (
                <FormPlano servicos={servicos} />
              )}
            </article>
          )}
        </div>
      </section>
    </>
  );
}

function FormPlano({ plano, servicos }: { plano?: PlanoComServicos; servicos: { id: string; nome: string; preco_centavos: number }[] }) {
  const inc = new Map(plano?.servicos.map((s) => [s.servico_id, s]) ?? []);
  return (
    <Form action={salvarPlanoAcao} botao={plano ? "Salvar plano" : "Criar plano"} resetar={!plano} className="mt-3 grid gap-3">
      {plano && <input type="hidden" name="id" value={plano.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Nome do plano" className="sm:col-span-3">
          <input name="nome" required defaultValue={plano?.nome ?? ""} placeholder="ex.: Clube do Corte" maxLength={80} className={inp} />
        </Campo>
        <Campo rotulo="Preço (R$)">
          <input name="preco" required inputMode="decimal" defaultValue={plano ? paraReais(plano.preco_centavos) : ""} placeholder="99,90" className={inp} />
        </Campo>
        <Campo rotulo="Cobrança" className="sm:col-span-2">
          <select name="periodo_meses" defaultValue={plano?.periodo_meses ?? 1} className={inp}>
            {Object.entries(PERIODOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <fieldset className="grid gap-2">
        <legend className="rotulo mb-1">Serviços incluídos (limite por ciclo vazio = sem limite)</legend>
        {servicos.map((s) => {
          const atual = inc.get(s.id);
          return (
            <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_76px_96px] items-center gap-2 text-sm">
              <label className="flex min-w-0 items-center gap-2">
                <input type="checkbox" name="servico" value={s.id} defaultChecked={!!atual} />
                <span className="truncate">{s.nome}</span>
              </label>
              <input
                name={`limite_${s.id}`}
                inputMode="numeric"
                defaultValue={atual?.limite_por_ciclo ?? ""}
                placeholder="limite"
                aria-label={`Limite de usos de ${s.nome} por ciclo`}
                className="input !py-1.5"
              />
              <input
                name={`adicional_${s.id}`}
                inputMode="decimal"
                defaultValue={atual?.valor_cliente_centavos ? paraReais(atual.valor_cliente_centavos) : ""}
                placeholder="cliente paga"
                aria-label={`Valor que o cliente ainda paga por ${s.nome} (R$)`}
                className="input !py-1.5"
              />
            </div>
          );
        })}
        <p className="text-xs faint">“Cliente paga”: valor adicional por uso (ex.: R$ 10 na luzes). Vazio = 100% coberto.</p>
      </fieldset>
      <Campo rotulo="Outros benefícios (opcional)">
        <input name="beneficios" defaultValue={plano?.beneficios ?? ""} placeholder="ex.: 10% de desconto em produtos" maxLength={200} className={inp} />
      </Campo>
      <Campo rotulo="Descrição (opcional)">
        <input name="descricao" defaultValue={plano?.descricao ?? ""} maxLength={300} className={inp} />
      </Campo>
      {plano && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={plano.ativo} /> Plano ativo (aceita novas assinaturas)
        </label>
      )}
      {plano && plano.assinantes > 0 && (
        <p className="text-xs text-[#ffcf8a]">Preço e período novos valem só para novas assinaturas: os assinantes atuais mantêm o valor combinado. Serviços incluídos e limites valem a partir de agora; atendimentos já registrados não mudam.</p>
      )}
    </Form>
  );
}
