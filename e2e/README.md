# Testes de ponta a ponta (Playwright)

Rodam contra um app em execução com o **banco de exemplo novo** (apague `.data/` antes para recriar).

```bash
npm i -D playwright && npx playwright install chromium   # uma vez
npm run dev                                               # em outro terminal
mkdir -p e2e/capturas
node e2e/fluxo-completo.mjs     # agendamento sem login, link de gerenciar, dashboard, filtros, CSV, importação CSV/Excel, CRM
node e2e/pix-e-historico.mjs    # Pix obrigatório (sandbox) e "Meus agendamentos" com código
node e2e/responsivo.mjs         # nenhuma página estoura a largura em 1440, 1024 e 390 px
```

`BASE_URL` muda o endereço (padrão `http://localhost:3000`). Os arquivos em `e2e/dados/` são fictícios e incluem erros de propósito (telefone vazio, e-mail inválido, CPF inválido, linha repetida) para testar o relatório da importação.

## WhatsApp (sem falar com a Meta)

```bash
node e2e/mock-meta.mjs &                         # Graph API falsa na porta 4010
PGLITE_DIR=.data/pglite node e2e/outra-barbearia.mjs   # com o app parado: cria a 2ª barbearia (isolamento)
WHATSAPP_GRAPH_URL=http://localhost:4010 WHATSAPP_CHAVE_CRIPTO=chave-de-teste-com-mais-de-32-caracteres \
WHATSAPP_APP_SECRET=segredo-do-app-de-teste WHATSAPP_WEBHOOK_VERIFY_TOKEN=verifica-webhook-teste \
APP_URL=http://localhost:3300 PORT=3300 MODO_DEMO=1 LEMBRETE_HORAS_ANTES=72 CRON_SECRET=cron-teste npm run dev
CRON_SECRET=cron-teste node e2e/whatsapp.mjs     # 42 verificações
```

## Planos mensais (49 verificações)

Com o app rodando num banco **novo** e a 2ª barbearia criada (`node e2e/outra-barbearia.mjs`, com o app parado):

```bash
node e2e/planos.mjs   # barbearia só por corte, CRM, criar plano, assinante coberto, limite, adicional, pendente/atrasada/cancelada, financeiro, isolamento
```

## Assinatura da plataforma + AbacatePay (sem falar com a AbacatePay)

Com um banco **novo**. O mock assina os eventos com HMAC e usa um `id` por evento, como a AbacatePay:

```bash
node e2e/mock-abacatepay.mjs &        # API v2 falsa na porta 4020
npm run build
ABACATEPAY_API_URL=http://localhost:4020 ABACATEPAY_API_KEY=chave-teste-abacate \
ABACATEPAY_WEBHOOK_SECRET=segredo-webhook-teste ABACATEPAY_WEBHOOK_HMAC_KEY=chave-publica-teste-abacate \
ABACATEPAY_PRODUTO_MENSAL=prod_mensal ABACATEPAY_PRODUTO_TRIMESTRAL=prod_trimestral ABACATEPAY_PRODUTO_ANUAL=prod_anual \
ABACATEPAY_PERMITIR_DEVMODE=1 APP_URL=http://localhost:3300 MODO_DEMO=1 npx next start -p 3300
node e2e/assinatura.mjs               # cadastro, limite de 15, webhook (segredo, HMAC, duplicado), pagamento, renovação, estorno, isolamento
```

`ABACATEPAY_PERMITIR_DEVMODE=1` é necessário só aqui porque o mock responde como Dev Mode e o `next start` roda em modo produção.
Sem ela, um pagamento de teste **não** libera plano (é o comportamento de produção; `e2e/assinatura-devmode.mjs` confere isso).
