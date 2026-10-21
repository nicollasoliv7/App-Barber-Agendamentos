export type StatusAgendamento = "pendente_pagamento" | "confirmado" | "concluido" | "cancelado" | "faltou";

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  telefone_whatsapp: string | null;
  endereco: string | null;
  maps_url: string | null;
  logo_url: string | null;
  multiunidade: boolean;
  pixel_campanha: string | null;
}

export interface ConfigAgendamento {
  empresa_id: string;
  intervalo_slots_min: number;
  antecedencia_min_min: number;
  janela_max_dias: number;
  cancelamento_ate_min: number;
  remarcacao_ate_min: number;
  pagamento_modo: "desativado" | "opcional" | "obrigatorio";
  pagamento_tipo: "minimo" | "integral" | "cliente_escolhe";
  pagamento_minimo_pct: number;
  pix_expiracao_min: number;
  fuso_horario: string;
}

export interface ConfigTema {
  empresa_id: string;
  cor_primaria: string;
  cor_secundaria: string;
  cor_fundo: string;
  cor_texto: string;
  modo: "claro" | "escuro";
}

export interface Servico {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  observacao: string | null;
  preco_centavos: number;
  duracao_min: number;
  imagem_url: string | null;
  ativo: boolean;
  ordem: number;
}

export interface Profissional {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  nome: string;
  foto_url: string | null;
  telefone: string | null;
  comissao_pct: number;
  ativo: boolean;
}

export interface CampoPersonalizado {
  id: string;
  empresa_id: string;
  chave: string;
  rotulo: string;
  tipo: "texto" | "cpf" | "cnpj" | "data" | "textarea";
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
}

export interface Agendamento {
  id: string;
  empresa_id: string;
  cliente_id: string;
  profissional_id: string;
  servico_id: string;
  inicio: Date;
  fim: Date;
  preco_centavos: number;
  status: StatusAgendamento;
  origem: "publico" | "painel";
  cancelado_por: "cliente" | "empresa" | "sistema" | null;
  expira_em: Date | null;
  remarcado_de: string | null;
  token_publico: string;
  observacao: string | null;
  criado_em: Date;
}

export class ErroNegocio extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
