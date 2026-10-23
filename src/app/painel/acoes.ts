"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encerrarSessao, loginPainel, usuarioPainel } from "@/lib/sessao";
import { criarAgendamento, mudarStatusPelaEmpresa } from "@/lib/agendamentos";
import { instanteLocal, paraMinutos } from "@/lib/tempo";
import { ErroNegocio } from "@/lib/tipos";
import { configAgendamento } from "@/lib/empresa";
import { isUuid, normalizarTelefone } from "@/lib/validacao";
import { log } from "@/lib/log";
import { estornarPagamentosCancelado, registrarRecebimentoLocal } from "@/lib/pagamentos";
import { atualizarServico, criarServico } from "@/lib/repositorios/servicos";
import { salvarProfissionalDados } from "@/lib/repositorios/profissionais";
import { adicionarFaixas, criarBloqueio, removerBloqueioDaEmpresa, removerFaixaDaEmpresa } from "@/lib/repositorios/horarios";
import { atualizarCampo, atualizarEmpresa, atualizarRegras, atualizarTema, atualizarUnidade, criarCampo, criarUnidade } from "@/lib/repositorios/configuracoes";
import { atualizarCliente, cadastrarCliente } from "@/lib/repositorios/clientes";

export type Estado = { erro?: string; ok?: string } | undefined;

async function exigirUsuario() {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  return u;
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "").replace(",", "."));
const reaisParaCentavos = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

async function executar(fn: () => Promise<string | void>, caminho = "/painel"): Promise<Estado> {
  try {
    const msg = await fn();
    revalidatePath(caminho, "layout");
    return { ok: msg || "Salvo" };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("duplicate key") || m.includes("unique")) return { erro: "Já existe um registro com esse valor" };
    if (m.includes("check constraint")) return { erro: "Valor fora do permitido" };
    log.erro(e);
    return { erro: "Não foi possível salvar" };
  }
}

// ---------- Sessão ----------

export async function entrar(_: Estado, f: FormData): Promise<Estado> {
  try {
    await loginPainel(txt(f, "telefone"), String(f.get("senha") ?? ""));
  } catch (e) {
    return { erro: e instanceof ErroNegocio ? e.message : "Falha ao entrar" };
  }
  redirect("/painel");
}

export async function sair() {
  await encerrarSessao("painel");
  redirect("/painel/login");
}

// ---------- Agenda ----------

export async function novoAgendamentoManual(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    await criarAgendamento({
      empresaId: u.empresa_id,
      servicoId: txt(f, "servico"),
      profissionalId: txt(f, "profissional"),
      dia: txt(f, "dia"),
      hora: txt(f, "hora"),
      nome: txt(f, "nome"),
      telefone: txt(f, "telefone"),
      origem: "painel",
      observacao: txt(f, "observacao") || undefined,
    });
    return "Agendamento criado";
  });
}

export async function mudarStatus(f: FormData) {
  const u = await exigirUsuario();
  const id = txt(f, "id");
  const status = txt(f, "status") as "confirmado" | "concluido" | "faltou" | "cancelado";
  if (!isUuid(id) || !["confirmado", "concluido", "faltou", "cancelado"].includes(status)) return;
  await mudarStatusPelaEmpresa(u.empresa_id, id, status);
  revalidatePath("/painel", "layout");
}

export async function registrarPagamentoLocal(f: FormData) {
  const u = await exigirUsuario();
  const id = txt(f, "id");
  if (!isUuid(id)) return;
  await registrarRecebimentoLocal(u.empresa_id, id);
  revalidatePath("/painel", "layout");
}

// ---------- Serviços ----------

export async function salvarServico(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    const nome = txt(f, "nome");
    const preco = reaisParaCentavos(txt(f, "preco"));
    const dur = num(f, "duracao");
    if (!nome) throw new ErroNegocio("Informe o nome");
    if (!Number.isFinite(preco) || preco < 0) throw new ErroNegocio("Preço inválido");
    if (!Number.isInteger(dur) || dur < 5 || dur > 600) throw new ErroNegocio("Duração entre 5 e 600 minutos");
    const dados = {
      nome,
      descricao: txt(f, "descricao") || null,
      observacao: txt(f, "observacao") || null,
      preco_centavos: preco,
      duracao_min: dur,
      ativo: f.get("ativo") === "on",
      ordem: num(f, "ordem") || 0,
      imagem_url: txt(f, "imagem_url") || null,
    };
    if (isUuid(id)) await atualizarServico(u.empresa_id, id, dados);
    else await criarServico(u.empresa_id, dados);
    return "Serviço salvo";
  });
}

// ---------- Profissionais ----------

export async function salvarProfissional(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    const nome = txt(f, "nome");
    if (!nome) throw new ErroNegocio("Informe o nome");
    const com = num(f, "comissao");
    if (!Number.isInteger(com) || com < 0 || com > 100) throw new ErroNegocio("Comissão entre 0 e 100%");
    const servicos = f.getAll("servicos").map(String).filter(isUuid);
    await salvarProfissionalDados(u.empresa_id, isUuid(id) ? id : null, {
      nome,
      telefone: txt(f, "telefone") || null,
      comissao_pct: com,
      ativo: f.get("ativo") === "on",
      unidade: isUuid(txt(f, "unidade")) ? txt(f, "unidade") : "",
      servicos,
    });
    return "Profissional salvo";
  });
}

// ---------- Horários ----------

export async function adicionarFaixa(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const prof = txt(f, "profissional");
    const dias = f.getAll("dias").map(Number).filter((d) => d >= 0 && d <= 6);
    const ini = paraMinutos(txt(f, "inicio"));
    const fim = paraMinutos(txt(f, "fim"));
    if (!dias.length) throw new ErroNegocio("Escolha pelo menos um dia");
    if (!(fim > ini)) throw new ErroNegocio("O fim precisa ser depois do início");
    await adicionarFaixas(u.empresa_id, prof, dias, ini, fim);
    return "Horário adicionado";
  });
}

export async function removerFaixa(f: FormData) {
  const u = await exigirUsuario();
  await removerFaixaDaEmpresa(u.empresa_id, txt(f, "id"));
  revalidatePath("/painel", "layout");
}

// ---------- Bloqueios ----------

export async function adicionarBloqueio(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const cfg = await configAgendamento(u.empresa_id);
    const prof = txt(f, "profissional");
    const diaIni = txt(f, "dia_inicio");
    const diaFim = txt(f, "dia_fim") || diaIni;
    const horaIni = txt(f, "hora_inicio") || "00:00";
    const horaFim = txt(f, "hora_fim") || "23:59";
    if (!diaIni) throw new ErroNegocio("Informe a data");
    const inicio = instanteLocal(diaIni, paraMinutos(horaIni), cfg.fuso_horario);
    const fim = instanteLocal(diaFim, paraMinutos(horaFim) + (txt(f, "hora_fim") ? 0 : 1), cfg.fuso_horario);
    if (fim <= inicio) throw new ErroNegocio("O fim precisa ser depois do início");
    await criarBloqueio(u.empresa_id, isUuid(prof) ? prof : null, inicio, fim, txt(f, "motivo") || null);
    return "Bloqueio criado";
  });
}

export async function removerBloqueio(f: FormData) {
  const u = await exigirUsuario();
  await removerBloqueioDaEmpresa(u.empresa_id, txt(f, "id"));
  revalidatePath("/painel", "layout");
}

// ---------- Configurações ----------

export async function salvarEmpresa(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const slug = txt(f, "slug").toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/.test(slug)) throw new ErroNegocio("Endereço da página: use letras minúsculas, números e hífen");
    if (["api", "painel", "_next"].includes(slug)) throw new ErroNegocio("Esse endereço é reservado");
    await atualizarEmpresa(u.empresa_id, {
      nome: txt(f, "nome"),
      slug,
      telefone_whatsapp: txt(f, "telefone_whatsapp").replace(/\D/g, "") || null,
      endereco: txt(f, "endereco") || null,
      maps_url: txt(f, "maps_url") || null,
      logo_url: txt(f, "logo_url") || null,
      pixel_campanha: txt(f, "pixel_campanha") || null,
      multiunidade: f.get("multiunidade") === "on",
    });
    return "Dados da empresa salvos";
  });
}

export async function salvarTema(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const cores = ["cor_primaria", "cor_secundaria", "cor_fundo", "cor_texto"].map((k) => txt(f, k));
    if (cores.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))) throw new ErroNegocio("Cor inválida");
    await atualizarTema(u.empresa_id, cores);
    return "Tema salvo";
  });
}

export async function salvarRegras(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const campos = [
      "intervalo_slots_min",
      "antecedencia_min_min",
      "janela_max_dias",
      "cancelamento_ate_min",
      "remarcacao_ate_min",
      "pagamento_minimo_pct",
      "pix_expiracao_min",
    ].map((k) => num(f, k));
    if (campos.some((n) => !Number.isInteger(n) || n < 0)) throw new ErroNegocio("Use números inteiros");
    const modo = txt(f, "pagamento_modo");
    const tipo = txt(f, "pagamento_tipo");
    await atualizarRegras(u.empresa_id, campos, modo, tipo);
    return "Regras salvas";
  });
}

export async function salvarCampo(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    if (isUuid(id)) {
      await atualizarCampo(u.empresa_id, id, txt(f, "rotulo"), f.get("obrigatorio") === "on", f.get("ativo") === "on");
    } else {
      const rotulo = txt(f, "rotulo");
      if (!rotulo) throw new ErroNegocio("Informe o rótulo");
      const chave =
        rotulo
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")
          .slice(0, 40) || "campo";
      await criarCampo(u.empresa_id, chave, rotulo, txt(f, "tipo") || "texto", f.get("obrigatorio") === "on");
    }
    return "Campo salvo";
  });
}

export async function salvarCliente(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const nome = txt(f, "nome");
    if (nome.length < 2) throw new ErroNegocio("Informe o nome");
    const email = txt(f, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ErroNegocio("E-mail inválido");
    const ok = await atualizarCliente(u.empresa_id, txt(f, "id"), nome, email || null, txt(f, "observacoes").slice(0, 1000) || null);
    if (!ok) throw new ErroNegocio("Cliente não encontrado");
    return "Cliente salvo";
  });
}

export async function novoCliente(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const nome = txt(f, "nome");
    if (nome.length < 2) throw new ErroNegocio("Informe o nome");
    const telefone = normalizarTelefone(txt(f, "telefone"));
    if (!telefone) throw new ErroNegocio("Telefone inválido. Use DDD + número.");
    const email = txt(f, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ErroNegocio("E-mail inválido");
    const ok = await cadastrarCliente(u.empresa_id, nome, telefone, email || null, txt(f, "observacoes") || null);
    if (!ok) throw new ErroNegocio("Já existe um cliente com esse telefone");
    return "Cliente cadastrado";
  });
}

// ---------- Unidades (multi-unidade) ----------

export async function salvarUnidade(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    const nome = txt(f, "nome");
    if (!nome) throw new ErroNegocio("Informe o nome da unidade");
    const endereco = txt(f, "endereco") || null;
    const mapsUrl = txt(f, "maps_url") || null;
    if (isUuid(id)) await atualizarUnidade(u.empresa_id, id, nome, endereco, mapsUrl, f.get("ativo") === "on");
    else await criarUnidade(u.empresa_id, nome, endereco, mapsUrl);
    return "Unidade salva";
  });
}

// ---------- Estorno (sandbox) ----------

/** Estorna pagamentos aprovados de um agendamento cancelado (R24). No sandbox apenas marca como estornado. */
export async function estornarPagamentos(f: FormData) {
  const u = await exigirUsuario();
  const id = txt(f, "id");
  if (!isUuid(id)) return;
  await estornarPagamentosCancelado(u.empresa_id, id);
  revalidatePath("/painel", "layout");
}
