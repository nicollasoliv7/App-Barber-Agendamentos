import "server-only";
import { q, q1, tx } from "../db";
import { notificar } from "../notificacoes";

/**
 * Leitura e gravação da conexão de WhatsApp da barbearia (tabela whatsapp_conexao).
 * Credenciais saem daqui sempre CIFRADAS; quem decifra é src/lib/whatsapp.ts, no servidor.
 */

export const credenciaisAtuais = (empresaId: string) =>
  q1<{ token_cifrado: string; app_secret_cifrado: string | null }>(`select token_cifrado, app_secret_cifrado from whatsapp_conexao where empresa_id = $1`, [empresaId]);

/** O número já está ligado a OUTRA barbearia? */
export async function numeroEmOutraEmpresa(phoneNumberId: string, empresaId: string): Promise<boolean> {
  const outra = await q1(`select 1 from whatsapp_conexao where phone_number_id = $1 and empresa_id <> $2`, [phoneNumberId, empresaId]);
  return !!outra;
}

/** Cria ou substitui a conexão (o App Secret antigo é mantido se não vier um novo). */
export async function gravarConexao(
  empresaId: string,
  d: { phoneNumberId: string; wabaId: string; numero: string | null; nome: string | null; tokenCifrado: string; appSecretCifrado: string | null },
) {
  await q(
    `insert into whatsapp_conexao (empresa_id, phone_number_id, waba_id, numero_exibicao, nome_verificado, token_cifrado, app_secret_cifrado, status, ultimo_erro, verificado_em)
       values ($1,$2,$3,$4,$5,$6,$7,'conectado',null,now())
       on conflict (empresa_id) do update set phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id,
         numero_exibicao = excluded.numero_exibicao, nome_verificado = excluded.nome_verificado, token_cifrado = excluded.token_cifrado,
         app_secret_cifrado = coalesce(excluded.app_secret_cifrado, whatsapp_conexao.app_secret_cifrado),
         status = 'conectado', ultimo_erro = null, verificado_em = now()`,
    [empresaId, d.phoneNumberId, d.wabaId, d.numero, d.nome, d.tokenCifrado, d.appSecretCifrado],
  );
}

export const credenciaisParaVerificar = (empresaId: string) =>
  q1<{ phone_number_id: string; waba_id: string; token_cifrado: string }>(
    `select phone_number_id, waba_id, token_cifrado from whatsapp_conexao where empresa_id = $1`,
    [empresaId],
  );

export async function marcarConexaoOk(empresaId: string, numero: string | null, nome: string | null) {
  await q(
    `update whatsapp_conexao set status = 'conectado', ultimo_erro = null, verificado_em = now(), numero_exibicao = $2, nome_verificado = $3 where empresa_id = $1`,
    [empresaId, numero, nome],
  );
}

export async function marcarConexaoErro(empresaId: string, msg: string) {
  await q(`update whatsapp_conexao set status = 'erro', ultimo_erro = $2, verificado_em = now() where empresa_id = $1`, [empresaId, msg]);
}

export const credenciaisDaWaba = (empresaId: string) =>
  q1<{ waba_id: string; token_cifrado: string }>(`select waba_id, token_cifrado from whatsapp_conexao where empresa_id = $1`, [empresaId]);

export interface ModelosConexao {
  idioma: string;
  confirmacao: string | null;
  confirmacaoParams: number | null;
  lembrete: string | null;
  lembreteParams: number | null;
  codigo: string | null;
  codigoBotao: boolean;
  lembretesAtivos: boolean;
  cobranca: string | null;
  cobrancaParams: number | null;
  cobrancasAtivas: boolean;
  cobrancaDiasAntes: number;
  cobrancaDiasDepois: number;
}

export async function gravarModelos(empresaId: string, m: ModelosConexao) {
  await q(
    `update whatsapp_conexao
       set idioma = $2, modelo_confirmacao = $3, modelo_confirmacao_params = $4,
           modelo_lembrete = $5, modelo_lembrete_params = $6,
           modelo_codigo = $7, modelo_codigo_botao = $8, lembretes_ativos = $9,
           modelo_cobranca = $10, modelo_cobranca_params = $11,
           cobrancas_ativas = $12, cobranca_dias_antes = $13, cobranca_dias_depois = $14
       where empresa_id = $1`,
    [
      empresaId, m.idioma, m.confirmacao, m.confirmacaoParams, m.lembrete, m.lembreteParams,
      m.codigo, m.codigoBotao, m.lembretesAtivos,
      m.cobranca, m.cobrancaParams, m.cobrancasAtivas, m.cobrancaDiasAntes, m.cobrancaDiasDepois,
    ],
  );
}

export const estadoParaTeste = (empresaId: string) =>
  q1<{ status: string; modelo_confirmacao: string | null }>(`select status, modelo_confirmacao from whatsapp_conexao where empresa_id = $1`, [empresaId]);

/** Quantos testes a barbearia enviou nos últimos 10 minutos (limite anti-abuso). */
export async function testesRecentes(empresaId: string): Promise<number> {
  const [{ n }] = await q<{ n: number }>(
    `select count(*)::int as n from notificacao where empresa_id = $1 and tipo = 'teste' and criado_em > now() - interval '10 minutes'`,
    [empresaId],
  );
  return n;
}

/** Registra e despacha a mensagem de teste; devolve o resultado REAL do envio. */
export async function enviarMensagemTeste(empresaId: string, telefone: string, mensagem: string, parametros: string[]) {
  const id = await tx((t) => notificar(t, { empresaId, destino: telefone, tipo: "teste", mensagem, parametros }));
  return q1<{ status: string; erro: string | null }>(`select status, erro from notificacao where id = $1`, [id]);
}

export async function apagarConexao(empresaId: string) {
  await q(`delete from whatsapp_conexao where empresa_id = $1`, [empresaId]);
}
