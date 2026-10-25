# Pagamento da assinatura do Agendou pela AbacatePay

A barbearia paga o uso do Agendou pela **AbacatePay (API v2)**, num checkout hospedado com Pix ou cartão. Regras completas em `REGRAS_DE_NEGOCIO.md`, R68–R75.

| Plano | Preço | Libera | Produto na AbacatePay |
|---|---|---|---|
| Gratuito | R$ 0 | sempre, até 15 clientes cadastrados | — |
| Mensal | R$ 59,90 | 1 mês | avulso, `price: 5990` |
| Trimestral | R$ 159,90 | 3 meses | avulso, `price: 15990` |
| Anual | R$ 599,90 | 12 meses | avulso, `price: 59990` |

**Não há renovação automática.** Cada pagamento é avulso e libera um período. O painel avisa 7 dias antes do vencimento. A AbacatePay oferece assinaturas recorrentes (`/v2/subscriptions/create`), mas a documentação hoje é contraditória sobre Pix e não descreve os eventos de renovação, por isso elas não são usadas.

## Fluxo

1. A landing (`https://site-agendou.vercel.app`) leva a `https://app-agendou.vercel.app/cadastro?plano=…`. O cadastro cria a barbearia no **Gratuito** e abre o painel.
2. Plano pago: em **Assinatura**, o dono clica em pagar. O servidor cria uma `cobranca_sistema` e chama `POST /v2/checkouts/create` com o produto do plano, `externalId` = id da cobrança e `completionUrl` = `/painel/assinatura?cobranca=<id>`. A chave fica só no servidor.
3. A AbacatePay avisa em `POST /api/abacatepay/webhook`, e a barbearia volta para a tela de assinatura.
4. Nos dois casos, o servidor consulta `GET /v2/checkouts/get` e **só então** libera o período (R71). Ao abrir a tela de assinatura, cobranças pendentes das últimas 48 h também são conferidas, para o caso de um webhook se perder.

## Configuração (você, dono da plataforma)

### 1. Teste primeiro no Dev Mode

1. No painel da AbacatePay (Dev Mode), crie uma **chave de API de desenvolvimento**.
2. Crie os **3 produtos avulsos** (sem ciclo/recorrência), com os preços exatos da tabela. Se o preço não bater, o app se recusa a abrir o checkout. Anote o `id` público de cada um.
   - Pelo MCP no Claude Code, no seu computador: `claude mcp add --transport http abacatepay https://mcp.abacatepay.com/mcp --header "Authorization: Bearer SUA_CHAVE_DEV"`. Depois peça para criar ou listar os produtos (`createProduct` / `listProducts`).
3. Crie o **webhook** (painel da AbacatePay → Webhooks, ou `createWebhook`):
   - **URL:** `https://app-agendou.vercel.app/api/abacatepay/webhook?webhookSecret=SEU_SEGREDO` (o endereço antigo `app-barber-agendamentos.vercel.app` continua funcionando)
   - **secret:** o mesmo `SEU_SEGREDO`
   - **eventos:** `checkout.completed`, `checkout.refunded`, `checkout.disputed`, `checkout.lost`
4. Na **Vercel → agendou-app → Settings → Environment Variables**, cadastre as variáveis abaixo. Não cole nenhum valor em chat.

| Variável | Valor |
|---|---|
| `ABACATEPAY_API_KEY` | chave da API (Dev Mode para testar) |
| `ABACATEPAY_WEBHOOK_SECRET` | o `SEU_SEGREDO` usado na URL do webhook (ex.: `openssl rand -hex 24`) |
| `ABACATEPAY_WEBHOOK_HMAC_KEY` | a **chave pública da AbacatePay** publicada em https://docs.abacatepay.com/pages/webhooks/security. Não é segredo, mas é obrigatória em produção |
| `ABACATEPAY_PRODUTO_MENSAL` / `_TRIMESTRAL` / `_ANUAL` | ids dos produtos |
| `APP_URL` | `https://app-agendou.vercel.app` |
| `DATABASE_URL` / `DATABASE_PASSWORD` | endereço do Transaction pooler do Supabase **sem senha** / a senha do banco, separada (o app junta as duas) |
| `SITE_URL` | `https://site-agendou.vercel.app` (a raiz do app redireciona para a landing) |
| `ABACATEPAY_PERMITIR_DEVMODE` | `1` **somente** enquanto testa com a chave de Dev Mode. Apague antes de ir para produção |

5. Rode `supabase/migrations/20261024030000_assinatura_sistema.sql` e depois `20261024040000_webhook_evento.sql` no SQL Editor do Supabase. Se usar `DATABASE_URL`, o `db/schema.sql` já cobre o banco embutido.
6. Faça um pagamento de teste no checkout. No Dev Mode, use o cartão `4242 4242 4242 4242`, qualquer validade futura e qualquer CVV. Nada é cobrado. Confira: plano liberado, validade certa, evento em `webhook_evento`.

### 2. Produção

1. Ative a conta de produção na AbacatePay, recrie os 3 produtos e o webhook com a chave de produção.
2. Troque `ABACATEPAY_API_KEY` e os ids dos produtos na Vercel e **apague `ABACATEPAY_PERMITIR_DEVMODE`**.

## O que o app NÃO faz

- Não cobra automaticamente nem renova sozinho.
- Não faz estorno nem saque: estornos são feitos no painel da AbacatePay, e o app só reflete o `REFUNDED` (R74).
- Não guarda dados de cartão: o pagamento acontece todo no checkout da AbacatePay.

## Testes

`e2e/assinatura.mjs` (26 verificações) e `e2e/assinatura-devmode.mjs` (2) rodam contra `e2e/mock-abacatepay.mjs`, e nada sai para a AbacatePay. Como rodar: `e2e/README.md`.
