"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, q1, tx } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { notificar } from "@/lib/notificacoes";
import { parametrosModelo, textoConfirmacao } from "@/lib/mensagens";
import { formatarDataHora, somarDias } from "@/lib/tempo";
import { normalizarTelefone } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";
import { cifrar, criptografiaPronta, decifrar, ErroMeta, verificarCredenciais, verificarModelo } from "@/lib/whatsapp";
import type { Estado } from "./acoes";
import { log } from "@/lib/log";

/** Só dono/admin mexem na integração. Tudo sempre restrito à empresa do usuário logado. */
async function gestor() {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  if (u.papel !== "dono" && u.papel !== "admin") throw new ErroNegocio("Só o dono ou um administrador pode alterar a integração com o WhatsApp.", 403);
  return u;
}

async function executar(fn: () => Promise<string>): Promise<Estado> {
  try {
    const ok = await fn();
    revalidatePath("/painel", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErroNegocio || e instanceof ErroMeta) return { erro: e.message };
    log.erro("[whatsapp]", e);
    return { erro: "Não foi possível concluir. Tente novamente." };
  }
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ID_META = /^\d{5,25}$/;
const NOME_MODELO = /^[a-z0-9_]{1,512}$/;

export async function conectarWhatsapp(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    if (!criptografiaPronta())
      throw new ErroNegocio("O servidor ainda não está pronto para guardar credenciais (falta WHATSAPP_CHAVE_CRIPTO). Peça ao administrador da plataforma.");
    const phoneNumberId = txt(f, "phone_number_id");
    const wabaId = txt(f, "waba_id");
    const tokenNovo = txt(f, "token");
    const appSecretNovo = txt(f, "app_secret");
    if (!ID_META.test(phoneNumberId)) throw new ErroNegocio("Phone Number ID inválido (só números, como aparece no painel da Meta)");
    if (!ID_META.test(wabaId)) throw new ErroNegocio("WABA ID inválido (só números)");

    const atual = await q1<{ token_cifrado: string; app_secret_cifrado: string | null }>(
      `select token_cifrado, app_secret_cifrado from whatsapp_conexao where empresa_id = $1`,
      [u.empresa_id],
    );
    if (!tokenNovo && !atual) throw new ErroNegocio("Informe o token de acesso");
    if (tokenNovo && (tokenNovo.length < 20 || /\s/.test(tokenNovo))) throw new ErroNegocio("Token de acesso inválido");
    const token = tokenNovo || decifrar(atual!.token_cifrado);

    const outra = await q1(`select 1 from whatsapp_conexao where phone_number_id = $1 and empresa_id <> $2`, [phoneNumberId, u.empresa_id]);
    if (outra) throw new ErroNegocio("Este número já está conectado a outra barbearia.");

    const info = await verificarCredenciais(phoneNumberId, wabaId, token); // lança ErroMeta com o motivo

    await q(
      `insert into whatsapp_conexao (empresa_id, phone_number_id, waba_id, numero_exibicao, nome_verificado, token_cifrado, app_secret_cifrado, status, ultimo_erro, verificado_em)
       values ($1,$2,$3,$4,$5,$6,$7,'conectado',null,now())
       on conflict (empresa_id) do update set phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id,
         numero_exibicao = excluded.numero_exibicao, nome_verificado = excluded.nome_verificado, token_cifrado = excluded.token_cifrado,
         app_secret_cifrado = coalesce(excluded.app_secret_cifrado, whatsapp_conexao.app_secret_cifrado),
         status = 'conectado', ultimo_erro = null, verificado_em = now()`,
      [u.empresa_id, phoneNumberId, wabaId, info.numero, info.nome, cifrar(token), appSecretNovo ? cifrar(appSecretNovo) : null],
    );
    return `Conectado: ${info.numero ?? phoneNumberId}${info.nome ? ` (${info.nome})` : ""}`;
  });
}

export async function verificarWhatsapp(_: Estado, f: FormData): Promise<Estado> {
  void f;
  return executar(async () => {
    const u = await gestor();
    const c = await q1<{ phone_number_id: string; waba_id: string; token_cifrado: string }>(
      `select phone_number_id, waba_id, token_cifrado from whatsapp_conexao where empresa_id = $1`,
      [u.empresa_id],
    );
    if (!c) throw new ErroNegocio("Nenhum número conectado");
    try {
      const info = await verificarCredenciais(c.phone_number_id, c.waba_id, decifrar(c.token_cifrado));
      await q(
        `update whatsapp_conexao set status = 'conectado', ultimo_erro = null, verificado_em = now(), numero_exibicao = $2, nome_verificado = $3 where empresa_id = $1`,
        [u.empresa_id, info.numero, info.nome],
      );
      return "Conexão funcionando";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao verificar";
      await q(`update whatsapp_conexao set status = 'erro', ultimo_erro = $2, verificado_em = now() where empresa_id = $1`, [u.empresa_id, msg]);
      revalidatePath("/painel", "layout");
      throw e;
    }
  });
}

export async function salvarModelosWhatsapp(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const c = await q1<{ waba_id: string; token_cifrado: string }>(`select waba_id, token_cifrado from whatsapp_conexao where empresa_id = $1`, [u.empresa_id]);
    if (!c) throw new ErroNegocio("Conecte um número antes de configurar os modelos");
    const idioma = txt(f, "idioma") || "pt_BR";
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(idioma)) throw new ErroNegocio("Idioma inválido (ex.: pt_BR)");
    const token = decifrar(c.token_cifrado);

    const conferir = async (campo: string, rotulo: string) => {
      const nome = txt(f, campo).toLowerCase();
      if (!nome) return null;
      if (!NOME_MODELO.test(nome)) throw new ErroNegocio(`${rotulo}: o nome do modelo só pode ter letras minúsculas, números e _`);
      try {
        return { nome, ...(await verificarModelo(c.waba_id, token, nome, idioma)) };
      } catch (e) {
        if (e instanceof ErroMeta) throw new ErroMeta(`${rotulo}: ${e.message}`, e.codigo);
        throw e;
      }
    };
    const conf = await conferir("modelo_confirmacao", "Confirmação");
    const lem = await conferir("modelo_lembrete", "Lembrete");
    const cod = await conferir("modelo_codigo", "Código de verificação");
    for (const [m, r] of [
      [conf, "Confirmação"],
      [lem, "Lembrete"],
    ] as const)
      if (m && m.params > 6) throw new ErroNegocio(`${r}: o modelo tem ${m.params} variáveis; o máximo suportado é 6`);
    if (cod && cod.params !== 1) throw new ErroNegocio("Código de verificação: o modelo precisa ter exatamente 1 variável (o código)");
    const lembretes = f.get("lembretes_ativos") === "on";
    if (lembretes && !lem) throw new ErroNegocio("Para ligar os lembretes automáticos, informe um modelo de lembrete aprovado");

    await q(
      `update whatsapp_conexao set idioma = $2, modelo_confirmacao = $3, modelo_confirmacao_params = $4, modelo_lembrete = $5, modelo_lembrete_params = $6,
         modelo_codigo = $7, modelo_codigo_botao = $8, lembretes_ativos = $9
       where empresa_id = $1`,
      [u.empresa_id, idioma, conf?.nome ?? null, conf?.params ?? null, lem?.nome ?? null, lem?.params ?? null, cod?.nome ?? null, cod?.botaoCodigo ?? false, lembretes],
    );
    const ok = [conf && "confirmação", lem && "lembrete", cod && "código"].filter(Boolean);
    return ok.length ? `Modelos aprovados e salvos: ${ok.join(", ")}` : "Modelos removidos: nenhuma mensagem automática será enviada";
  });
}

export async function enviarTesteWhatsapp(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const telefone = normalizarTelefone(txt(f, "telefone"));
    if (!telefone) throw new ErroNegocio("Informe o celular com DDD");
    const c = await q1<{ status: string; modelo_confirmacao: string | null }>(`select status, modelo_confirmacao from whatsapp_conexao where empresa_id = $1`, [u.empresa_id]);
    if (!c) throw new ErroNegocio("Conecte um número antes de enviar o teste");
    const [{ n }] = await q<{ n: number }>(
      `select count(*)::int as n from notificacao where empresa_id = $1 and tipo = 'teste' and criado_em > now() - interval '10 minutes'`,
      [u.empresa_id],
    );
    if (n >= 5) throw new ErroNegocio("Muitos testes seguidos. Aguarde alguns minutos.");
    const exemplo = {
      cliente: "Cliente Teste",
      empresa: u.empresa_nome,
      servico: "Corte",
      profissional: "Barbeiro",
      quando: formatarDataHora(new Date(`${somarDias(new Date().toISOString().slice(0, 10), 1)}T13:00:00Z`)),
      link: null,
    };
    const id = await tx((t) =>
      notificar(t, {
        empresaId: u.empresa_id,
        destino: telefone,
        tipo: "teste",
        mensagem: c.modelo_confirmacao ? `[teste] ${textoConfirmacao(exemplo)}` : "[teste] modelo hello_world da Meta",
        parametros: parametrosModelo(exemplo),
      }),
    );
    const r = await q1<{ status: string; erro: string | null }>(`select status, erro from notificacao where id = $1`, [id]);
    if (r?.status === "aceito") return "A Meta aceitou a mensagem de teste. Acompanhe a entrega em Notificações.";
    throw new ErroNegocio(`Teste não enviado: ${r?.erro ?? "motivo desconhecido"}`);
  });
}

export async function desconectarWhatsapp(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    if (f.get("confirmo") !== "on") throw new ErroNegocio("Marque a confirmação para desconectar");
    await q(`delete from whatsapp_conexao where empresa_id = $1`, [u.empresa_id]);
    return "Número desconectado. As credenciais foram apagadas.";
  });
}
