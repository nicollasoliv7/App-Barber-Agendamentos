/** Agendamento como a área "Meus agendamentos" recebe da API do cliente. */
export type Ag = {
  id: string;
  inicio: string;
  status: string;
  preco_centavos: number;
  servico: string;
  profissional: string;
  pago_centavos: number;
  token: string;
  pode_cancelar: boolean;
  pode_remarcar: boolean;
  cancelado_por: string | null;
};
