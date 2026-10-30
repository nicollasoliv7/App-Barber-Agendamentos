# Integração com o WhatsApp (API oficial da Meta)

O Agendou envia mensagens pela **WhatsApp Cloud API**, a API oficial da Meta. Cada barbearia conecta o **próprio número**, e as mensagens dela só saem por esse número.

## O que funciona

| Mensagem | Quando sai | Requisito |
|---|---|---|
| Confirmação | Ao criar o agendamento confirmado (ou quando o Pix é pago) | Modelo de confirmação aprovado |
| Lembrete | `LEMBRETE_HORAS_ANTES` horas antes (padrão 3), uma vez só | Modelo de lembrete aprovado + "Enviar lembrete automático" ligado |
| Código de verificação | Quando o cliente entra em "Meus agendamentos" | Modelo de autenticação aprovado |
| Cobrança de mensalidade | Régua automática: X dias antes do vencimento, no vencimento e Y dias depois | Modelo de cobrança aprovado + cobrancas ativas + chave Pix configurada |
| Teste | Botão "Enviar teste" no painel | Número conectado (usa o `hello_world` se não houver modelo) |
| Cancelamento, remarcação, aviso à barbearia | Ficam registrados em Notificações, mas **não são enviados** automaticamente | Ainda não têm modelo próprio |

**Sem integração**, nada é enviado e nada é marcado como enviado. Nesse caso:
- **Painel** (Agenda, Agendamentos e Notificações): o botão **WhatsApp** abre o WhatsApp do barbeiro com a mensagem pronta.
- **Página pública**: depois de agendar, o cliente vê o botão **"Avisar a barbearia pelo WhatsApp"**.

### Status de cada mensagem (tela Notificações)

| Status | Significado |
|---|---|
| Na fila | Aguardando envio |
| Não enviada | Sem conexão, conexão com erro, ou sem modelo para esse tipo de mensagem |
| Aceita pela Meta | A API aceitou o pedido; a entrega ainda **não** foi confirmada |
| Enviada / Entregue / Lida | Confirmado pelo webhook **assinado** da Meta |
| Falhou | A Meta recusou ou não conseguiu entregar; o motivo aparece |

## Segurança

- **Token:** o token de acesso (e o App Secret, se houver) é guardado **criptografado** (AES-256-GCM). A chave fica em `WHATSAPP_CHAVE_CRIPTO`. Ele é lido só no servidor e nunca volta para o navegador; o campo mostra apenas "salvo".
- **Número único:** um `phone_number_id` só pode estar ligado a **uma** barbearia (restrição única no banco). Ao conectar, o sistema confere na Meta se o token vale e se o número pertence à WABA informada.
- **Isolamento no envio:** cada mensagem sai pelo número da empresa dona dela. Não existe número "global" da plataforma.
- **Webhook:** só é processado com a assinatura `X-Hub-Signature-256` válida. Um evento só altera mensagens da barbearia dona do número que o gerou, e o status nunca "volta" (lido → entregue fora de ordem).
- **Permissões:** só o dono ou um administrador conectam, desconectam ou alteram a integração.
- **Código de verificação:** as variáveis com o código são apagadas do banco logo após o envio.

## Passo a passo para ativar

### Parte A — uma vez, pela plataforma (você, dono do SaaS)

1. **App da Meta:** crie uma conta em <https://developers.facebook.com>. Crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. **Variáveis do servidor:** defina no servidor (Vercel → Settings → Environment Variables, ou `.env.local`):

   | Variável | Valor |
   |---|---|
   | `WHATSAPP_CHAVE_CRIPTO` | Texto aleatório com 32+ caracteres (ex.: `openssl rand -base64 48`). **Não troque depois**: os tokens salvos ficariam ilegíveis e seria preciso reconectar. |
   | `WHATSAPP_APP_SECRET` | App da Meta → Configurações → Básico → **Chave secreta do app** |
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Um texto qualquer criado por você (ex.: `openssl rand -hex 16`) |
   | `APP_URL` | Endereço público do app (ex.: `https://seuapp.vercel.app`), para o link de remarcar/cancelar |
   | `CRON_SECRET` | Necessário para os lembretes em serverless (veja abaixo) |

3. **Webhook:** no app da Meta, vá em **WhatsApp → Configuração → Webhook**.
   - **URL de retorno:** `https://SEU-APP/api/whatsapp/webhook`. A URL também aparece no painel, em WhatsApp.
   - **Token de verificação:** o mesmo de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Clique em **Verificar e salvar** e depois **assine o campo `messages`**.
   - O app precisa estar publicado (HTTPS). `localhost` não recebe webhooks.

### Parte B — por barbearia (no painel → WhatsApp)

1. **Número:** no app da Meta (WhatsApp → Configuração da API), adicione e verifique o número da barbearia. O número **não pode** estar em uso no aplicativo WhatsApp comum. Use um chip novo ou migre o número.
2. **Token permanente:** em business.facebook.com → Configurações → **Usuários do sistema**, crie um usuário do sistema (Admin). Dê acesso ao app e à conta do WhatsApp, e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. O token temporário de 24 h serve só para testar.
3. **IDs:** copie o **Phone Number ID** e o **WhatsApp Business Account ID (WABA ID)** da tela "Configuração da API".
4. **Conectar:** no painel → **WhatsApp → Conectar o número**, cole os três dados e clique em **Conectar e verificar**.
5. **Modelos:** no **WhatsApp Manager** → Modelos de mensagem, crie os modelos com os textos sugeridos na tela (idioma Português (BR)):
   - `confirmacao_agendamento` (Utilidade)
   - `lembrete_agendamento` (Utilidade)
   - `codigo_verificacao` (Autenticação, botão "Copiar código")
   - `cobranca_mensalidade` (Utilidade, 5 variáveis — veja abaixo)

   A aprovação costuma levar de minutos a algumas horas. Depois, informe os nomes no painel e clique em **Salvar**: o sistema confere se estão aprovados.
6. **Primeiro envio:** use **3. Primeiro envio (teste)** com o seu celular. Enquanto o app da Meta estiver em modo de desenvolvimento, cadastre o celular como destinatário de teste (Configuração da API → "Para"). Senão a Meta responde *"número fora da lista de teste"* (código 131030), e o painel mostra exatamente isso.
7. **Confirmação:** faça um agendamento na página pública. Em **Notificações**, a confirmação deve passar de "Aceita pela Meta" para "Entregue" e "Lida".

### Variáveis dos modelos (ordem fixa)

**Confirmação e lembrete de agendamento** (`confirmacao_agendamento`, `lembrete_agendamento`):

`{{1}}` primeiro nome · `{{2}}` barbearia · `{{3}}` serviço · `{{4}}` profissional · `{{5}}` data e hora · `{{6}}` link para remarcar/cancelar

Modelos com menos variáveis também funcionam: o sistema conta as variáveis do modelo aprovado e envia só as primeiras. O limite é 6.

**Cobrança de mensalidade** (`cobranca_mensalidade`):

`{{1}}` primeiro nome · `{{2}}` nome do plano · `{{3}}` valor (ex.: `R$ 89,90`) · `{{4}}` data de vencimento (ex.: `31/12/2026`) · `{{5}}` Pix copia-e-cola (código EMV/BR Code)

Texto sugerido para criar o modelo no WhatsApp Manager:

```
Olá {{1}}, a mensalidade do plano "{{2}}" ({{3}}) vence em {{4}}.
Pague com Pix: {{5}}
```

O Pix copia-e-cola é gerado dinamicamente (EMV BR Code estático, CRC16-CCITT) com a chave Pix configurada no painel → **WhatsApp → Cobrança automática**.

### Cobrança automática de mensalidade — régua configurável (R76–R87)

A régua envia mensagens automáticas em três etapas: **antes** do vencimento, **no** vencimento e **depois**. Os dias são configuráveis por barbearia (padrão: 3 antes e 3 depois).

**Para ativar:**
1. Cadastre a chave Pix da barbearia em **painel → WhatsApp → Cobrança automática** (tipo, chave, nome do recebedor, cidade).
2. Crie e aprove o modelo `cobranca_mensalidade` no WhatsApp Manager.
3. Em **painel → WhatsApp**, informe o nome do modelo no campo "Modelo de cobrança", ajuste os dias da régua e marque "Cobranças ativas".

**Comportamento da régua:**
- Cada etapa (antes / vencimento / depois) é enviada **uma única vez** por mensalidade — não há duplicidade mesmo que o cron rode várias vezes.
- O barbeiro pode **pausar** a régua para um assinante específico na ficha do cliente.
- Se o cliente responder **PARAR** (ou `parar`, case-insensitive), o opt-out é registrado automaticamente e a régua para para aquele cliente. O barbeiro pode reativar na ficha.
- A régua só envia entre **9h e 20h** no fuso horário da empresa.
- Quando a mensalidade é paga ou a assinatura é cancelada, a régua para automaticamente.
- **"Cobrar agora"**: botão na ficha do cliente para envio manual imediato. Limitado a 1 disparo por mensalidade por dia.

### Rotinas automáticas em produção (Vercel)

As rotinas internas ficam desligadas em serverless. Use um serviço de cron externo (ex.: cron-job.org, EasyCron) para chamar ambas as rotas com o cabeçalho `x-cron-secret: <CRON_SECRET>`:

| Rota | Frequência sugerida | O que faz |
|---|---|---|
| `POST /api/cron/lembretes` | A cada 10–30 min | Lembretes de agendamento (R14b) |
| `POST /api/cron/cobrancas` | A cada 30–60 min | Régua de cobrança de mensalidade (R84) |

O plano gratuito da Vercel só permite cron diário — as rotinas internas (`instrumentation.ts`) cobrem o ambiente local e self-hosted, mas em Vercel Hobby é preciso o cron externo para ambas.

## Custos e limites (Meta)

- **Cobrança:** a Meta cobra por mensagem de modelo entregue, com valor por categoria e país. Mensagens de Utilidade enviadas dentro de uma conversa aberta pelo cliente podem ser gratuitas. Confira a tabela atual em <https://developers.facebook.com/docs/whatsapp/pricing>.
- **Limites de envio:** números novos começam com limite diário de conversas iniciadas pela empresa, que sobe com o uso e a boa qualidade.

## Próximo passo para escalar

Hoje, cada barbearia cola as próprias credenciais. Para muitas barbearias, o caminho oficial é o **Embedded Signup** da Meta: a barbearia clica em "Conectar com o Facebook" e autoriza, sem copiar IDs nem tokens. Isso exige que o app da plataforma seja verificado como **Tech Provider**. A tabela `whatsapp_conexao` já guarda o que esse fluxo produz (phone_number_id, waba_id e token), então a mudança fica só na tela de conexão.

## Testes

`e2e/whatsapp.mjs` roda contra um **mock da Graph API** (`e2e/mock-meta.mjs`): nada sai para a Meta. São 42 verificações:
- sem integração;
- conexão, com token errado, WABA errada e número de outra barbearia;
- modelos pendentes e aprovados;
- envio pelo número certo, com as variáveis certas;
- webhook (verificação, sem assinatura, assinatura falsa, fora de ordem, evento de outro número);
- teste com erro da Meta, código com botão e lembretes;
- token revogado e reconexão;
- desconexão.

`e2e/cobrancas.mjs` testa a régua de cobrança de mensalidade:
- segurança do endpoint (`/api/cron/cobrancas`);
- skip quando sem `cobrancas_ativas` ou sem chave Pix;
- configuração via painel (Pix + modelo + régua);
- opt-out "PARAR" (case-insensitive) + reativação pelo painel;
- pausa e retomada por assinante;
- "Cobrar agora" + idempotência (1 disparo/mensalidade/dia);
- CRC16 do Pix copia-e-cola (param[5]);
- isolamento entre barbearias.
