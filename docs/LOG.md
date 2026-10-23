# LOG — App GBarber

## 2026-10-21 — Preparação do ambiente (REA)

**Feito**
- Repositório `morluto/rea` (REA — Reverse Engineer Anything) clonado em `rea/` (branch `main`, commit `d0067ba34`). Arquivos conferidos byte a byte com o original.
- Submódulos de `rea/third_party` (binwalk, unblob, jadx-headless-mcp, ghidra-nativeaot, wakaru) não baixados (opcionais).
- `npx rea-agents@6.7.0 setup` aplicado no Windows. Servidor MCP `rea` registrado e verificado (`aligned`) em: Claude Desktop, Claude Code, Codex, Cursor, VS Code, GitHub Copilot CLI, Command Code, Qwen Code, Qoder, Factory Droid.
- Skill `reverse-engineer-anything` instalada (versão 42, 207 ferramentas).
- Scripts e logs da instalação em `_setup-rea/`.

**Decisões**
- Node 24.13 já instalado: atende ao requisito do REA.
- Provedores de análise nativa (Ghidra, IDA, JADX, Kuna) não configurados: não são necessários para analisar uma plataforma web (PHP + jQuery).

**Pendências**
- Reiniciar os agentes que estavam abertos durante o setup (VS Code, Cursor etc.) para carregarem o REA.
- Preencher no projeto a seção "O QUE É O REA" (hoje é um placeholder).

**Próximo passo exato**
- Fase 1 (Mapeamento): abrir o painel de referência no navegador do Claude e começar o `MAPA_DE_TELAS.md`.

---

## 2026-10-21 — Fases 1 a 4: app "Agendou" construído

**Estado atual: o app roda localmente no Windows e o critério de pronto foi cumprido.**
Teste final no seu PC: o cliente fictício "Paulo Teste Windows" agendou Barba às 15:00 na página pública e o agendamento apareceu em `/painel` → Agenda.

**Feito**
- Fase 1: `agendou/docs/MAPA_DE_TELAS.md`. A página pública foi mapeada só observando (HTML e lista de endpoints). O painel de referência pediu login e eu **não** tentei entrar (regra do projeto).
- Fase 2: `agendou/docs/MODELO_DE_DADOS.md` (diagrama Mermaid, 16 tabelas) e `agendou/docs/REGRAS_DE_NEGOCIO.md` (regras R1–R33).
- Fase 3: `agendou/docs/ESTRUTURA_DO_APP.md` (árvore, rotas, endpoints, componentes, ordem).
- Fase 4: código em `agendou/`, na ordem banco → auth → painel → página pública → histórico → pagamentos sandbox → notificações.
- Testes automatizados (navegador headless) aprovados: agendamento, conflito 409, Pix com expiração (cancela e libera o horário), código de verificação, login do cliente, remarcar, cancelar, cartão sandbox (aprova/recusa), todas as telas do painel. Lint, tipos e build de produção limpos.

**Decisões**
- Marca própria: **Agendou**. Nenhum texto, logo ou código da referência foi copiado. A empresa de exemplo é fictícia ("Barbearia Exemplo").
- Banco: PGlite (Postgres embutido) em vez de Supabase local, porque o Supabase local exige Docker. O mesmo schema roda no Supabase via `DATABASE_URL`.
- Auth própria (cookie + scrypt) em vez de Supabase Auth, para rodar sem serviço externo.
- Pagamento: provedor sandbox interno (Pix fictício com QR e botão "simular pagamento"; cartão tokenizado com final 0002 = recusa).
- Notificações: gravadas na tabela e simuladas no console. Envio real plugável via `WHATSAPP_API_URL`.
- Agendar pela página pública não exige senha (nome + telefone, como na referência). A senha é pedida só no Histórico.

**Como rodar**: dois cliques em `agendou/iniciar-agendou.bat` → http://localhost:3000/barbearia-exemplo. Painel: http://localhost:3000/painel (`dono@agendou.dev` / `agendou123`, acesso fictício de desenvolvimento).

**Pendências**
1. Mapear o **painel de referência** quando o dono fizer login no navegador do Claude, e comparar com o mapa (seção B está marcada como inferida).
2. Provedor real de Pix/cartão (ex.: Mercado Pago, Asaas, Pagar.me) e de WhatsApp (API oficial ou Z-API). Hoje: sandbox e simulação.
3. Supabase em produção: criar o projeto, definir `DATABASE_URL`, rodar `db/supabase_extra.sql`. Opcional: migrar a auth para o Supabase Auth.
4. Fora do MVP: plano/assinatura da plataforma, estorno automático, lembrete automático antes do horário, upload de imagens (hoje é por URL), seleção de unidade ligada à filtragem de profissionais, pixel de campanha injetado na página, menu "Sair" no painel em tela de celular.
5. Projeto dentro do OneDrive: o `npm install` e o git ficam lentos. Recomendo mover para `C:\Projetos`.
6. `_setup-rea/agendou.tar` (cópia de transporte) pode ser apagado.

**Próximo passo exato**
- Pedir ao dono para fazer login no painel de referência e então completar a seção B do `MAPA_DE_TELAS.md`, ajustando o app se surgir alguma tela que ainda não existe.

---

## 2026-10-21 (tarde) — Conclusão + publicação no GitHub

**Estado final**: as Fases 1 a 4 estão concluídas e o código está publicado em https://github.com/nicollasoliv7/App-Barber-Agendamentos (branch `main`). A única parte em aberto é o mapeamento do painel de referência, que depende de login.

**Feito nesta etapa** (pendências do LOG anterior)
- **Multi-unidade** (R7b): cadastro de unidades em Configurações; profissional vinculado a uma unidade ou a todas; a página pública mostra o seletor de unidade, o endereço e o mapa dela, e filtra os profissionais.
- **Lembrete automático** (R14b): WhatsApp até 3 h antes, enviado uma única vez. Rotina interna a cada minuto (`src/instrumentation.ts`) e `POST /api/cron/lembretes`.
- **Expiração do Pix** também pela rotina interna, sem depender de alguém acessar a página.
- **Estorno sandbox** (R24): botão "Estornar pagamento (teste)" na agenda, para agendamentos cancelados que já foram pagos.
- **Pixel de campanha** (R34): carregado somente após o aceite do aviso de privacidade (LGPD).
- **Painel no celular**: atalhos "Página ↗" e "Sair" no topo.
- **CI no GitHub Actions**: lint, tipos e build a cada push.
- Testes automatizados (navegador headless) aprovados: fluxo completo, histórico (código, remarcar, cancelar), unidades, estorno, lembrete, painel no celular. Lint, tipos e build de produção limpos.

**Pendências (dependem de você ou de contratos externos)**
1. **Painel de referência**: continua na tela de login. Faça login no navegador do Claude para eu completar a seção B do `MAPA_DE_TELAS.md` (hoje inferida) e ajustar o app se aparecer alguma tela nova.
2. Provedores reais: pagamento (Mercado Pago, Asaas ou Pagar.me) e WhatsApp (API oficial ou Z-API). Hoje é sandbox e envio simulado.
3. Produção: projeto no Supabase (`DATABASE_URL` + `db/supabase_extra.sql`) e hospedagem (Vercel com `ROTINAS_INTERNAS=0` + cron chamando `/api/cron/*`, ou VPS rodando `npm start`).
4. Fora do escopo: cobrança do plano/assinatura da plataforma, upload de imagens (hoje é por URL), Supabase Auth.
5. Recomendado: mover o projeto para fora do OneDrive (`C:\Projetos`) por desempenho.
6. Pode apagar: `_setup-rea/agendou.tar`.

**Próximo passo exato**
- Login no painel de referência → completar o mapeamento B1–B16 → comparar com o app.

---

## 2026-10-21 — Migration do Supabase (SQL completo + RLS)

**Feito**
- `supabase/migrations/20261021150000_agendou_schema.sql`, o schema oficial para Supabase:
  - 18 tabelas com FKs compostas por empresa, `EXCLUDE` contra horários sobrepostos, CHECKs das regras de negócio, triggers de integridade e índices;
  - RLS em todas as tabelas (51 políticas), sem acesso do `anon` e com colunas sensíveis ocultas;
  - função `criar_empresa()` para o onboarding.
- Testada num Postgres 16 simulando o Supabase (papéis anon/authenticated, `auth.uid()`). 22 testes passaram: isolamento A×B, papel profissional, colunas ocultas, conflito de horário, FK entre empresas, onboarding. Também roda de novo sem erro e convive com `db/schema.sql`.
- App rodado em cima desse banco (via `DATABASE_URL`): fluxo público, histórico, unidades, estorno e painel aprovados.
- Bug corrigido: as páginas do painel acessadas sem login geravam erro no servidor (layout e página renderizam em paralelo). Agora cada página redireciona por conta própria (`usuarioOuLogin`).
- `db/supabase_extra.sql` foi removido, porque a migration nova já o inclui.

**Pendências**: as mesmas da entrada anterior. A migration substitui o passo "rodar `db/supabase_extra.sql`".

---

## 2026-10-21 (tarde) — v3: SaaS premium, CRM, agendamento sem login e importação

**Pedido**: remodelar o app com a referência visual (aurora quente, vidro, botões em tecla), um CRM/dashboard fácil, um agendamento público sem login e a importação de clientes de outros sistemas, tudo de ponta a ponta e com honestidade sobre integrações.

**Feito**
- **Sistema visual**: tema escuro `#07080a` com aurora quente animada só em CSS (respeita `prefers-reduced-motion`), Inter + Geist Mono self-hosted, componentes `.glass` `.card` `.btn-key` `.btn-quente` `.chip` `.badge` `.tabela` e componentes React (`Aurora`, `Icone`, `Kpi`, `StatusBadge`). Aplicado à landing, à página pública, ao login e a todas as telas do painel.
- **Landing** (`/`): hero com menu em pílula, botões em tecla e um mockup da agenda do dia.
- **CRM e painel**:
  - **Visão geral** (`/painel`): 6 indicadores com comparação ao período anterior, receita por dia (gráfico com tooltip, teclado e versão em tabela), serviços mais procurados, melhores clientes, próximos horários, contagem por status e cartão do link público (copiar, WhatsApp, QR Code em PNG). Filtros por período, serviço, profissional, status e cliente, guardados na URL.
  - **Agendamentos** (`/painel/agendamentos`): histórico com filtros, paginação, ações rápidas e exportação CSV (protegida contra *CSV injection*).
  - **Clientes**: busca, segmentos (com horário, sumidos 45+ dias, novos, importados), ordenação, cadastro manual e **ficha** com indicadores, histórico, serviços preferidos e observações.
  - **Agenda do dia** foi para `/painel/agenda`, sem perder nenhuma função.
- **Agendamento público sem login**:
  - fluxo em etapas mobile-first com barra de progresso e barra fixa de ação;
  - opção **"Sem preferência"** (R35), dias em faixa horizontal e horários por turno;
  - estados de carregamento (esqueletos) e de erro, com o 409 tratado;
  - comprovante com `.ics` e Google Agenda, além de **link de gerenciar** para remarcar e cancelar sem senha (R36). Os dados do cliente podem ser lembrados no aparelho.
- **Importação de clientes** (`/painel/clientes/importar`):
  - CSV (detecta separador e codificação) e Excel `.xlsx`;
  - mapeamento automático de colunas por sinônimos, DDD padrão e prévia;
  - validação **no servidor**, duplicados no arquivo e no banco, e política "manter" ou "completar vazios";
  - relatório baixável, histórico de importações e dados brutos descartados ao concluir;
  - a tela informa o que é e o que não é importado, e que não há integração por API ainda (a estrutura existe em `fontes.ts`).
- **Banco**: tabela `importacao`, colunas `cliente.observacoes/origem/importacao_id` e nova migration `supabase/migrations/20261021180000_crm_importacao.sql` (RLS: o gestor vê o histórico, nunca os dados brutos). A migration anterior não foi alterada.
- **Honestidade**:
  - quadro "Status das integrações" em Configurações (WhatsApp, pagamentos, APP_URL);
  - a mensagem "enviamos no WhatsApp" só aparece com provedor configurado;
  - o pagamento online agora vem **desativado** por padrão nas empresas novas (sandbox continua disponível e rotulado).
- **Demonstração**: o banco de exemplo traz 45 dias de histórico fictício, para o painel não abrir vazio.
- **Testes** (`e2e/`): fluxo completo, Pix e histórico, e largura responsiva em 1440, 1024 e 390 px, todos aprovados. A migration nova foi testada num Postgres 16 simulando o Supabase. Lint, tipos e build limpos.

**Decisões**
- `/painel` passou a ser a Visão geral (o pedido prioriza o dashboard). A agenda do dia fica a um clique.
- Gráficos feitos à mão em SVG (sem biblioteca), com uma cor validada para o fundo escuro.
- O aviso de cookies só aparece quando a empresa usa pixel de campanha, que é o único rastreamento da página.

**Pendências (externas)**
1. ~~Provedor de WhatsApp~~ → feito na v4 (API oficial da Meta). Falta só configurar as contas (ver docs/WHATSAPP.md) e `APP_URL`.
2. Provedor de pagamento real (hoje só sandbox).
3. Conectores de importação por API, quando os sistemas de origem oferecerem API.
4. Painel de referência: continua dependendo de login para completar o mapeamento B1–B16.


---

## v4 — Integração com o WhatsApp (API oficial da Meta) · 22/10/2026

**O que foi feito**
- **Conexão por barbearia** (`/painel/whatsapp`): Phone Number ID + WABA ID + token permanente, verificados na Meta na hora. O token é guardado criptografado (AES-256-GCM) e nunca volta para a tela. Inclui "Testar conexão", "Enviar teste" e "Desconectar", com status claro: Não conectado, Conectado · falta o modelo, Conectado ou Erro na conexão.
- **Envios automáticos** pela WhatsApp Cloud API com modelos aprovados: confirmação ao agendar (ou ao pagar o Pix), lembrete opcional e código de verificação do histórico. O envio acontece **após o commit** (`tx().depois`), sem segurar locks e sem desfazer o agendamento em caso de falha.
- **Webhook** `/api/whatsapp/webhook`: verificação da Meta e status enviado, entregue, lido e falhou, só com assinatura válida. O status nunca regride e há isolamento por número.
- **Honestidade**:
  - removido o envio "simulado" que marcava tudo como `enviado`; mensagens antigas desse tipo foram migradas para `nao_enviado`;
  - a página pública só diz "a caminho do seu WhatsApp" quando a Meta aceitou;
  - o histórico do cliente só diz "enviamos o código" quando ele saiu de verdade.
- **Envio manual**: botão WhatsApp (`wa.me` com a mensagem pronta) na Agenda, em Agendamentos e em Notificações. Na página pública, o cliente tem "Avisar a barbearia pelo WhatsApp".
- **Banco**: tabela `whatsapp_conexao` e novas colunas em `notificacao`; migration `supabase/migrations/20261022210000_whatsapp.sql`.
- **Testes**:
  - `e2e/whatsapp.mjs` com mock da Graph API: 42 verificações aprovadas;
  - suites antigas (`fluxo-completo`, `pix-e-historico`, `responsivo`) aprovadas;
  - migração de banco antigo verificada;
  - lint, tipos e build limpos.

**Decisões**
- "Cada barbeiro conecta o próprio WhatsApp" foi implementado **por barbearia** (empresa), que é quem tem o número comercial e o cadastro na Meta. Um número por profissional pode vir depois, com a mesma tabela.
- A conexão é feita colando as credenciais (o mais simples e compatível hoje). O **Embedded Signup** da Meta fica como próximo passo para escalar.
- `WHATSAPP_API_URL` (provedor genérico global) foi **removido**: enviaria mensagens de todas as barbearias por um número só, contrariando o requisito.
- Cancelamento, remarcação e aviso à barbearia não têm modelo próprio ainda: ficam registrados como "Não enviada", com o botão de envio manual.

**Pendências (externas — dependem de você)**
1. Criar o app na Meta e definir `WHATSAPP_CHAVE_CRIPTO`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `APP_URL` no servidor.
2. Publicar o app (Vercel) para a Meta conseguir chamar o webhook.
3. Por barbearia: número verificado, token permanente, modelos aprovados e conexão no painel.

**Próximo passo exato**: autorizar o acesso da Vercel e publicar; depois seguir `docs/WHATSAPP.md`, parte A.

---

## v5 — Gestão completa + planos mensais (módulo opcional) · 22/10/2026

**Diagnóstico (antes)**
- **Já existia:** agenda, agendamentos, CRM, financeiro, dashboard e página pública.
- **Lacunas:**
  - não havia planos mensais;
  - não dava para editar um agendamento pelo painel;
  - faltavam os indicadores "a receber" e "clientes recorrentes".
- **Risco:** com planos, o faturamento contaria o atendimento coberto duas vezes, e Pix/"Recebi no local" cobrariam de novo.

**O que foi feito**
- **Banco** (só adições):
  - tabelas `plano`, `plano_servico`, `assinatura`, `assinatura_cobranca` e `assinatura_uso`;
  - coluna `agendamento.valor_coberto_centavos`;
  - migration `supabase/migrations/20261022230000_planos.sql` (RLS, chaves compostas; assinaturas, mensalidades e usos somente leitura pela API).
- **Regras** (`src/lib/planos.ts`, R57–R67):
  - ciclos sem deriva, uma mensalidade por ciclo e status separados (assinatura × mensalidade);
  - cobertura automática ao agendar, com "Usar plano" e "Cobrar avulso";
  - limite por ciclo e valor adicional por serviço;
  - cancelar ou remarcar devolve ou recalcula o uso;
  - cancelar a assinatura tira a cobertura só dos atendimentos futuros.
- **Sem cobrança duplicada:** "Recebi no local", Pix e Pix obrigatório usam o saldo `preço − coberto`. Faturamento, ticket, CRM e CSV não contam de novo o valor coberto.
- **Telas:**
  - nova **Planos** (orientação quando vazia; indicadores, assinantes com filtro, renovações, adicionar assinante, criar e editar planos);
  - bloco **Plano mensal** na ficha do cliente;
  - selos e ações na agenda;
  - **Financeiro** reorganizado (atendimentos × planos, a receber com ações, mensalidades em aberto);
  - dashboard com **A receber**, **Clientes atendidos** e **Clientes recorrentes**, e painel de planos só para quem usa;
  - CRM com segmento **Recorrentes** e **Com plano** (este só com planos);
  - **editar agendamento** pela agenda.
- **Navegação:** Financeiro subiu para perto de Clientes; Planos entrou logo depois, como item próprio.
- **Posicionamento:** a página inicial e as metatags passaram a usar "Tudo o que sua barbearia precisa para funcionar melhor"; os planos aparecem como diferencial opcional.
- **Testes:**
  - `e2e/planos.mjs` (49 verificações, cobrindo os 10 cenários pedidos);
  - suites anteriores aprovadas: fluxo completo, Pix e histórico, responsivo com `/painel/planos`, WhatsApp;
  - migration aplicada num Postgres 16 simulando o Supabase;
  - lint, tipos e build limpos.

**Decisões**
- Mensalidade vence no início do ciclo (pré-pago); tolerância fixa de 5 dias antes de "atrasada".
- O uso do plano é registrado ao agendar (reserva o benefício) e devolvido se o atendimento for cancelado. Falta não devolve automaticamente; o barbeiro decide com "Cobrar avulso".
- Comissão continua sobre o valor do serviço, mesmo coberto (o barbeiro trabalhou). Isso fica explícito na tela.
- A página pública mostra "Incluído no seu plano" só para quem agendou com aquele telefone.

**Pendências (externas)**
1. Cobrança automática de mensalidades (cartão ou Pix recorrente): depende de um gateway de pagamento real e de credenciais.
2. Tolerância de inadimplência configurável por barbearia (hoje fixa em 5 dias).
3. Itens anteriores: deploy na Vercel (autorização do time), contas da Meta para o WhatsApp, painel de referência.

**Próximo passo exato**: publicar (Vercel) e criar o primeiro plano real em `/painel/planos`.

---

## Quality gates do ESLint (vibe-coding-toolkit, prompt 08) · 22/10/2026

**O que foi feito**
- **Regras copiadas:** os 3 arquivos de `eslint-rules/*.cjs` foram copiados **byte a byte** do vibe-coding-toolkit (`templates/eslint`). O `verify.mjs` respondeu 3× "ok" e depois foi apagado.
- **Configuração:** `eslint.config.mjs` mantém a config do Next que já existia (core-web-vitals + typescript) e acrescenta, para `src/**`, três regras:
  - `quality/max-lines`, com teto de 350 linhas;
  - `quality/no-direct-console`;
  - `quality/no-direct-data-access`, aplicada aos módulos `@/lib/db` (`db`, `q`, `q1`, `tx`) nas camadas `src/app/` e `src/components/` e nos arquivos `.tsx`.
- **Lint com tipos:** `eslint.typed.config.mjs` liga o projectService e as regras de promessas e "unsafe".
- **Scripts:** `lint` (`eslint .`), `lint:fix` e `lint:typed`.

**Medição (baseline)**

| Regra | Violações | Severidade |
|---|---|---|
| `quality/max-lines` (350) | 7 arquivos | warn |
| `quality/no-direct-data-access` | 33 imports em 32 arquivos | warn |
| `quality/no-direct-console` | 9 | warn |
| Typed: `no-misused-promises` | 26 | warn |
| Typed: `no-floating-promises` | 11 | warn |
| Typed: `no-unsafe-member-access` | 11 | warn |
| Typed: `no-unsafe-argument` | 9 | warn |
| Typed: `no-unsafe-assignment` | 2 | warn |
| Typed: `require-await` | 2 | warn |
| Demais regras typed (sem violações) | 0 | error |

Arquivos acima de 350 linhas:
- 625 `src/app/[slug]/Agendar.tsx`
- 471 `src/app/[slug]/Historico.tsx`
- 430 `src/app/painel/(app)/clientes/importar/Importador.tsx`
- 428 `src/app/painel/acoes.ts`
- 411 `src/lib/planos.ts`
- 356 `src/app/painel/(app)/planos/page.tsx`
- 352 `src/lib/agendamentos.ts`

**Decisões**
- **Não incluídos os presets `js.configs.recommended` / `tseslint.configs.strict` e o bloco de complexidade do exemplo:** o projeto já usa as regras do Next + typescript-eslint, e a tarefa era instalar os 3 gates. Por isso `@eslint/js` e `typescript-eslint` não foram instalados à parte: o parser e o plugin vêm do `eslint-config-next`.
- **Bloco `import-x` removido:** o projeto ainda não tem camadas declaradas além da fronteira do banco, que já é coberta por `quality/no-direct-data-access`.
- **Bloco "off" do console removido:** não existe módulo de log.
- **Fora do CI:** o lint com tipos leva cerca de 20 s e usa cerca de 0,9 GB de pico. O CI continua rodando só `npm run lint`.
- **Nenhuma violação foi corrigida** (instalar e medir era o escopo).

**Próximo passo**: dividir os 7 arquivos grandes (prompt 09 do toolkit) e, ao zerar cada contagem, voltar a regra para "error".

## Burndown do lint: arquivos grandes + avisos restantes (prompts 09 e 02) · 22/10/2026

**Resultado**: `npm run lint` está em 0 problemas. As três regras de qualidade passaram de "warn" para **"error"**, então uma violação nova quebra o lint e o CI.

| Regra | Antes | Depois | Severidade |
|---|---|---|---|
| `quality/max-lines` (350) | 7 arquivos | 0 | error |
| `quality/no-direct-console` | 9 chamadas | 0 | error |
| `quality/no-direct-data-access` | 33 imports em 32 arquivos | 0 | error |

**O que mudou**
- **Arquivos grandes:**
  - `Agendar.tsx`, `Historico.tsx` e `Importador.tsx` foram divididos em sub-componentes por etapa.
  - `planos.ts` foi dividido em `planos-ciclos`, `planos-cobertura` e `planos-indicadores`.
  - `agendamentos.ts` foi dividido em `agendamentos-cliente` e `agendamentos-empresa`.
  - Os arquivos originais reexportam tudo, então quem já importava deles continua funcionando sem mudança.
- **Log:** o novo `src/lib/log.ts` expõe `log.info` e `log.erro`, e é o único arquivo liberado para usar console.
- **Banco:** nenhum arquivo de `src/app` importa `@/lib/db`.
  - A leitura fica em `src/lib/consultas/`: publico, cliente, cadastros, historicos, agenda, clientes, planos e financeiro.
  - A gravação fica em `src/lib/repositorios/`: servicos, profissionais, horarios, configuracoes, clientes e whatsapp-conexao.
  - O SQL foi movido sem alterar a lógica. Toda função recebe `empresa_id`.

**Verificação**
- Lint: 0.
- `tsc --noEmit`: limpo.
- Build: ok.
- Testes e2e: passaram as suítes planos, whatsapp, histórico (modais), fluxo-completo, pix-e-historico e responsivo.
- Nenhum `eslint-disable` foi adicionado.

**Pontos não mecânicos** (revisar se quiser)
- `consultas/clientes.ts` ganhou fallbacks com `??` (`FILTRO_SEGMENTO[seg] ?? "true"` e `ORDEM_SQL[ordem] ?? ORDEM_SQL.recentes`). A página já valida as chaves, então esses fallbacks nunca são usados na prática.
- `totalClientes()` agora retorna um número, e o dashboard foi ajustado para isso.

**Fora do escopo**: os 61 avisos de `npm run lint:typed` (regras com tipos) continuam em "warn".

**Próximo passo**: zerar o `lint:typed`, se quiser. O deploy na Vercel ainda depende da sua aprovação do acesso ao time.
