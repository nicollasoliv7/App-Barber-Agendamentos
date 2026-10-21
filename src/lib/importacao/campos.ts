/** Campos de destino da importação (compartilhado entre servidor e tela). */

export const CAMPOS = [
  { id: "nome", rotulo: "Nome", obrigatorio: true, dica: "Nome completo ou primeiro nome" },
  { id: "sobrenome", rotulo: "Sobrenome", obrigatorio: false, dica: "Se o sistema antigo separa nome e sobrenome" },
  { id: "telefone", rotulo: "Telefone / WhatsApp", obrigatorio: true, dica: "Com DDD; identifica o cliente" },
  { id: "email", rotulo: "E-mail", obrigatorio: false, dica: "" },
  { id: "nascimento", rotulo: "Data de nascimento", obrigatorio: false, dica: "dd/mm/aaaa, aaaa-mm-dd ou data do Excel" },
  { id: "cpf", rotulo: "CPF", obrigatorio: false, dica: "Só CPFs válidos são importados" },
  { id: "observacoes", rotulo: "Observações", obrigatorio: false, dica: "Preferências, alergias, anotações" },
] as const;
export type CampoId = (typeof CAMPOS)[number]["id"];
export type Mapeamento = Partial<Record<CampoId, number>>;
export type Politica = "manter" | "completar";

/** O que NÃO dá para importar (mostrado na tela, para não criar expectativa falsa). */
export const NAO_IMPORTAVEL = [
  "Histórico de agendamentos e atendimentos passados",
  "Pagamentos, saldos, pacotes e assinaturas",
  "Senhas e logins dos clientes (por segurança, cada cliente cria o próprio acesso)",
  "Cartões salvos",
  "Fotos e anexos",
];

