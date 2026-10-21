# MAPA DE TELAS

Marca própria do nosso app: **Agendou**. Este mapa descreve **funcionalidades** observadas na plataforma de referência. Ele não copia textos, marca ou código dela.

Legenda: ✅ observado · 🟡 inferido / a confirmar quando o dono fizer login no painel.

---

## A. Página pública de agendamento (`/{slug-da-empresa}`) ✅

Stack observada: PHP + jQuery + AdminLTE, endpoints AJAX `*.ajax.php`.

### A1. Vitrine de serviços
- Cabeçalho com logo da empresa e cores do tema da empresa (carregadas via endpoint de cores).
- Lista de serviços em cards: **nome**, **preço**, **duração em minutos**, observação opcional (ex.: "já inclui corte").
- Navegação inferior fixa: **Agendar** | **Histórico**.
- Banner de cookies / política de privacidade / termos de uso, com aceite obrigatório antes de interagir.
- Seleção de unidade, quando a empresa é multi-unidade (`verifyMultiunidade`).
- Registro de acesso (analytics) e pixel de campanha opcional por empresa.

### A2. Modal de agendamento (ao tocar num serviço)
Passos em sequência, cada um carregado por um endpoint de leitura:
1. **Serviço**: título, imagem e descrição do serviço (`pegarServico`).
2. **Profissional**: lista dos profissionais que fazem o serviço (`pegarProfissionais`).
3. **Dia**: dias disponíveis (`pegarDias`).
4. **Horário**: horários livres do profissional no dia, considerando a duração (`pegarHoras`).
5. **Resumo**: serviço, profissional, data e hora.
6. **Formulário**: nome e sobrenome, telefone com máscara, **campos personalizados** configuráveis pela empresa (CPF, CNPJ, data de nascimento, descrição), botão **AGENDAR**.

### A3. Identificação do cliente (modal)
- Pergunta o telefone. Se o número não estiver cadastrado, abre o cadastro.
- Alternância entre **Usuário** e **Administrador** (o dono também entra por aqui).
- Senha, com opção "mostrar senha" e "esqueci minha senha".
- Cadastro em etapas: e-mail, senha + confirmação, **código de confirmação** enviado por WhatsApp/SMS, reenvio após 60 s.
- Login biométrico opcional (WebAuthn).

### A4. Pagamento do agendamento (modal de cobrança)
- Mostra serviço, profissional, data, valor.
- Abas **Cartão** | **Pix**.
- Cartão: lista de cartões salvos, cadastrar, favoritar e excluir cartão; tokenização.
- Valor **mínimo** (sinal) ou **integral**, conforme a configuração da empresa.
- Pix: gerar cobrança, QR Code, copia-e-cola, **contador regressivo (5 min)**, "confirmar pagamento" (consulta de status) e cancelar pagamento.
- Expirou o tempo: cancelamento automático do agendamento pendente.
- Modalidade de pagamento por empresa: **desativado**, **opcional** ou **obrigatório**.

### A5. Histórico do cliente (aba Histórico)
- Lista de agendamentos (próximos e passados), com "ver mais" (paginação).
- Por agendamento: status, serviço, profissional, data e hora, valor, situação do pagamento.
- **Remarcar**: horário antigo × novo, navegação por semana, escolha de dia e hora.
- **Cancelar**, com confirmação.
- Pagar a cobrança pendente a partir do histórico.
- **Desconectar** (logout).

### A6. Notificações
- Aviso por WhatsApp ao confirmar o agendamento (`avisarWhats`).
- Envio de código por SMS/WhatsApp.

---

## B. Painel do assinante (`/painel`) 🟡

> O painel pediu login em 21/10/2026. Pelas regras do projeto, não tentamos entrar. A lista abaixo foi inferida das funções e endpoints que a página pública expõe e do escopo pedido nas instruções. **Revisar quando o dono fizer login.**

| # | Tela | Conteúdo principal |
|---|------|--------------------|
| B1 | Login | E-mail + senha, lembrar senha |
| B2 | **Agenda** (tela inicial) | Visão dia/semana por profissional, criar agendamento manual, mudar status (confirmado, concluído, faltou, cancelado), bloquear horário |
| B3 | Clientes | Lista com busca, ficha (contato, histórico, total gasto), editar |
| B4 | Serviços | CRUD: nome, descrição, preço, duração, imagem, ativo, ordem, profissionais que fazem |
| B5 | Profissionais | CRUD: nome, foto, telefone, serviços, comissão (%), ativo |
| B6 | Horários de funcionamento | Por profissional e dia da semana: início, fim, intervalo |
| B7 | Folgas / bloqueios | Bloqueio de período (dia inteiro ou faixa de horário) por profissional ou empresa |
| B8 | Comissões | Relatório por profissional e período: serviços realizados × % |
| B9 | Financeiro | Recebimentos (Pix/cartão/local), filtro por período, totais |
| B10 | Relatórios | Agendamentos por período, por serviço, por profissional, taxa de cancelamento |
| B11 | Configurações da empresa | Nome, slug, endereço + link do Maps, WhatsApp, logo, **cores do tema**, campos personalizados, pixel de campanha |
| B12 | Regras de agendamento | Antecedência mínima, janela máxima, intervalo entre horários, política de cancelamento/remarcação |
| B13 | Pagamentos | Modalidade (desativado/opcional/obrigatório), sinal (%) ou integral, prazo do Pix |
| B14 | Notificações | Mensagens de confirmação e lembrete via WhatsApp (log de envios) |
| B15 | Unidades | Multi-unidade: cadastro de unidades e vínculo de profissionais |
| B16 | Plano / assinatura | Plano atual da plataforma, faturas (fora do MVP) |

---

## C. Endpoints observados (referência funcional)

| Área | Endpoint (original) | Equivalente no nosso app |
|---|---|---|
| Catálogo | pegarServico, pegarProfissionais, pegarDias, pegarHoras | `GET /api/public/[slug]/...` |
| Empresa | getEmpresa, getInfoEmpresa, getColors, loadColors | `GET /api/public/[slug]` |
| Campos | getCampos | incluído em `GET /api/public/[slug]` |
| Cliente | verifyTel, verifyPass, registerPass, sendSMS, verifyCode | `/api/public/auth/*` |
| Agendamento | confirmarAgendamento, caputrarAgendamentoPendente | `POST /api/public/[slug]/agendamentos` |
| Histórico | pegarAgendamentos, showMoreAgendamentos, remarcarHorario, cancelarAgendamento | `/api/cliente/agendamentos/*` |
| Pagamento | pagamento_pix, getCobrancaPix, conferirPagamento, cancelarCobrancaTempoExpirado, cards, saveCard, deleteCard, favoritingCard, tokenCard | `/api/pagamentos/*` (sandbox) |
| Notificação | avisarWhats | `lib/notificacoes` (fila + log) |
| Analytics | salvarAcesso, getCampanhaPixel | fora do MVP |
