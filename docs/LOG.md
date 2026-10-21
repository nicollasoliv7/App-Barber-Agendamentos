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
