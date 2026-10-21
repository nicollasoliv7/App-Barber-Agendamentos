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

## 3. Pagamento (somente sandbox)
- **R15 · Modalidades** — `desativado`: sem cobrança online. `opcional`: o cliente pode pagar agora ou no local. `obrigatorio`: sem pagamento aprovado dentro do prazo, o agendamento é cancelado.
- **R16 · Valor** — `minimo` = ⌈preço × pagamento_minimo_pct / 100⌉. `integral` = preço. Em `cliente_escolhe`, o cliente escolhe entre os dois.
- **R17 · Pix** — A cobrança tem `expira_em = agora + pix_expiracao_min`. A tela mostra o QR Code, o copia-e-cola e um contador. Só existe uma cobrança Pix pendente por agendamento: gerar outra cancela a anterior.
- **R18 · Expiração** — Uma cobrança `pendente` com `expira_em` no passado vira `expirada`. Se o agendamento estava `pendente_pagamento`, ele vira `cancelado` (`cancelado_por = sistema`) e o horário é liberado. A regra roda de forma preguiçosa (em toda consulta de disponibilidade e de status) e também por varredura (`/api/cron/expirar`).
- **R19 · Aprovação** — Pagamento aprovado → `pagamento.status = pago` e agendamento `pendente_pagamento` → `confirmado`. No sandbox, a aprovação é simulada por um botão "simular pagamento" ou pelo webhook de teste.
- **R20 · Cartão** — Só guardamos o token, a bandeira, os 4 últimos dígitos e a validade. Nunca o número completo nem o CVV. O cliente tem um cartão favorito por vez.

## 4. Remarcação e cancelamento (cliente)
- **R21** — O cliente só vê e mexe nos próprios agendamentos (sessão por telefone verificado).
- **R22 · Cancelar** — Permitido em `confirmado` ou `pendente_pagamento`, até `cancelamento_ate_min` (120) antes do início. Depois disso, só a empresa cancela.
- **R23 · Remarcar** — Mesmas condições de prazo do R22. O novo horário passa pelas regras R1 a R5 e R10, com o mesmo serviço e o mesmo profissional (como na referência). Na prática, atualiza `inicio` e `fim` do próprio agendamento e registra o horário antigo na notificação.
- **R24** — Valor pago num agendamento cancelado pelo cliente: o estorno é manual pela empresa (fora do MVP). Fica registrado como pendência no financeiro.

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
