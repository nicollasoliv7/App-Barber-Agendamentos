# REGRAS DE NEGÓCIO

Os valores entre parênteses são os padrões, todos configuráveis por empresa em `config_agendamento`.

## 1. Disponibilidade e horários
- **R1** — Um horário é oferecido se o intervalo `[início, início + duração do serviço)` cabe inteiro numa faixa de `disponibilidade` do profissional naquele dia da semana.
- **R2** — Os candidatos a início saem a cada `intervalo_slots_min` (10 min), a partir do início de cada faixa.
- **R3** — O horário é descartado se sobrepõe: (a) um agendamento do profissional com status `pendente_pagamento` não expirado, `confirmado` ou `concluido`; (b) um `bloqueio` do profissional; (c) um `bloqueio` da empresa (profissional nulo).
- **R4 · Antecedência** — Não se oferece horário que comece antes de `agora + antecedencia_min_min` (60 min).
- **R5 · Janela** — Só se oferecem dias até `hoje + janela_max_dias` (30).
- **R6** — Os dias oferecidos são os que têm pelo menos um horário livre (passo "Dia" do fluxo).
- **R7** — Só aparecem profissionais ativos que fazem o serviço escolhido; só aparecem serviços ativos.
- **R7b · Multi-unidade** — Com a empresa em modo multi-unidade, o cliente escolhe a unidade e vê os profissionais lotados nela, mais os profissionais sem unidade definida (atendem em todas). O endereço e o link do mapa mostrados são os da unidade.
- **R8** — Todas as contas de data usam o `fuso_horario` da empresa (America/Sao_Paulo).

## 2. Criar agendamento
- **R9** — O cliente é identificado pelo **telefone**, normalizado só com dígitos, com DDD. Telefone novo cria o cliente; telefone existente reaproveita o cadastro e atualiza o nome.
- **R10 · Conflito** — Na hora de gravar, a disponibilidade é checada de novo dentro de uma transação. Se o horário foi tomado, a resposta é **409**, com a mensagem "horário acabou de ser reservado".
- **R11** — O preço e a duração ficam **congelados** no agendamento: mudar o preço do serviço depois não altera agendamentos existentes.
- **R12** — Campos personalizados obrigatórios precisam estar preenchidos e válidos (CPF/CNPJ com dígito verificador, data válida).
- **R13** — Status inicial:
  - pagamento `desativado` ou `opcional` → `confirmado`;
  - pagamento `obrigatorio` → `pendente_pagamento`, com `expira_em = agora + pix_expiracao_min` (5 min).
- **R14** — Ao confirmar, gera notificação de WhatsApp para o cliente e para a empresa.
- **R14b · Lembrete** — Agendamentos `confirmado` recebem **um** lembrete por WhatsApp quando faltam até `LEMBRETE_HORAS_ANTES` horas (padrão 3). Uma rotina interna roda a cada minuto; em produção serverless, use `POST /api/cron/lembretes`.

## 3. Pagamento (somente sandbox)
- **R15 · Modalidades** — `desativado`: sem cobrança online. `opcional`: o cliente pode pagar agora ou no local. `obrigatorio`: sem pagamento aprovado dentro do prazo, o agendamento é cancelado.
- **R16 · Valor** — `minimo` = ⌈preço × pagamento_minimo_pct / 100⌉. `integral` = preço. Em `cliente_escolhe`, o cliente escolhe entre os dois.
- **R17 · Pix** — A cobrança tem `expira_em = agora + pix_expiracao_min`. A tela mostra o QR Code, o copia-e-cola e um contador. Só existe uma cobrança Pix pendente por agendamento: gerar outra cancela a anterior.
- **R18 · Expiração** — Uma cobrança `pendente` com `expira_em` no passado vira `expirada`. Se o agendamento estava `pendente_pagamento`, ele vira `cancelado` (`cancelado_por = sistema`) e o horário é liberado. A regra roda de três formas: de forma preguiçosa (em toda consulta de disponibilidade e de status), pela rotina interna (a cada minuto) e por `POST /api/cron/expirar`.
- **R19 · Aprovação** — Pagamento aprovado → `pagamento.status = pago` e agendamento `pendente_pagamento` → `confirmado`. No sandbox, a aprovação é simulada por um botão "simular pagamento" ou pelo webhook de teste.
- **R20 · Cartão** — Só guardamos o token, a bandeira, os 4 últimos dígitos e a validade. Nunca o número completo nem o CVV. O cliente tem um cartão favorito por vez.

## 4. Remarcação e cancelamento (cliente)
- **R21** — O cliente só vê e mexe nos próprios agendamentos (sessão por telefone verificado).
- **R22 · Cancelar** — Permitido em `confirmado` ou `pendente_pagamento`, até `cancelamento_ate_min` (120) antes do início. Depois disso, só a empresa cancela.
- **R23 · Remarcar** — Mesmas condições de prazo do R22. O novo horário passa pelas regras R1 a R5 e R10, com o mesmo serviço e o mesmo profissional (como na referência). Na prática, atualiza `inicio` e `fim` do próprio agendamento e registra o horário antigo na notificação.
- **R24 · Estorno** — Quando um agendamento pago (Pix/cartão) é cancelado, o painel mostra **"Estornar pagamento"**. No sandbox, isso só marca o pagamento como `estornado`, e ele sai do "Recebido" no financeiro. Num provedor real, a mesma ação chamaria a API de estorno.

## 5. Painel (empresa)
- **R25** — A empresa pode criar agendamento manual (origem `painel`). Ele ignora a antecedência mínima, mas não ignora conflitos.
- **R26** — A empresa pode mudar o status para `concluido`, `faltou` ou `cancelado` (`cancelado_por = empresa`).
- **R27 · Comissão** — Comissão = Σ (preço dos agendamentos `concluido` do profissional no período) × comissao_pct / 100.
- **R28 · Financeiro** — Receita prevista = Σ preço dos `confirmado` + `concluido`. Recebido online = Σ pagamentos `pago`.
- **R29** — Desativar um serviço ou profissional não apaga o histórico; só o esconde da página pública.

## 6. Identificação e segurança
- **R30** — Login do cliente por telefone + senha. No primeiro acesso, o cadastro da senha exige o código de 6 dígitos enviado por WhatsApp/SMS, com validade de 10 min, até 5 tentativas e reenvio após 60 s. No modo de desenvolvimento, o código aparece no console e no log de notificações.
- **R31** — No MVP, o agendamento pela página pública **não exige** senha: basta nome + telefone, como na referência. A senha é exigida para ver o histórico.
- **R32** — Senhas são guardadas com hash (scrypt), e as sessões em cookie httpOnly com validade de 30 dias.
- **R33** — Os dados de exemplo são fictícios. Nenhum dado real da referência é usado.
- **R34 · Pixel (LGPD)** — O pixel de campanha configurado pela empresa só é carregado depois que o visitante vê e aceita o aviso de privacidade.

## 7. Agendamento público sem login (v3)
- **R35 · Sem preferência** — Quando o serviço tem mais de um profissional, o cliente pode escolher "Sem preferência". Os dias e horários mostrados são a união dos horários livres dos profissionais elegíveis (R7/R7b). Ao confirmar, o sistema checa de novo, dentro da transação, quem está livre naquele horário e escolhe quem tem **menos atendimentos no dia**. Se ninguém estiver livre, responde 409 (R10).
- **R36 · Gerenciar pelo link** — Cada agendamento tem um token secreto (`token_publico`, 32 caracteres). O link `/{slug}/agendamento/{id}?t={token}` permite ver, remarcar e cancelar **sem login**, com as mesmas regras de prazo (R22/R23). O token só vale para aquele agendamento e só dentro da empresa do slug. Token errado devolve 404, sem revelar se o agendamento existe.
- **R37 · Comprovante** — Após confirmar, o cliente pode baixar um `.ics` (com lembrete 2 h antes) ou abrir o Google Agenda. A mensagem "Enviamos a confirmação no WhatsApp" só aparece quando há provedor de WhatsApp configurado.
- **R38 · Dados no aparelho** — Nome e telefone podem ser lembrados **no próprio aparelho** (localStorage) para o próximo agendamento. Nada é enviado ao servidor antes de confirmar.

## 8. Importação de clientes (v3)
- **R39 · Etapas** — enviar arquivo → mapear colunas → revisar → confirmar. Nada é gravado em `cliente` antes da confirmação. O arquivo fica num rascunho (`importacao.linhas`) e **os dados brutos são apagados** ao concluir ou cancelar; fica só o resumo.
- **R40 · Formatos** — CSV (separador `;` `,` `|` ou tab, detectado sozinho; UTF-8 ou Windows-1252) e Excel `.xlsx`. Limite: 5 MB e 10.000 linhas. `.xls` antigo é recusado com orientação.
- **R41 · Campos** — Nome e telefone são obrigatórios. E-mail, nascimento, CPF e observações são opcionais: um valor inválido em campo opcional é **descartado com aviso**, e o cliente entra assim mesmo. Uma linha sem nome ou sem telefone válido é **rejeitada**. Se o telefone vier sem DDD, aplica-se o "DDD padrão" informado.
- **R42 · Duplicados** — O telefone identifica o cliente. No mesmo arquivo, só a 1ª ocorrência entra. Para quem já existe no banco, a política padrão é **manter como está**. A opção "completar" só preenche e-mail, observações, nascimento e CPF **que estiverem vazios**: nome e dados existentes nunca são sobrescritos.
- **R43 · Permissão** — Só os papéis `dono` e `admin` importam. Tudo roda no servidor com `empresa_id` da sessão. No Supabase, a RLS deixa o gestor ver o histórico de importações, mas nunca os dados brutos.
- **R44 · O que não é importado** — histórico de atendimentos, pagamentos, pacotes e assinaturas, senhas, cartões e fotos. A tela informa isso antes do envio.
- **R45 · Integrações por API** — A estrutura (`src/lib/importacao/fontes.ts`) aceita conectores futuros que devolvem o mesmo formato de planilha. Nenhum está implementado, e a tela diz isso.

## 9. CRM e relatórios (v3)
- **R46 · Filtros** — período (hoje, 7 dias, 30 dias, este mês, mês passado, personalizado), serviço, profissional, status e cliente (nome/telefone). Os filtros ficam na URL, então dá para compartilhar ou salvar a visão.
- **R47 · Indicadores** — faturamento realizado (concluídos), receita prevista (confirmados + concluídos), agendamentos (sem cancelados), ticket médio (realizado ÷ concluídos), clientes novos e taxa de cancelamentos + faltas. A variação é comparada com o período anterior de mesmo tamanho; sem base de comparação, não se mostra porcentagem.
- **R48 · Segmentos de clientes** — com horário marcado, sem visita há 45+ dias (sem horário futuro), novos (30 dias) e importados.
- **R49 · Exportação** — o CSV de agendamentos respeita os filtros e é protegido contra *CSV injection*: células que começam com `= + - @` ganham apóstrofo na frente.
