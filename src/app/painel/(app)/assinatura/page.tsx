import { usuarioOuLogin } from "@/lib/painel";
import { LIMITE_GRATUITO, PLANOS_SISTEMA, situacaoAssinatura, type PlanoPago } from "@/lib/planos-sistema";
import { cobrancaDaEmpresa, conferirPendentes, sincronizarCobranca, type StatusCobranca } from "@/lib/assinatura-sistema";
import { pendenciasConfiguracao } from "@/lib/abacatepay";
import { cobrancasSistema } from "@/lib/consultas/assinatura";
import { reais } from "@/lib/tempo";
import { log } from "@/lib/log";
import { Cabecalho } from "../../Form";
import BotaoPagar from "./BotaoPagar";

export const metadata = { title: "Assinatura" };

const data = (d: Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const NOME = { gratuito: "Gratuito", ...Object.fromEntries(Object.entries(PLANOS_SISTEMA).map(([k, v]) => [k, v.nome])) } as Record<string, string>;
const STATUS: Record<StatusCobranca, [string, string]> = {
  pendente: ["badge-warn", "Aguardando pagamento"],
  pago: ["badge-ok", "Pago"],
  expirado: ["badge-neutro", "Expirado"],
  cancelado: ["badge-neutro", "Cancelado"],
  estornado: ["badge-danger", "Estornado"],
};
// economia calculada sobre o Mensal
const EXTRA: Record<PlanoPago, { equivale?: string; economia?: string; destaque?: string }> = {
  mensal: { destaque: "Mais flexível" },
  trimestral: { equivale: "Equivale a R$ 53,30 por mês", economia: "Economia de R$ 19,80 por trimestre (11%)" },
  anual: { equivale: "Equivale a cerca de R$ 49,99 por mês", economia: "Economia de R$ 118,90 por ano (≈16%)", destaque: "Melhor economia" },
};

export default async function Page({ searchParams }: PageProps<"/painel/assinatura">) {
  const u = await usuarioOuLogin();
  const gestor = u.papel === "dono" || u.papel === "admin";
  const sp = await searchParams;

  // volta do checkout: confere na AbacatePay (o webhook também faz isso; a conferência é idempotente)
  let retorno: StatusCobranca | "erro" | null = null;
  if (typeof sp.cobranca === "string" && (await cobrancaDaEmpresa(u.empresa_id, sp.cobranca))) {
    retorno = await sincronizarCobranca(sp.cobranca).catch((e: unknown) => {
      log.erro("[assinatura] conferência na volta do checkout", e);
      return "erro" as const;
    });
  } else if (gestor && pendenciasConfiguracao().length === 0) {
    await conferirPendentes(u.empresa_id); // caso algum webhook tenha se perdido
  }

  const [s, cobrancas] = await Promise.all([situacaoAssinatura(u.empresa_id), gestor ? cobrancasSistema(u.empresa_id) : []]);
  const pendencias = pendenciasConfiguracao();
  const pronto = pendencias.length === 0;
  const pago = s.plano !== "gratuito";
  const venceu = !pago && s.validoAte !== null && s.origem === "pagamento";
  const uso = Math.min(100, Math.round((s.clientes / LIMITE_GRATUITO) * 100));

  return (
    <>
      <Cabecalho
        titulo="Assinatura do Agendou"
        descricao="O plano que a sua barbearia usa no sistema. Não confundir com os planos que você vende aos seus clientes (menu Planos)."
      />

      {retorno && (
        <div
          role="status"
          className={`mb-6 rounded-xl border p-4 text-sm ${
            retorno === "pago" ? "border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.07] text-[#7ee2b0]" : "border-[#ffb347]/30 bg-[#ffb347]/[0.07] text-[#ffcf8a]"
          }`}
        >
          {retorno === "pago" && `Pagamento confirmado. Plano ${NOME[s.plano]} liberado até ${data(s.validoAte)}.`}
          {retorno === "pendente" && "Ainda não recebemos a confirmação do pagamento. Se você pagou por Pix, ela costuma chegar em instantes: atualize esta página."}
          {(retorno === "expirado" || retorno === "cancelado") && "Este pagamento não foi concluído. Você pode gerar um novo abaixo."}
          {retorno === "estornado" && "Este pagamento foi estornado."}
          {retorno === "erro" && "Não conseguimos conferir o pagamento agora. Atualize a página em alguns instantes."}
        </div>
      )}

      <section className="card mb-6 p-5 md:p-6" aria-labelledby="titulo-plano-atual">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs muted">Plano atual</p>
            <h2 id="titulo-plano-atual" className="mt-1 text-2xl font-semibold tracking-tight">
              {NOME[s.plano]}
              {pago && s.origem === "cortesia" && <span className="badge badge-neutro ml-3 align-middle text-xs">Cortesia</span>}
            </h2>
            <p className="mt-1 text-sm muted">
              {pago
                ? `Válido até ${data(s.validoAte)}. Não há renovação automática: renove aqui antes de vencer.`
                : venceu
                  ? `Seu plano pago venceu em ${data(s.validoAte)} e a barbearia voltou ao Gratuito. Nenhum dado foi apagado.`
                  : `Até ${LIMITE_GRATUITO} clientes cadastrados, com todos os recursos do sistema.`}
            </p>
          </div>
          <div className="min-w-[220px]">
            <p className="text-xs muted">Clientes cadastrados</p>
            <p className="mt-1 text-2xl font-semibold num">
              {s.clientes}
              <span className="text-base font-normal muted">{s.limite === null ? " · sem limite" : ` de ${s.limite}`}</span>
            </p>
            {s.limite !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                <div className={`h-full rounded-full ${uso >= 100 ? "bg-[#ff4d5a]" : "bg-[var(--coral)]"}`} style={{ width: `${uso}%` }} />
              </div>
            )}
            {s.limite !== null && s.clientes >= s.limite && (
              <p className="mt-2 text-xs text-[#ffcf8a]">Limite atingido: novos clientes (no painel, na importação e pelo link de agendamento) ficam bloqueados até você assinar.</p>
            )}
          </div>
        </div>
      </section>

      {!pronto && gestor && (
        <div className="mb-6 rounded-xl border border-[#ffb347]/30 bg-[#ffb347]/[0.07] p-4 text-sm text-[#ffcf8a]">
          O pagamento online ainda não está configurado nesta instalação.
          {(process.env.NODE_ENV !== "production" || process.env.MODO_DEMO === "1") && (
            <span className="mt-1 block mono text-xs">Faltam: {pendencias.join(", ")}</span>
          )}
        </div>
      )}

      <section aria-label="Planos pagos" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(Object.keys(PLANOS_SISTEMA) as PlanoPago[]).map((k) => {
          const p = PLANOS_SISTEMA[k];
          const x = EXTRA[k];
          return (
            <article key={k} className={`card relative flex flex-col p-5 ${k === "anual" ? "border-[var(--coral)]/40" : ""}`}>
              {x.destaque && <span className="badge badge-sem-ponto absolute -top-3 left-5 bg-[#17191c] text-[11px]">{x.destaque}</span>}
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--coral)]">{p.nome}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight num">{reais(p.centavos)}</p>
              <p className="text-sm muted">cobrado {p.periodo}</p>
              <p className="mt-2 min-h-[20px] text-xs faint">{x.equivale}</p>
              {x.economia && <p className="mt-2 self-start rounded-full bg-[#3ecf8e]/10 px-2.5 py-1 text-xs text-[#7ee2b0]">{x.economia}</p>}
              <ul className="mt-4 mb-5 grid flex-1 content-start gap-1.5 text-sm muted">
                <li>✓ Sem o limite de {LIMITE_GRATUITO} clientes</li>
                <li>✓ Todos os recursos do sistema</li>
                <li>
                  ✓ Libera {p.meses === 1 ? "1 mês" : `${p.meses} meses`}
                  {pago ? ", somados ao fim do período atual" : ""}
                </li>
              </ul>
              {gestor ? (
                <BotaoPagar plano={k} rotulo={`${pago ? "Renovar" : "Assinar"}: pagar ${reais(p.centavos)}`} destaque={k === "anual"} desabilitado={!pronto} />
              ) : (
                <p className="text-xs faint">Só o dono ou um administrador pode contratar.</p>
              )}
            </article>
          );
        })}
      </section>
      <p className="mt-3 text-xs faint">
        Pagamento único pelo período escolhido, por Pix ou cartão, no checkout seguro da AbacatePay. Não há cobrança recorrente: perto do vencimento, renove por
        aqui. O plano é liberado assim que a AbacatePay confirma o pagamento.
      </p>

      {gestor && cobrancas.length > 0 && (
        <section className="card mt-8 overflow-x-auto" aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="px-4 pt-4 font-medium">
            Pagamentos
          </h2>
          <table className="tabela mt-2">
            <thead>
              <tr>
                <th>Data</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Período liberado</th>
              </tr>
            </thead>
            <tbody>
              {cobrancas.map((c) => (
                <tr key={c.id}>
                  <td className="num">{data(c.criado_em)}</td>
                  <td>
                    {NOME[c.plano]}
                    {c.dev_mode && <span className="badge badge-neutro ml-2 text-[11px]">Teste</span>}
                  </td>
                  <td className="num">{reais(c.valor_centavos)}</td>
                  <td>
                    <span className={`badge ${STATUS[c.status][0]}`}>{STATUS[c.status][1]}</span>
                  </td>
                  <td className="num">{c.periodo_inicio ? `${data(c.periodo_inicio)} a ${data(c.periodo_fim)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
