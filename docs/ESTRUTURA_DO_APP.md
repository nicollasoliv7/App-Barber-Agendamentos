# ESTRUTURA DO APP — Agendou

## 1. Stack e decisões

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Next.js 16** (App Router) + **TypeScript** | Stack padrão do projeto |
| Estilo | **Tailwind CSS 4** | Stack padrão; o tema por empresa usa variáveis CSS |
| Banco | **PostgreSQL**: **PGlite** local (Postgres em WASM, sem instalar nada) ou **Supabase** via `DATABASE_URL` | O Supabase local exige Docker. O schema é o mesmo nos dois |
| Auth | Sessões próprias (cookie httpOnly + tabela `sessao`, senha com scrypt) | Funciona sem Supabase. O cliente entra por telefone + senha + código, como na referência. Migrar para o Supabase Auth fica como pendência no LOG |
| Pagamentos | Provedor **sandbox** interno (Pix fictício com QR e cartão tokenizado) | Regra do projeto: somente modo de teste |
| Notificações | Tabela `notificacao` + envio simulado (console). Envio real via `WHATSAPP_API_URL` | Sem provedor real no MVP |

Não há ORM: o SQL é escrito à mão por uma camada fina (`src/lib/db.ts`) que expõe a mesma interface para PGlite e `pg`.

## 2. Árvore de pastas

```
agendou/
├─ db/
│  └─ schema.sql            # schema mínimo usado pelo banco embutido (PGlite), aplicado ao subir
├─ supabase/
│  └─ migrations/
│     └─ 20261021150000_agendou_schema.sql  # schema COMPLETO para Supabase: tabelas, FKs, índices, travas e RLS
├─ src/
│  ├─ lib/                  # regras de negócio (server-only)
│  │  ├─ db.ts              # PGlite | Postgres, transações, seed automático
│  │  ├─ seed.ts            # dados fictícios
│  │  ├─ tempo.ts           # fuso, dias, minutos ↔ instantes, formatação
│  │  ├─ validacao.ts       # telefone, CPF, CNPJ, datas
│  │  ├─ senha.ts           # scrypt, sha256, tokens
│  │  ├─ tipos.ts           # tipos + ErroNegocio
│  │  ├─ empresa.ts         # leitura de empresa/config/catálogo, cálculo do sinal
│  │  ├─ disponibilidade.ts # R1–R8, R18 (expiração)
│  │  ├─ agendamentos.ts    # criar / cancelar / remarcar / status (R9–R14, R21–R26)
│  │  ├─ pagamentos.ts      # Pix e cartão sandbox (R15–R20)
│  │  ├─ notificacoes.ts    # fila e envio
│  │  ├─ lembretes.ts       # lembrete antes do horário (R14b)
│  │  ├─ sessao.ts          # login painel/cliente, código de verificação (R30–R32)
│  │  └─ api.ts             # helpers dos route handlers
│  ├─ instrumentation.ts    # rotinas a cada minuto (expiração do Pix, lembretes)
│  └─ app/
│     ├─ page.tsx                    # início: lista empresas + link do painel
│     ├─ [slug]/                     # PÁGINA PÚBLICA por empresa
│     │  ├─ page.tsx                 # server: carrega empresa, tema e catálogo
│     │  ├─ PaginaPublica.tsx        # vitrine + abas Agendar/Histórico + aviso LGPD
│     │  ├─ Agendar.tsx              # serviço → profissional → dia → hora → resumo → dados
│     │  ├─ Pagamento.tsx            # Pix (QR, copia-e-cola, contador) e cartão
│     │  ├─ Historico.tsx            # login por telefone, lista, remarcar, cancelar, pagar
│     │  ├─ Modal.tsx, cliente-api.ts
│     ├─ painel/
│     │  ├─ login/                   # login do dono
│     │  ├─ acoes.ts                 # server actions do painel
│     │  ├─ Form.tsx                 # formulário com feedback
│     │  └─ (app)/                   # área autenticada (layout verifica a sessão)
│     │     ├─ page.tsx              # Agenda do dia por profissional + agendamento manual
│     │     ├─ clientes/ servicos/ profissionais/ horarios/
│     │     ├─ bloqueios/ financeiro/ notificacoes/ configuracoes/
│     └─ api/                        # endpoints JSON (ver §4)
└─ .data/pglite/            # banco local (criado sozinho; fora do git)
```

## 2.1 Sistema visual (v3)
Fundo quase preto `#07080a` com uma **aurora quente** animada (carmim `#ff2f3a` → coral `#ff6b4a` → âmbar `#ffb347`), feita só com CSS (keyframes, grão SVG e vinheta). A animação é desligada com `prefers-reduced-motion`. Todo o resto é neutro (`#fff` / `#9c9c9d`). Fontes: Inter na interface e Geist Mono só em horários, atalhos e códigos, ambas self-hosted via `@fontsource`.

Componentes em `src/app/globals.css` + `src/components/ui.tsx`:
- `.glass` (painel de vidro), `.card`, `.btn-key` (tecla clara em relevo, ação principal), `.btn-quente` (confirmar/agendar), `.btn-ghost` (pílula), `.btn-sutil`;
- `.chip` (seleção), `.badge-*` (status com ponto, nunca só cor), `.kbd`, `.tabela`, `.esqueleto` (carregamento);
- `Aurora`, `Logo`, `Icone`, `StatusBadge`, `Kpi`, `Vazio`.

A página pública usa a mesma base, mas a cor de ação e a aurora vêm do **tema da empresa** (`--t-primaria`). Gráficos usam uma única cor validada para o fundo escuro (`#e85a3a`), com tooltip, foco por teclado e alternância para tabela.

## 3. Rotas de tela

| Rota | Quem usa | Tela do mapa |
|---|---|---|
| `/` | todos | — |
| `/{slug}` | cliente final | A1–A4 |
| `/{slug}` → aba "Meus agendamentos" | cliente final | A3, A5 |
| `/{slug}/agendamento/{id}?t=` | cliente final, **sem login** | ver, remarcar, cancelar, `.ics` (R36) |
| `/painel/login` | dono | B1 |
| `/painel` | dono | **Visão geral**: KPIs com comparação, receita por dia, serviços mais procurados, melhores clientes, próximos horários, link público com QR |
| `/painel/agenda` | dono | B2 Agenda do dia + agendamento manual |
| `/painel/agendamentos` | dono | histórico completo com filtros, paginação e exportação CSV |
| `/painel/clientes/[id]` | dono | ficha do cliente: indicadores, histórico, preferências, observações |
| `/painel/clientes/importar` | dono/admin | importação CSV/Excel em 4 etapas + histórico de importações |
| `/painel/clientes` | dono | B3 CRM: busca, segmentos, ordenação, cadastro manual |
| `/painel/servicos` | dono | B4 |
| `/painel/profissionais` | dono | B5 (+ comissão) |
| `/painel/horarios` | dono | B6 |
| `/painel/bloqueios` | dono | B7 |
| `/painel/financeiro` | dono | B8, B9, B10 |
| `/painel/notificacoes` | dono | B14 |
| `/painel/configuracoes` | dono | B11, B12, B13, B15 (+ campos personalizados, cadastro de unidades) |

## 4. Endpoints (route handlers)

**Públicos** (`/api/public/{slug}`)
| Método | Caminho | Faz |
|---|---|---|
| GET | `/` | empresa, tema, regras de pagamento, serviços, campos |
| GET | `/profissionais?servico=[&unidade=]` | R7, R7b |
| GET | `/dias`, `/horarios` com `profissional=qualquer` | "sem preferência" (R35) |
| GET | `/agendamentos/{id}?t=` | detalhes pelo link (R36) |
| GET | `/agendamentos/{id}/horarios?t=[&dia=]` | dias/horas para remarcar pelo link |
| POST | `/agendamentos/{id}/remarcar`, `/agendamentos/{id}/cancelar` | com `{ t }` no corpo |
| GET | `/agendamentos/{id}/ics?t=` | arquivo de calendário (R37) |
| GET | `/dias?servico=&profissional=` | R5, R6 |
| GET | `/horarios?servico=&profissional=&dia=` | R1–R4 |
| POST | `/agendamentos` | cria (R9–R14) e devolve o `token` do agendamento |
| POST | `/auth/telefone` | tem cadastro? tem senha? |
| POST | `/auth/codigo` | envia código (60 s entre envios) |
| POST | `/auth/senha` | valida o código, grava a senha e abre a sessão |
| POST | `/auth/login`, `/auth/logout` | sessão do cliente |

**Cliente logado** (`/api/cliente`)
| GET | `/agendamentos?pagina=&limite=` | histórico paginado, com `pode_cancelar` e `pode_remarcar` |
|---|---|---|
| GET | `/agendamentos/{id}/horarios[?dia=]` | dias e horas para remarcar |
| POST | `/agendamentos/{id}/remarcar` | R23 |
| POST | `/agendamentos/{id}/cancelar` | R22 |
| GET/POST | `/cartoes` | listar / tokenizar (sandbox) |
| PATCH/DELETE | `/cartoes/{id}` | favoritar / excluir |

**Pagamentos** (`/api/pagamentos`). Autoriza pelo `token` do agendamento ou pela sessão do cliente.
| POST | `/pix` | gera a cobrança (QR + copia-e-cola + `expira_em`) |
|---|---|---|
| GET | `/{id}` | status (o front consulta a cada 3 s) |
| POST | `/{id}/simular` | aprova (só no sandbox) |
| POST | `/{id}/cancelar` | cancela a cobrança e, se o pagamento era obrigatório, o agendamento |
| POST | `/cartao` | paga com cartão salvo (o final 0002 é recusado) |

**Sistema**: `POST /api/cron/expirar` (R18) e `POST /api/cron/lembretes` (R14b), ambos protegidos por `CRON_SECRET` quando ele está definido. Localmente, `src/instrumentation.ts` executa as duas rotinas a cada minuto (para desligar, `ROTINAS_INTERNAS=0`).

**Painel (arquivos)**: `GET /painel/exportar?filtros` (CSV de agendamentos, R49) e `GET /painel/importar-modelo` (planilha-modelo).
**Importação**: server actions em `src/app/painel/acoes-importacao.ts` (`enviarArquivoImportacao`, `analisarImportacao`, `confirmarImportacao`, `cancelarImportacao`), que validam o papel no servidor (R43) e usam `src/lib/importacao/` (leitura, campos, fontes).

**Painel**: server actions em `src/app/painel/acoes.ts`: entrar/sair, novoAgendamentoManual, mudarStatus, registrarPagamentoLocal, salvarServico, salvarProfissional, adicionarFaixa/removerFaixa, adicionarBloqueio/removerBloqueio, salvarEmpresa, salvarTema, salvarRegras, salvarCampo, salvarCliente, salvarUnidade, estornarPagamentos, novoCliente.

## 5. Schema SQL
- **Supabase/produção**: `supabase/migrations/20261021150000_agendou_schema.sql` + `20261021180000_crm_importacao.sql` (tabela `importacao`, colunas de CRM no cliente, novos padrões), rodadas nessa ordem. É a fonte oficial. Contém:
  - 18 tabelas e as chaves estrangeiras **compostas** `(id, empresa_id)`, que impedem misturar dados de empresas diferentes (por exemplo, um agendamento da empresa A com um cliente da B);
  - restrição `EXCLUDE` contra sobreposição de horários (R10);
  - CHECKs das regras (formatos, prazos, status coerente com `cancelado_por`, Pix pendente com prazo);
  - triggers de integridade e índices de todas as consultas;
  - **RLS** em todas as tabelas, com 51 políticas.
- **Local**: `db/schema.sql`, versão compatível com o PGlite (sem RLS e sem `auth`). O app funciona com qualquer um dos dois.

### Segurança (RLS)
| Quem | Acesso |
|---|---|
| `anon` (sem login) | Nada. Página pública e cliente final passam pelas rotas `/api/*` do servidor |
| `authenticated` dono/admin | Lê e escreve só nas linhas da própria empresa (`usuario_painel.auth_user_id = auth.uid()`) |
| `authenticated` profissional | Lê a própria empresa; altera só os próprios agendamentos |
| Colunas sensíveis | `senha_hash`, `token_publico`, `cartao.token_provedor`, `sessao`, `codigo_verificacao`: ninguém lê pela API do Supabase |
| Servidor do app (`DATABASE_URL` / service_role) | Acesso total (ignora a RLS), com o isolamento feito no código por `empresa_id` |

Onboarding pela API do Supabase: `select public.criar_empresa('Nome', 'slug')` cria a empresa, as configurações padrão e o vínculo de dono do usuário logado.

## 6. Componentes

| Componente | Onde | Função |
|---|---|---|
| `PaginaPublica` | público | cabeçalho com logo/iniciais, endereço + mapa, unidades, cards de serviço, barra inferior, aviso LGPD |
| `Agendar` | público | assistente em passos, com chips de profissional, dia e hora, resumo, campos dinâmicos e tratamento do 409 |
| `Pagamento` | público | abas Pix/Cartão, sinal × integral, QR, copiar, contador, polling, simular, cancelar |
| `Historico` | público | `Login` (telefone → senha, ou código + nova senha), lista, `Remarcar` (semanas), `Cancelar`, pagar |
| `Modal` | público | diálogo acessível (Esc, foco, rolagem travada) |
| `Menu`, layout | painel | navegação lateral, link para a página pública, sair |
| `Form`, `Campo` | painel | formulário com estado de envio, erro e sucesso |
| `Kpi`, `Tabela` | painel | indicadores e relatórios |

## 7. Ordem de implementação (executada)
1. **Banco**: schema, camada `db`, seed fictício ✅
2. **Autenticação**: sessões, painel (e-mail/senha), cliente (telefone, senha, código) ✅
3. **Painel**: agenda, catálogo, profissionais, horários, bloqueios, configurações, clientes, financeiro ✅
4. **Página pública**: vitrine e assistente de agendamento ✅
5. **Histórico**: listar, remarcar, cancelar ✅
6. **Pagamentos (sandbox)**: Pix com expiração e cartão tokenizado ✅
7. **Notificações**: fila, log no painel, envio plugável e lembretes automáticos ✅
8. **Complementos**: multi-unidade, estorno sandbox, pixel com consentimento, menu do painel no celular ✅
9. **v3 (SaaS premium)**: sistema visual, dashboard/CRM com filtros e gráficos, agendamento público em etapas com "sem preferência" e gerenciamento por link, importação CSV/Excel ✅

## 8. Como rodar
```
npm install
npm run dev          # http://localhost:3000
```
Painel: `/painel` → celular `(11) 90000-0001` / senha `agendou123` (só no desenvolvimento). Página pública: `/barbearia-exemplo`.
Para usar o Supabase, rode a migration `supabase/migrations/20261021150000_agendou_schema.sql` no SQL Editor e defina `DATABASE_URL` (string de conexão do Postgres).
