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
