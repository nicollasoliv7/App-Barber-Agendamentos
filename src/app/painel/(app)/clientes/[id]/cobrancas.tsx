import {
  assinaturasCobrancaCliente,
  clienteTemOptout,
  cobrancasPendentesCliente,
  historicoEtapas,
} from "@/lib/consultas/cobrancas-mensalidade";
import { reais } from "@/lib/tempo";
import { Form } from "../../../Form";
import { cobrarAgoraAcao, pausarAssinanteAcao, reativarOptoutAcao } from "../../../acoes-cobrancas";

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const ETAPA: Record<string, string> = {
  antes: "Antes do vencimento",
  vencimento: "No vencimento",
  depois: "Após o vencimento",
  manual: "Manual",
};

const STATUS_OK = new Set(["aceito", "entregue", "lida"]);

/** Bloco "Cobrança automática" da ficha do cliente. */
export default async function CobrancasDoCliente({ clienteId, empresaId }: { clienteId: string; empresaId: string }) {
  const [assinaturas, pendentes, temOptout] = await Promise.all([
    assinaturasCobrancaCliente(clienteId, empresaId),
    cobrancasPendentesCliente(clienteId, empresaId),
    clienteTemOptout(empresaId, clienteId),
  ]);

  if (assinaturas.length === 0 && !temOptout) return null;

  const etapasPorCobranca = Object.fromEntries(
    await Promise.all(pendentes.map(async (c) => [c.id, await historicoEtapas(c.id, empresaId)] as const)),
  );

  const pendentesDeAssinatura = (assinaturaId: string) => pendentes.filter((c) => c.assinatura_id === assinaturaId);

  return (
    <section className="card p-4" aria-labelledby="titulo-cobranca-auto">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="titulo-cobranca-auto" className="font-medium">
          Cobrança automática
        </h2>
      </div>

      {temOptout && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[#ff9aa2]/25 bg-[#ff9aa2]/[0.06] p-3"
        >
          <p className="text-sm font-medium text-[#ff9aa2]">Cliente enviou PARAR</p>
          <p className="mt-0.5 text-xs muted">A régua automática está desativada para este cliente.</p>
          <Form action={reativarOptoutAcao} botao="Reativar cobrança" className="mt-2 flex items-center gap-2">
            <input type="hidden" name="cliente_id" value={clienteId} />
          </Form>
        </div>
      )}

      {assinaturas.length === 0 && (
        <p className="text-sm muted">Nenhum plano ativo no momento.</p>
      )}

      <div className="grid gap-4">
        {assinaturas.map((a) => {
          const cobrancas = pendentesDeAssinatura(a.id);
          return (
            <div key={a.id} className="text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">{a.plano}</span>
                {a.cobranca_pausada && (
                  <span className="badge badge-warn">Cobrança pausada</span>
                )}
              </div>

              {cobrancas.length === 0 ? (
                <p className="text-xs muted">Sem mensalidades pendentes.</p>
              ) : (
                <ul className="divide-hair mb-3">
                  {cobrancas.map((c) => {
                    const etapas = etapasPorCobranca[c.id] ?? [];
                    return (
                      <li key={c.id} className="py-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span>
                            <span className="num font-medium">{reais(c.valor_centavos)}</span>
                            <span className="block text-xs muted">vence {fmt(c.vencimento)}</span>
                          </span>
                          <Form action={cobrarAgoraAcao} botao="Cobrar agora" className="flex items-center gap-2">
                            <input type="hidden" name="cobranca_id" value={c.id} />
                          </Form>
                        </div>

                        {etapas.length > 0 && (
                          <ul className="mt-2 grid gap-0.5">
                            {etapas.map((e) => (
                              <li
                                key={`${e.etapa}-${e.criado_em}`}
                                className="flex items-center gap-1.5 text-xs"
                              >
                                <span
                                  className={STATUS_OK.has(e.status ?? "") ? "text-[#7ee2b0]" : "text-[#ff9aa2]"}
                                  aria-hidden
                                >
                                  {STATUS_OK.has(e.status ?? "") ? "✓" : "✗"}
                                </span>
                                <span className="muted">
                                  {ETAPA[e.etapa] ?? e.etapa} · {fmt(e.dia)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <Form
                action={pausarAssinanteAcao}
                botao={a.cobranca_pausada ? "Retomar cobrança" : "Pausar cobrança"}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="assinatura_id" value={a.id} />
                {!a.cobranca_pausada && <input type="hidden" name="pausar" value="on" />}
              </Form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
