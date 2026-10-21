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
