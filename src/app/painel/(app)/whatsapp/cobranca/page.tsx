import Link from "next/link";
import { usuarioOuLogin } from "@/lib/painel";
import { conexaoPublica } from "@/lib/whatsapp";
import { configPix } from "@/lib/repositorios/cobrancas-mensalidade";
import { Cabecalho, Campo, Form, inp } from "../../../Form";
import Copiar from "../../../componentes/Copiar";
import { salvarPixAcao } from "../../../acoes-cobrancas";

export const metadata = { title: "Cobrança automática · WhatsApp" };

const TIPOS_PIX = [
  { valor: "cpf", rotulo: "CPF" },
  { valor: "cnpj", rotulo: "CNPJ" },
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "aleatoria", rotulo: "Chave aleatória" },
] as const;

const TEXTO_MODELO =
  "Olá, {{1}}! A mensalidade {{2}} no valor de {{3}} vence em {{4}}. Para pagar via Pix, copie o código abaixo:\n{{5}}";

export default async function Page() {
  const u = await usuarioOuLogin();
  const gestor = u.papel === "dono" || u.papel === "admin";
  const [c, pix] = await Promise.all([conexaoPublica(u.empresa_id), configPix(u.empresa_id)]);
  const card = "card p-4 md:p-5";

  const cobrancasAtivas = !!(c as unknown as Record<string, unknown>)?.cobrancas_ativas;
  const modeloCobranca = (c as unknown as Record<string, unknown>)?.modelo_cobranca as string | null;
  const diasAntes = ((c as unknown as Record<string, unknown>)?.cobranca_dias_antes as number) ?? 3;
  const diasDepois = ((c as unknown as Record<string, unknown>)?.cobranca_dias_depois as number) ?? 3;

  return (
    <>
      <div className="mb-4">
        <Link href="/painel/whatsapp" className="inline-flex items-center gap-1 text-sm muted hover:text-white">
          ← WhatsApp
        </Link>
      </div>
      <Cabecalho
        titulo="Cobrança automática"
        descricao="Configure a chave Pix e a régua de cobrança. A barbearia enviará mensagens com Pix copia-e-cola antes e após o vencimento de cada mensalidade, direto pelo número conectado."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ── Chave Pix ─────────────────────────────────────────────── */}
        <section className={card} aria-labelledby="titulo-pix">
          <h2 id="titulo-pix" className="mb-1 font-medium">Chave Pix</h2>
          <p className="mb-4 text-xs muted">
            O Pix copia-e-cola é gerado na hora para cada mensagem. Informe a chave da barbearia.
          </p>

          {!gestor ? (
            <p className="text-sm muted">Só o dono ou um administrador pode configurar a chave Pix.</p>
          ) : (
            <Form action={salvarPixAcao} className="grid gap-3">
              <Campo rotulo="Tipo de chave">
                <select name="pix_tipo" defaultValue={pix?.tipo ?? "aleatoria"} className={inp}>
                  {TIPOS_PIX.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Chave Pix">
                <input
                  name="pix_chave"
                  defaultValue={pix?.chave ?? ""}
                  required
                  className={inp}
                  placeholder="Digite a chave"
                  autoComplete="off"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Nome do recebedor (máx. 25 car.)">
                  <input
                    name="pix_recebedor"
                    defaultValue={pix?.recebedor ?? ""}
                    required
                    maxLength={25}
                    className={inp}
                    placeholder="Barbearia do João"
                  />
                </Campo>
                <Campo rotulo="Cidade (máx. 15 car.)">
                  <input
                    name="pix_cidade"
                    defaultValue={pix?.cidade ?? ""}
                    required
                    maxLength={15}
                    className={inp}
                    placeholder="São Paulo"
                  />
                </Campo>
              </div>
            </Form>
          )}

          {pix && (
            <p className="mt-3 text-xs faint">
              Salva: <span className="mono">{pix.chave}</span> ·{" "}
              {TIPOS_PIX.find((t) => t.valor === pix.tipo)?.rotulo} · recebedor: {pix.recebedor} · cidade: {pix.cidade}
            </p>
          )}
        </section>

        {/* ── Régua de envio ────────────────────────────────────────── */}
        <section className={card} aria-labelledby="titulo-regua">
          <h2 id="titulo-regua" className="mb-1 font-medium">Régua de envio</h2>
          <p className="mb-4 text-xs muted">
            Dias antes/depois e toggle de ativação são configurados em{" "}
            <Link href="/painel/whatsapp" className="underline underline-offset-2">
              WhatsApp → Mensagens automáticas
            </Link>
            .
          </p>

          {!c ? (
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm muted">
              <Link href="/painel/whatsapp" className="underline underline-offset-2">
                Conecte um número
              </Link>{" "}
              para ativar a régua.
            </div>
          ) : (
            <div className="grid gap-2 text-sm">
              {!cobrancasAtivas && !pix && (
                <div
                  role="alert"
                  className="mb-1 rounded-lg border border-[#ffb347]/30 bg-[#ffb347]/[0.07] p-3 text-xs text-[#ffcf8a]"
                >
                  Configure a chave Pix acima para poder ativar a régua.
                </div>
              )}
              <dl className="grid gap-2">
                {[
                  ["Régua ativa", cobrancasAtivas ? "Sim" : "Não", cobrancasAtivas],
                  ["Modelo WhatsApp", modeloCobranca ?? "—", !!modeloCobranca],
                  ["Dias antes do vencimento", String(diasAntes), true],
                  ["Dias após o vencimento", String(diasDepois), true],
                ].map(([rotulo, valor, ok]) => (
                  <div
                    key={rotulo as string}
                    className="flex items-center justify-between rounded-lg border border-white/[0.08] p-3"
                  >
                    <dt className="muted">{rotulo}</dt>
                    <dd className={ok ? (rotulo === "Régua ativa" && !cobrancasAtivas ? "muted" : "num") : "muted"}>
                      {valor}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link href="/painel/whatsapp" className="btn btn-sutil mt-1 w-fit text-sm">
                Editar configurações →
              </Link>
            </div>
          )}
        </section>

        {/* ── Modelo de mensagem ────────────────────────────────────── */}
        <section className={`${card} xl:col-span-2`} aria-labelledby="titulo-modelo">
          <h2 id="titulo-modelo" className="mb-2 font-medium">Modelo de mensagem</h2>
          <p className="mb-3 text-xs muted">
            Crie o modelo{" "}
            <span className="mono">cobranca_mensalidade</span> no WhatsApp Manager (categoria{" "}
            <b>Utilidade</b>, idioma Português BR) e informe o nome em{" "}
            <Link href="/painel/whatsapp" className="underline underline-offset-2">
              WhatsApp → Mensagens automáticas
            </Link>
            . O modelo precisa de exatamente 5 variáveis.
          </p>
          <div className="relative rounded-lg border border-white/[0.08] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b className="text-sm font-medium">Texto sugerido</b>
                <div className="mt-0.5 text-xs muted">
                  nome: <span className="mono">cobranca_mensalidade</span> · categoria: Utilidade · idioma: Português (BR)
                </div>
              </div>
              <Copiar texto={TEXTO_MODELO} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] suave">{TEXTO_MODELO}</p>
          </div>
          <p className="mt-2 text-xs faint">
            Variáveis: {"{{1}}"} primeiro nome · {"{{2}}"} plano · {"{{3}}"} valor · {"{{4}}"} data de vencimento · {"{{5}}"} Pix copia-e-cola
          </p>
        </section>
      </div>
    </>
  );
}
