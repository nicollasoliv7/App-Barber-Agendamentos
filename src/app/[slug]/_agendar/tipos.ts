/** Tipos compartilhados pelas etapas do agendamento público. */

export type Prof = { id: string; nome: string };

export type Criado = {
  id: string;
  status: string;
  inicio: string;
  fim: string;
  preco_centavos: number;
  /** quanto o cliente paga (menor que o preço quando o plano mensal dele cobre o serviço) */
  valor_a_pagar?: number;
  profissional: string | null;
  token: string;
  gerenciar: string;
  /** status real da confirmação automática por WhatsApp (null = não gerada ainda) */
  whatsapp?: string | null;
};

export type Etapa = "servico" | "profissional" | "horario" | "dados" | "pagamento" | "pronto";

export const QUALQUER: Prof = { id: "qualquer", nome: "Sem preferência" };
