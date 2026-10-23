import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { origemApp } from "@/lib/origem";
import { formatarDataHora } from "@/lib/tempo";
import { conexaoPublica, criptografiaPronta } from "@/lib/whatsapp";
import { Icone } from "@/components/ui";
import { Cabecalho, Campo, Form, inp } from "../../Form";
import Copiar from "../../componentes/Copiar";
import { conectarWhatsapp, desconectarWhatsapp, enviarTesteWhatsapp, salvarModelosWhatsapp, verificarWhatsapp } from "../../acoes-whatsapp";

export const metadata = { title: "WhatsApp" };

const MODELOS = [
  {
    nome: "confirmacao_agendamento",
    titulo: "Confirmação de agendamento",
    categoria: "Utilidade",
    texto:
      "Olá, {{1}}! Seu horário na {{2}} está confirmado: {{3}} com {{4}}, {{5}}. Para remarcar ou cancelar, acesse {{6}} Até breve!",
  },
  {
    nome: "lembrete_agendamento",
    titulo: "Lembrete",
    categoria: "Utilidade",
    texto: "Lembrete: {{1}}, seu horário na {{2}} está chegando: {{3}} com {{4}}, {{5}}. Precisa remarcar? Acesse {{6}} Até já!",
  },
  {
    nome: "codigo_verificacao",
    titulo: "Código de verificação (histórico do cliente)",
    categoria: "Autenticação · botão “Copiar código”",
    texto: "O texto é gerado pela Meta: “{{1}} é seu código de verificação.”",
  },
];

export default async function Page() {
  const u = await usuarioOuLogin();
  const gestor = u.papel === "dono" || u.papel === "admin";
  const [c, origem, [stats]] = await Promise.all([
    conexaoPublica(u.empresa_id),
    origemApp(),
    q<{ aceitas: number; entregues: number; falhas: number; nao_enviadas: number }>(
      `select count(*) filter (where status in ('aceito','enviado','entregue','lido'))::int as aceitas,
              count(*) filter (where status in ('entregue','lido'))::int as entregues,
              count(*) filter (where status = 'falhou')::int as falhas,
              count(*) filter (where status = 'nao_enviado')::int as nao_enviadas
       from notificacao where empresa_id = $1 and criado_em > now() - interval '30 days'`,
      [u.empresa_id],
    ),
  ]);
  const servidorPronto = criptografiaPronta();
  const webhookPronto = !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && !!(process.env.WHATSAPP_APP_SECRET || c?.tem_app_secret);
  const urlWebhook = `${origem}/api/whatsapp/webhook`;
  const card = "card p-4 md:p-5";

  const estado = !c
    ? { classe: "badge-warn", rotulo: "Não conectado", texto: "Nenhuma mensagem automática é enviada. Use o envio manual pelo seu WhatsApp." }
    : c.status === "erro"
      ? { classe: "badge-danger", rotulo: "Erro na conexão", texto: c.ultimo_erro ?? "A Meta recusou as credenciais. Reconecte o número." }
      : !c.modelo_confirmacao
        ? { classe: "badge-warn", rotulo: "Conectado · falta o modelo", texto: "Número conectado, mas sem modelo de confirmação aprovado: nada é enviado automaticamente ainda." }
        : { classe: "badge-ok", rotulo: "Conectado", texto: "Confirmações saem automaticamente por este número a cada novo agendamento." };

  return (
    <>
      <Cabecalho
        titulo="WhatsApp"
        descricao="Conecte o número da barbearia na API oficial do WhatsApp (Meta) para enviar confirmações e lembretes automáticos aos seus clientes. Cada barbearia envia só pelo próprio número."
      />

      <section className={`${card} mb-6`} aria-labelledby="titulo-status">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="titulo-status" className="sr-only">
              Status da integração
            </h2>
            <span className={`badge ${estado.classe}`}>{estado.rotulo}</span>
            {c && (
              <p className="mt-3 text-lg font-semibold">
                {c.numero_exibicao ?? c.phone_number_id}
                {c.nome_verificado && <span className="ml-2 text-sm font-normal muted">{c.nome_verificado}</span>}
              </p>
            )}
            <p className="mt-1 max-w-2xl text-sm muted">{estado.texto}</p>
            {c && (
              <p className="mt-2 text-xs faint">
                Verificado em {formatarDataHora(c.verificado_em)} ·{" "}
                {c.ultimo_webhook_em ? `último status de entrega recebido em ${formatarDataHora(c.ultimo_webhook_em)}` : "nenhum status de entrega recebido ainda"}
              </p>
            )}
          </div>
          {c && gestor && (
            <Form action={verificarWhatsapp} botao="Testar conexão" className="grid gap-2">
              {null}
            </Form>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {[
            ["Aceitas pela Meta", stats.aceitas],
            ["Entregues/lidas", stats.entregues],
            ["Falharam", stats.falhas],
            ["Não enviadas", stats.nao_enviadas],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/[0.08] p-3">
              <dt className="text-xs muted">{k}</dt>
              <dd className="num text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs faint">
          Últimos 30 dias.{" "}
          <Link href="/painel/notificacoes" className="underline underline-offset-2">
            Ver mensagens
          </Link>
        </p>
      </section>

      {!servidorPronto && (
        <div role="alert" className="mb-6 rounded-xl border border-[#ffb347]/30 bg-[#ffb347]/[0.07] p-4 text-sm text-[#ffcf8a]">
          <b className="font-medium">Servidor ainda não preparado.</b> Para guardar o token com segurança, o administrador da plataforma precisa definir a variável{" "}
          <code>WHATSAPP_CHAVE_CRIPTO</code> (texto aleatório com 32+ caracteres). Até lá, não é possível conectar números.
        </div>
      )}
      {!gestor && <p className="mb-6 text-sm muted">Só o dono ou um administrador pode alterar esta integração.</p>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={card} aria-labelledby="titulo-conectar">
          <h2 id="titulo-conectar" className="font-medium">
            {c ? "Credenciais do número" : "1. Conectar o número"}
          </h2>
          <p className="mb-4 text-xs muted">
            Copie do painel da Meta (developers.facebook.com → seu app → WhatsApp → Configuração da API). O token é verificado na hora, guardado
            criptografado e nunca é exibido de volta.
          </p>
          <Form action={conectarWhatsapp} botao={c ? "Salvar e verificar" : "Conectar e verificar"} className="grid gap-3">
            <Campo rotulo="Phone Number ID (identificação do número)">
              <input name="phone_number_id" required inputMode="numeric" defaultValue={c?.phone_number_id ?? ""} className={inp} autoComplete="off" />
            </Campo>
            <Campo rotulo="WABA ID (identificação da conta do WhatsApp Business)">
              <input name="waba_id" required inputMode="numeric" defaultValue={c?.waba_id ?? ""} className={inp} autoComplete="off" />
            </Campo>
            <Campo rotulo={c ? "Token de acesso (deixe em branco para manter o atual)" : "Token de acesso permanente (usuário do sistema)"}>
              <input name="token" type="password" required={!c} placeholder={c ? "•••••••• salvo" : "EAA…"} className={inp} autoComplete="off" spellCheck={false} />
            </Campo>
            <details className="text-sm">
              <summary className="cursor-pointer muted">Usa um app próprio da Meta? (opcional)</summary>
              <div className="mt-2">
                <Campo rotulo={c?.tem_app_secret ? "App Secret (salvo; preencha só para trocar)" : "App Secret do seu app"}>
                  <input name="app_secret" type="password" className={inp} autoComplete="off" spellCheck={false} />
                </Campo>
                <p className="mt-1 text-xs faint">Só é necessário se o número estiver em um app da Meta diferente do app da plataforma. Serve para validar os avisos de entrega.</p>
              </div>
            </details>
          </Form>
        </section>

        <section className={card} aria-labelledby="titulo-modelos">
          <h2 id="titulo-modelos" className="font-medium">
            2. Mensagens automáticas
          </h2>
          <p className="mb-4 text-xs muted">
            Para falar primeiro com o cliente, o WhatsApp exige <b>modelos aprovados</b> pela Meta. Crie-os no WhatsApp Manager (textos sugeridos abaixo) e
            informe os nomes aqui; conferimos se estão aprovados.
          </p>
          {c ? (
            <Form action={salvarModelosWhatsapp} className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Campo rotulo="Modelo de confirmação">
                  <input name="modelo_confirmacao" defaultValue={c.modelo_confirmacao ?? ""} placeholder="confirmacao_agendamento" className={inp} />
                </Campo>
                <Campo rotulo="Modelo de lembrete">
                  <input name="modelo_lembrete" defaultValue={c.modelo_lembrete ?? ""} placeholder="lembrete_agendamento" className={inp} />
                </Campo>
                <Campo rotulo="Modelo de código de verificação">
                  <input name="modelo_codigo" defaultValue={c.modelo_codigo ?? ""} placeholder="codigo_verificacao" className={inp} />
                </Campo>
                <Campo rotulo="Idioma dos modelos">
                  <input name="idioma" defaultValue={c.idioma} className={inp} />
                </Campo>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="lembretes_ativos" defaultChecked={c.lembretes_ativos} /> Enviar lembrete automático{" "}
                {process.env.LEMBRETE_HORAS_ANTES ?? 3}h antes do horário
              </label>
            </Form>
          ) : (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm muted">Conecte o número primeiro.</p>
          )}
          <ul className="mt-5 grid gap-3">
            {MODELOS.map((m) => (
              <li key={m.nome} className="rounded-lg border border-white/[0.08] p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <b className="font-medium">{m.titulo}</b>
                    <div className="text-xs muted">
                      nome: <span className="mono">{m.nome}</span> · categoria: {m.categoria} · idioma: Português (BR)
                    </div>
                  </div>
                  {!m.texto.startsWith("O texto") && <Copiar texto={m.texto} />}
                </div>
                <p className="mt-2 text-[13px] suave">{m.texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs faint">
            Variáveis: {"{{1}}"} primeiro nome · {"{{2}}"} barbearia · {"{{3}}"} serviço · {"{{4}}"} profissional · {"{{5}}"} data e hora · {"{{6}}"} link para
            remarcar/cancelar{process.env.APP_URL ? "" : " (defina APP_URL para o link sair preenchido)"}.
          </p>
        </section>

        <section className={card} aria-labelledby="titulo-teste">
          <h2 id="titulo-teste" className="font-medium">
            3. Primeiro envio (teste)
          </h2>
          <p className="mb-4 text-xs muted">
            Envia o modelo de confirmação com dados de exemplo (sem modelo configurado, usa o <span className="mono">hello_world</span> que a Meta cria em
            toda conta nova). Enquanto o app da Meta estiver em modo de desenvolvimento, só números cadastrados como destinatários de teste recebem.
          </p>
          {c ? (
            <Form action={enviarTesteWhatsapp} botao="Enviar teste" className="grid gap-3">
              <Campo rotulo="Celular que vai receber (com DDD)">
                <input name="telefone" required inputMode="tel" placeholder="(11) 91234-5678" className={inp} />
              </Campo>
            </Form>
          ) : (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm muted">Conecte o número primeiro.</p>
          )}
        </section>

        <section className={card} aria-labelledby="titulo-webhook">
          <h2 id="titulo-webhook" className="font-medium">
            Avisos de entrega (webhook)
          </h2>
          <p className="mb-3 text-xs muted">
            É assim que sabemos se a mensagem foi <b>enviada, entregue, lida ou falhou</b>. Sem isso, o máximo que mostramos é “aceita pela Meta”.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] p-2 pl-3 text-sm">
            <span className="mono min-w-0 flex-1 truncate">{urlWebhook}</span>
            <Copiar texto={urlWebhook} />
          </div>
          <ul className="mt-3 grid gap-1 text-sm">
            <li className="flex items-center gap-2">
              <Icone nome={process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? "check" : "x"} tamanho={14} /> Token de verificação do webhook{" "}
              {process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? "definido no servidor" : "não definido (WHATSAPP_WEBHOOK_VERIFY_TOKEN)"}
            </li>
            <li className="flex items-center gap-2">
              <Icone nome={webhookPronto ? "check" : "x"} tamanho={14} /> App Secret para validar assinaturas{" "}
              {webhookPronto ? "disponível" : "não definido (WHATSAPP_APP_SECRET)"}
            </li>
          </ul>
          <p className="mt-2 text-xs faint">No app da Meta: WhatsApp → Configuração → Webhook. Assine o campo “messages”.</p>
        </section>

        <section className={`${card} xl:col-span-2`} aria-labelledby="titulo-manual">
          <h2 id="titulo-manual" className="font-medium">
            Sem integração? Envio manual
          </h2>
          <p className="mt-1 text-sm muted">
            Mesmo sem conectar, você pode mandar a confirmação pelo seu próprio WhatsApp: na <Link href="/painel/agenda" className="underline underline-offset-2">Agenda</Link>,
            em <Link href="/painel/agendamentos" className="underline underline-offset-2">Agendamentos</Link> e em{" "}
            <Link href="/painel/notificacoes" className="underline underline-offset-2">Notificações</Link> há o botão{" "}
            <span className="inline-flex items-center gap-1 text-[#7ee2b0]">
              <Icone nome="whatsapp" tamanho={13} /> WhatsApp
            </span>{" "}
            que abre a conversa com a mensagem pronta. Na página pública, se a confirmação automática não sair, o cliente vê um botão para avisar a barbearia pelo
            WhatsApp. Esses envios dependem de você (ou do cliente) tocar em “enviar” e não são marcados como enviados no sistema.
          </p>
        </section>
      </div>

      {c && gestor && (
        <section className="mt-6 rounded-xl border border-[#ff4d5a]/25 p-4 md:p-5" aria-labelledby="titulo-desconectar">
          <h2 id="titulo-desconectar" className="font-medium">
            Desconectar número
          </h2>
          <p className="mb-3 text-xs muted">Apaga o token e para todos os envios automáticos. O histórico de mensagens continua em Notificações.</p>
          <Form action={desconectarWhatsapp} botao="Desconectar" className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmo" required /> Confirmo que quero desconectar
            </label>
          </Form>
        </section>
      )}
    </>
  );
}
