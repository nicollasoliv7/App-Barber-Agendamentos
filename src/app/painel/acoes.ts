"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, tx } from "@/lib/db";
import { encerrarSessao, loginPainel, usuarioPainel } from "@/lib/sessao";
import { criarAgendamento, mudarStatusPelaEmpresa } from "@/lib/agendamentos";
import { instanteLocal, paraMinutos } from "@/lib/tempo";
import { ErroNegocio } from "@/lib/tipos";
import { configAgendamento } from "@/lib/empresa";
import { isUuid } from "@/lib/validacao";

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
    console.error(e);
    return { erro: "Não foi possível salvar" };
  }
}

// ---------- Sessão ----------

export async function entrar(_: Estado, f: FormData): Promise<Estado> {
  try {
    await loginPainel(txt(f, "email"), String(f.get("senha") ?? ""));
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
  await tx(async (t) => {
    const [ag] = await t.query<{ preco_centavos: number; pago: number }>(
      `select preco_centavos, coalesce((select sum(valor_centavos) from pagamento where agendamento_id = a.id and status='pago'),0)::int as pago
       from agendamento a where id = $1 and empresa_id = $2`,
      [id, u.empresa_id],
    );
    if (!ag || ag.preco_centavos - ag.pago <= 0) return;
    await t.query(
      `insert into pagamento (agendamento_id, metodo, tipo, valor_centavos, status, pago_em) values ($1,'local','integral',$2,'pago',now())`,
      [id, ag.preco_centavos - ag.pago],
    );
  });
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
    const vals = [nome, txt(f, "descricao") || null, txt(f, "observacao") || null, preco, dur, f.get("ativo") === "on", num(f, "ordem") || 0, txt(f, "imagem_url") || null];
    if (isUuid(id)) {
      await q(
        `update servico set nome=$1, descricao=$2, observacao=$3, preco_centavos=$4, duracao_min=$5, ativo=$6, ordem=$7, imagem_url=$8
         where id=$9 and empresa_id=$10`,
        [...vals, id, u.empresa_id],
      );
    } else {
      await tx(async (t) => {
        const [s] = await t.query<{ id: string }>(
          `insert into servico (nome, descricao, observacao, preco_centavos, duracao_min, ativo, ordem, imagem_url, empresa_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [...vals, u.empresa_id],
        );
        // novo serviço: todos os profissionais ativos passam a fazê-lo (ajustável em Profissionais)
        await t.query(
          `insert into profissional_servico (profissional_id, servico_id) select id, $1 from profissional where empresa_id = $2 and ativo`,
          [s.id, u.empresa_id],
        );
      });
    }
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
    await tx(async (t) => {
      let pid = id;
      if (isUuid(id)) {
        await t.query(
          `update profissional set nome=$1, telefone=$2, comissao_pct=$3, ativo=$4,
             unidade_id = (select id from unidade where id = nullif($7,'')::uuid and empresa_id = $6)
           where id=$5 and empresa_id=$6`,
          [nome, txt(f, "telefone") || null, com, f.get("ativo") === "on", id, u.empresa_id, isUuid(txt(f, "unidade")) ? txt(f, "unidade") : ""],
        );
      } else {
        const [p] = await t.query<{ id: string }>(
          `insert into profissional (empresa_id, nome, telefone, comissao_pct, ativo, unidade_id)
           values ($1,$2,$3,$4,true,(select id from unidade where id = nullif($5,'')::uuid and empresa_id = $1)) returning id`,
          [u.empresa_id, nome, txt(f, "telefone") || null, com, isUuid(txt(f, "unidade")) ? txt(f, "unidade") : ""],
        );
        pid = p.id;
        // expediente padrão: seg–sex 09–18, sáb 09–14
        for (let d = 1; d <= 6; d++)
          await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,540,$3)`, [
            pid,
            d,
            d === 6 ? 840 : 1080,
          ]);
      }
      await t.query(`delete from profissional_servico where profissional_id = $1`, [pid]);
      for (const s of servicos)
        await t.query(
          `insert into profissional_servico (profissional_id, servico_id) select $1, id from servico where id = $2 and empresa_id = $3`,
          [pid, s, u.empresa_id],
        );
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
    await tx(async (t) => {
      const [p] = await t.query(`select 1 from profissional where id = $1 and empresa_id = $2`, [prof, u.empresa_id]);
      if (!p) throw new ErroNegocio("Profissional inválido");
      for (const d of dias) {
        const [sob] = await t.query(
          `select 1 from disponibilidade where profissional_id=$1 and dia_semana=$2 and inicio_min < $4 and fim_min > $3`,
          [prof, d, ini, fim],
        );
        if (sob) throw new ErroNegocio("Essa faixa se sobrepõe a outra já cadastrada");
        await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,$3,$4)`, [prof, d, ini, fim]);
      }
    });
    return "Horário adicionado";
  });
}

export async function removerFaixa(f: FormData) {
  const u = await exigirUsuario();
  await q(
    `delete from disponibilidade d using profissional p where d.id = $1 and p.id = d.profissional_id and p.empresa_id = $2`,
    [txt(f, "id"), u.empresa_id],
  );
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
    await q(`insert into bloqueio (empresa_id, profissional_id, inicio, fim, motivo) values ($1,$2,$3,$4,$5)`, [
      u.empresa_id,
      isUuid(prof) ? prof : null,
      inicio,
      fim,
      txt(f, "motivo") || null,
    ]);
    return "Bloqueio criado";
  });
}

export async function removerBloqueio(f: FormData) {
  const u = await exigirUsuario();
  await q(`delete from bloqueio where id = $1 and empresa_id = $2`, [txt(f, "id"), u.empresa_id]);
  revalidatePath("/painel", "layout");
}

// ---------- Configurações ----------

export async function salvarEmpresa(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const slug = txt(f, "slug").toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/.test(slug)) throw new ErroNegocio("Endereço da página: use letras minúsculas, números e hífen");
    if (["api", "painel", "_next"].includes(slug)) throw new ErroNegocio("Esse endereço é reservado");
    await q(
      `update empresa set nome=$1, slug=$2, telefone_whatsapp=$3, endereco=$4, maps_url=$5, logo_url=$6, pixel_campanha=$7, multiunidade=$8 where id=$9`,
      [
        txt(f, "nome"),
        slug,
        txt(f, "telefone_whatsapp").replace(/\D/g, "") || null,
        txt(f, "endereco") || null,
        txt(f, "maps_url") || null,
        txt(f, "logo_url") || null,
        txt(f, "pixel_campanha") || null,
        f.get("multiunidade") === "on",
        u.empresa_id,
      ],
    );
    return "Dados da empresa salvos";
  });
}

export async function salvarTema(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const cores = ["cor_primaria", "cor_secundaria", "cor_fundo", "cor_texto"].map((k) => txt(f, k));
    if (cores.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))) throw new ErroNegocio("Cor inválida");
    await q(`update config_tema set cor_primaria=$1, cor_secundaria=$2, cor_fundo=$3, cor_texto=$4 where empresa_id=$5`, [...cores, u.empresa_id]);
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
    await q(
      `update config_agendamento set intervalo_slots_min=$1, antecedencia_min_min=$2, janela_max_dias=$3, cancelamento_ate_min=$4,
         remarcacao_ate_min=$5, pagamento_minimo_pct=$6, pix_expiracao_min=$7, pagamento_modo=$8, pagamento_tipo=$9
       where empresa_id=$10`,
      [...campos, modo, tipo, u.empresa_id],
    );
    return "Regras salvas";
  });
}

export async function salvarCampo(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    if (isUuid(id)) {
      await q(`update campo_personalizado set rotulo=$1, obrigatorio=$2, ativo=$3 where id=$4 and empresa_id=$5`, [
        txt(f, "rotulo"),
        f.get("obrigatorio") === "on",
        f.get("ativo") === "on",
        id,
        u.empresa_id,
      ]);
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
      await q(
        `insert into campo_personalizado (empresa_id, chave, rotulo, tipo, obrigatorio, ordem, ativo)
         values ($1,$2,$3,$4,$5,(select coalesce(max(ordem),0)+1 from campo_personalizado where empresa_id=$1),true)`,
        [u.empresa_id, chave, rotulo, txt(f, "tipo") || "texto", f.get("obrigatorio") === "on"],
      );
    }
    return "Campo salvo";
  });
}

export async function salvarCliente(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    await q(`update cliente set nome=$1, email=$2 where id=$3 and empresa_id=$4`, [txt(f, "nome"), txt(f, "email") || null, txt(f, "id"), u.empresa_id]);
    return "Cliente salvo";
  });
}

// ---------- Unidades (multi-unidade) ----------

export async function salvarUnidade(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const id = txt(f, "id");
    const nome = txt(f, "nome");
    if (!nome) throw new ErroNegocio("Informe o nome da unidade");
    const vals = [nome, txt(f, "endereco") || null, txt(f, "maps_url") || null];
    if (isUuid(id)) {
      await q(`update unidade set nome=$1, endereco=$2, maps_url=$3, ativo=$4 where id=$5 and empresa_id=$6`, [
        ...vals,
        f.get("ativo") === "on",
        id,
        u.empresa_id,
      ]);
    } else {
      await q(`insert into unidade (nome, endereco, maps_url, empresa_id) values ($1,$2,$3,$4)`, [...vals, u.empresa_id]);
    }
    return "Unidade salva";
  });
}

// ---------- Estorno (sandbox) ----------

/** Estorna pagamentos aprovados de um agendamento cancelado (R24). No sandbox apenas marca como estornado. */
export async function estornarPagamentos(f: FormData) {
  const u = await exigirUsuario();
  const id = txt(f, "id");
  if (!isUuid(id)) return;
  await q(
    `update pagamento p set status = 'estornado'
     from agendamento a
     where p.agendamento_id = a.id and a.id = $1 and a.empresa_id = $2 and a.status = 'cancelado'
       and p.status = 'pago' and p.metodo in ('pix','cartao')`,
    [id, u.empresa_id],
  );
  revalidatePath("/painel", "layout");
}
