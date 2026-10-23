/**
 * Textos das mensagens de WhatsApp e links "wa.me" (envio manual pelo app do barbeiro).
 * Ordem das variáveis dos modelos aprovados na Meta (confirmação e lembrete):
 *   {{1}} primeiro nome do cliente · {{2}} barbearia · {{3}} serviço · {{4}} profissional
 *   {{5}} data e hora · {{6}} link para remarcar/cancelar (opcional)
 */

export interface DadosMensagem {
  cliente: string;
  empresa: string;
  servico: string;
  profissional: string;
  quando: string;
  link?: string | null;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

export function parametrosModelo(d: DadosMensagem): string[] {
  return [primeiroNome(d.cliente), d.empresa, d.servico, d.profissional, d.quando, d.link ?? "-"];
}

export function textoConfirmacao(d: DadosMensagem): string {
  return `Olá, ${primeiroNome(d.cliente)}! Seu horário na ${d.empresa} está confirmado: ${d.servico} com ${d.profissional}, ${d.quando}.${
    d.link ? ` Para remarcar ou cancelar: ${d.link}` : ""
  }`;
}

export function textoLembrete(d: DadosMensagem): string {
  return `Lembrete: ${primeiroNome(d.cliente)}, seu horário de ${d.servico} com ${d.profissional} na ${d.empresa} é ${d.quando}.${
    d.link ? ` Precisa remarcar? ${d.link}` : ""
  }`;
}

/** Link que abre o WhatsApp (app ou web) com a mensagem pronta. Telefone BR só com dígitos. */
export function linkWhatsapp(telefone: string, texto: string): string {
  const d = telefone.replace(/\D/g, "");
  const intl = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${intl}?text=${encodeURIComponent(texto)}`;
}
