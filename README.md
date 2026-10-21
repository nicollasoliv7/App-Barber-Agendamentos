# Agendou

SaaS de agendamento para barbearias: **agendamento público sem login** (link para Instagram/WhatsApp), **CRM** com dashboard e filtros, **importação de clientes** de outros sistemas (CSV/Excel) e painel do dono. Visual escuro premium com aurora quente.

| Funciona de verdade | Depende de configuração externa |
|---|---|
| Agendamento público, "sem preferência", remarcar/cancelar pelo link, `.ics` | Envio real de WhatsApp (`WHATSAPP_API_URL`); sem ele, as mensagens só ficam registradas |
| Painel, CRM, relatórios, exportação CSV | Pagamento real (hoje só sandbox: nenhum valor é cobrado) |
| Importação CSV/Excel com validação e duplicados | Integrações de importação por API (estrutura pronta, nenhum conector) |
| Banco embutido ou Supabase com RLS | Link absoluto nas mensagens (`APP_URL`) |

## Rodar no Windows (jeito fácil)
Dê dois cliques em **`iniciar-agendou.bat`**. Na primeira vez ele instala as dependências (alguns minutos) e depois abre o navegador.

## Rodar pelo terminal
```bash
npm install
npm run dev
```
- Página pública: http://localhost:3000/barbearia-exemplo
- Painel: http://localhost:3000/painel — `dono@agendou.dev` / `agendou123` (acesso fictício, só no desenvolvimento)
- O banco de exemplo vem com **45 dias de histórico fictício** para o dashboard não abrir vazio.

O banco é criado sozinho em `.data/pglite` (Postgres embutido) com dados fictícios. Para zerar, apague a pasta `.data`.

## Testar pagamentos (sandbox)
- Pix: gere o código e clique em **Simular pagamento aprovado (teste)**. O contador expira no prazo configurado.
- Cartão (cliente logado no Histórico): `4111 1111 1111 1111` aprova; `4000 0000 0000 0002` é recusado. Qualquer validade futura e CVV.
- Nenhum valor real é cobrado.

## Banco no Supabase
1. No painel do Supabase, abra **SQL Editor → New query**, cole o conteúdo de
   `supabase/migrations/20261021150000_agendou_schema.sql` e clique em **Run**. Depois faça o mesmo com
   `supabase/migrations/20261021180000_crm_importacao.sql`.
   Ele cria as 18 tabelas, os relacionamentos, os índices, as travas de integridade e as políticas de RLS (cada empresa só enxerga os próprios dados).
2. Em **Project Settings → Database → Connection string (URI)**, copie a string e coloque em `DATABASE_URL`.
3. Rode o app. Com o banco vazio, ele cria a empresa de exemplo. Para não criar, use `SEED=0`.

Quem usa a CLI do Supabase pode rodar `supabase db push`, que aplica a mesma migration.

## Variáveis de ambiente (opcionais) — ver `.env.example`
| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Usar Postgres/Supabase em vez do banco embutido |
| `SEED=0` | Não criar a empresa de exemplo num banco vazio |
| `APP_URL` | Endereço público do app (ex.: `https://agenda.suabarbearia.com.br`), usado nos links das mensagens |
| `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN` | Enviar notificações de verdade (sem isso, ficam registradas no painel) |
| `CRON_SECRET` | Proteger `POST /api/cron/expirar` |
| `PAGAMENTOS_SANDBOX=0` | Desliga o botão de simular pagamento |
| `LEMBRETE_HORAS_ANTES` | Quantas horas antes enviar o lembrete (padrão 3) |
| `ROTINAS_INTERNAS=0` | Desliga as rotinas de 1 em 1 minuto (use as rotas `/api/cron/*` em serverless) |

## Verificações
```bash
npm run lint && npx tsc --noEmit && npm run build
```
O GitHub Actions (`.github/workflows/ci.yml`) roda essas três verificações a cada push.

## Documentação
`docs/MAPA_DE_TELAS.md`, `docs/MODELO_DE_DADOS.md`, `docs/REGRAS_DE_NEGOCIO.md`, `docs/ESTRUTURA_DO_APP.md` e o diário do projeto em `docs/LOG.md`.
