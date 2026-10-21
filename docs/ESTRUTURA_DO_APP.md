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
│  ├─ schema.sql            # schema completo (aplicado ao subir; idempotente)
│  └─ supabase_extra.sql    # EXCLUDE anti-conflito (btree_gist), só no Postgres completo
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
│  │  ├─ sessao.ts          # login painel/cliente, código de verificação (R30–R32)
│  │  └─ api.ts             # helpers dos route handlers
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

## 3. Rotas de tela

| Rota | Quem usa | Tela do mapa |
|---|---|---|
| `/` | todos | — |
| `/{slug}` | cliente final | A1–A4 |
| `/{slug}` → aba Histórico | cliente final | A3, A5 |
| `/painel/login` | dono | B1 |
| `/painel` | dono | B2 Agenda |
| `/painel/clientes` | dono | B3 |
| `/painel/servicos` | dono | B4 |
| `/painel/profissionais` | dono | B5 (+ comissão) |
| `/painel/horarios` | dono | B6 |
| `/painel/bloqueios` | dono | B7 |
| `/painel/financeiro` | dono | B8, B9, B10 |
| `/painel/notificacoes` | dono | B14 |
| `/painel/configuracoes` | dono | B11, B12, B13 (+ campos personalizados, multiunidade) |

## 4. Endpoints (route handlers)

**Públicos** (`/api/public/{slug}`)
| Método | Caminho | Faz |
|---|---|---|
| GET | `/` | empresa, tema, regras de pagamento, serviços, campos |
| GET | `/profissionais?servico=` | R7 |
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

**Sistema**: `POST /api/cron/expirar` (R18; protegido por `CRON_SECRET` quando definido).

**Painel**: server actions em `src/app/painel/acoes.ts`: entrar/sair, novoAgendamentoManual, mudarStatus, registrarPagamentoLocal, salvarServico, salvarProfissional, adicionarFaixa/removerFaixa, adicionarBloqueio/removerBloqueio, salvarEmpresa, salvarTema, salvarRegras, salvarCampo, salvarCliente.

## 5. Schema SQL
Ver `db/schema.sql` (16 tabelas, descritas em MODELO_DE_DADOS.md).

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
7. **Notificações**: fila, log no painel e envio plugável ✅

## 8. Como rodar
```
npm install
npm run dev          # http://localhost:3000
```
Painel: `/painel` → `dono@agendou.dev` / `agendou123` (só no desenvolvimento). Página pública: `/barbearia-exemplo`.
Para usar o Supabase, defina `DATABASE_URL` (string de conexão do Postgres) e, opcionalmente, rode `db/supabase_extra.sql`.
