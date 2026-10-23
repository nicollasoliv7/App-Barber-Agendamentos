import Link from "next/link";
import { assinaturasDoCliente, mensalidadesRecentes, planosAtivos, sincronizarDoCliente, usosNoCiclo } from "@/lib/consultas/planos";
import { hojeDaEmpresa, METODOS, PERIODOS, STATUS_ASSINATURA } from "@/lib/planos";
import { reais } from "@/lib/tempo";
import { Campo, Form } from "../../../Form";
import { assinarPlanoAcao, cancelarAssinaturaAcao, desfazerMensalidadeAcao, registrarMensalidadeAcao } from "../../../acoes-planos";

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Bloco "Plano mensal" da ficha do cliente. Não aparece para barbearias que não têm planos. */
export default async function PlanoDoCliente({ clienteId, empresaId, gestor }: { clienteId: string; empresaId: string; gestor: boolean }) {
  await sincronizarDoCliente(empresaId, clienteId);
  const [assinaturas, planos, { hoje }] = await Promise.all([
    assinaturasDoCliente(clienteId, empresaId),
    planosAtivos(empresaId),
    hojeDaEmpresa(empresaId),
  ]);
  const aberta = assinaturas.find((a) => a.status !== "cancelada");
  if (!aberta && planos.length === 0 && assinaturas.length === 0) return null; // barbearia sem planos: nada aparece

  const [usos, cobrancas] = aberta
    ? await Promise.all([usosNoCiclo(aberta.id, aberta.plano_id, aberta.ciclo_inicio), mensalidadesRecentes(aberta.id)])
    : [[], []];
  const st = aberta ? STATUS_ASSINATURA[aberta.status] : null;

  return (
    <section className="card p-4" aria-labelledby="titulo-plano">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="titulo-plano" className="font-medium">
          Plano mensal
        </h2>
        <Link href="/painel/planos" className="text-xs muted hover:text-white">
          Planos →
        </Link>
      </div>

      {aberta && st ? (
        <div className="grid gap-4 text-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b className="font-semibold">{aberta.plano}</b>
              <span className={`badge ${st.classe}`}>{st.rotulo}</span>
            </div>
            <p className="mt-1 text-xs muted">
              {reais(aberta.preco_centavos)} · {PERIODOS[aberta.periodo_meses].toLowerCase()} · desde {fmt(aberta.inicio)}
              <br />
              Ciclo atual: {fmt(aberta.ciclo_inicio)} a {fmt(aberta.ciclo_fim)} (renova em {fmt(aberta.ciclo_fim)})
            </p>
          </div>

          {usos.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs muted">Uso no ciclo</h3>
              <ul className="grid gap-1">
                {usos.map((u) => (
                  <li key={u.servico} className="flex justify-between">
                    <span>{u.servico}</span>
                    <span className="num muted">
                      {u.usados}
                      {u.limite_por_ciclo !== null ? ` de ${u.limite_por_ciclo}` : " (sem limite)"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-1 text-xs muted">Mensalidades</h3>
            <ul className="divide-hair">
              {cobrancas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="num">{reais(c.valor_centavos)}</span>
                    <span className="block text-xs muted">
                      vence {fmt(c.vencimento)}
                      {c.status === "paga" && ` · paga (${METODOS[c.metodo ?? ""] ?? c.metodo})`}
                      {c.status === "cancelada" && " · cancelada"}
                      {c.status === "pendente" && c.vencimento < hoje && <span className="text-[#ff9aa2]"> · atrasada</span>}
                    </span>
                  </span>
                  {c.status === "pendente" && (
                    <Form action={registrarMensalidadeAcao} botao="Registrar pagamento" className="flex items-center gap-2">
                      <input type="hidden" name="cobranca_id" value={c.id} />
                      <select name="metodo" aria-label="Forma de pagamento" className="input !w-auto !py-1.5 text-sm" defaultValue="pix">
                        {Object.entries(METODOS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Form>
                  )}
                  {c.status === "paga" && gestor && (
                    <Form action={desfazerMensalidadeAcao} botao="Desfazer" className="flex items-center">
                      <input type="hidden" name="cobranca_id" value={c.id} />
                    </Form>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs faint">Pagamentos registrados por você. Cobrança automática ainda não disponível (depende de gateway).</p>
          </div>

          {gestor && (
            <details>
              <summary className="cursor-pointer text-xs muted">Cancelar assinatura</summary>
              <Form action={cancelarAssinaturaAcao} botao="Cancelar assinatura" className="mt-2 grid gap-2">
                <input type="hidden" name="assinatura_id" value={aberta.id} />
                <Campo rotulo="Motivo (opcional)">
                  <input name="motivo" className="input" maxLength={200} />
                </Campo>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmo" required /> Confirmo o cancelamento
                </label>
                <p className="text-xs faint">Mensalidades pendentes são canceladas; as pagas e o histórico de atendimentos ficam como estão.</p>
              </Form>
            </details>
          )}
        </div>
      ) : planos.length > 0 && gestor ? (
        <Form action={assinarPlanoAcao} botao="Ativar plano" resetar className="grid gap-3">
          <input type="hidden" name="cliente_id" value={clienteId} />
          <Campo rotulo="Plano">
            <select name="plano_id" required className="input">
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {reais(p.preco_centavos)} ({PERIODOS[p.periodo_meses].toLowerCase()})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Início">
            <input type="date" name="inicio" defaultValue={hoje} required className="input" />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pago_agora" /> Já recebi o primeiro pagamento
          </label>
          <Campo rotulo="Forma de pagamento (se já recebeu)">
            <select name="metodo" className="input" defaultValue="pix">
              {Object.entries(METODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
          <p className="text-xs faint">Sem o pagamento, o plano fica “aguardando 1º pagamento” e ainda não cobre atendimentos.</p>
        </Form>
      ) : (
        <p className="text-sm muted">Sem plano no momento.</p>
      )}

      {assinaturas.some((a) => a.status === "cancelada") && (
        <p className="mt-3 text-xs faint">
          Planos anteriores:{" "}
          {assinaturas
            .filter((a) => a.status === "cancelada")
            .map((a) => `${a.plano} (cancelado em ${a.cancelada_em ? new Date(a.cancelada_em).toLocaleDateString("pt-BR") : "—"})`)
            .join(", ")}
        </p>
      )}
    </section>
  );
}
