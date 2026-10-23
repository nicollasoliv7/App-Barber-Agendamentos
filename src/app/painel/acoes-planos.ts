"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q1, tx } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { editarPelaEmpresa } from "@/lib/agendamentos";
import {
  aplicarCobertura,
  cancelarAssinatura,
  criarAssinatura,
  desfazerPagamentoMensalidade,
  registrarPagamentoMensalidade,
  removerCobertura,
  salvarPlano,
} from "@/lib/planos";
import { ErroNegocio, type Agendamento } from "@/lib/tipos";
import { isUuid, normalizarTelefone } from "@/lib/validacao";
import type { Estado } from "./acoes";

async function usuario() {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  return u;
}
async function gestor() {
  const u = await usuario();
  if (u.papel !== "dono" && u.papel !== "admin") throw new ErroNegocio("Só o dono ou um administrador pode alterar planos e assinaturas.", 403);
  return u;
}
async function executar(fn: () => Promise<string>): Promise<Estado> {
  try {
    const ok = await fn();
    revalidatePath("/painel", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("assinatura_cliente_aberta")) return { erro: "Este cliente já tem um plano em andamento." };
    console.error("[planos]", e);
    return { erro: "Não foi possível salvar. Tente novamente." };
  }
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const centavos = (s: string) => {
  const limpo = s.replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

// ---------------------------------------------------------------- planos

export async function salvarPlanoAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const id = txt(f, "id");
    const preco = centavos(txt(f, "preco"));
    if (!Number.isFinite(preco)) throw new ErroNegocio("Preço inválido");
    const servicos: { servico_id: string; limite_por_ciclo: number | null; valor_cliente_centavos: number }[] = [];
    for (const sid of f.getAll("servico").map(String)) {
      if (!isUuid(sid)) continue;
      const lim = txt(f, `limite_${sid}`);
      const limite = lim === "" ? null : Number(lim);
      if (limite !== null && !(Number.isInteger(limite) && limite >= 1 && limite <= 100)) throw new ErroNegocio("O limite de usos deve ser de 1 a 100 (ou vazio para ilimitado)");
      const adicional = centavos(txt(f, `adicional_${sid}`));
      if (!Number.isFinite(adicional) || adicional < 0) throw new ErroNegocio("Valor adicional inválido");
      servicos.push({ servico_id: sid, limite_por_ciclo: limite, valor_cliente_centavos: adicional });
    }
    await salvarPlano(u.empresa_id, isUuid(id) ? id : null, {
      nome: txt(f, "nome"),
      descricao: txt(f, "descricao") || null,
      beneficios: txt(f, "beneficios") || null,
      preco_centavos: preco,
      periodo_meses: Number(txt(f, "periodo_meses") || 1),
      ativo: isUuid(id) ? f.get("ativo") === "on" : true,
      servicos,
    });
    return isUuid(id) ? "Plano atualizado (assinaturas existentes mantêm o preço combinado)" : "Plano criado";
  });
}

// ---------------------------------------------------------------- assinaturas

export async function assinarPlanoAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    let clienteId = txt(f, "cliente_id");
    if (!isUuid(clienteId)) {
      // veio do campo de busca: "Nome · (11) 91234-5678" ou só o celular
      const bruto = txt(f, "cliente");
      const tel = normalizarTelefone(bruto.includes("·") ? bruto.split("·").pop()! : bruto);
      const c = tel ? await q1<{ id: string }>(`select id from cliente where empresa_id = $1 and telefone = $2`, [u.empresa_id, tel]) : undefined;
      if (!c) throw new ErroNegocio("Cliente não encontrado. Escolha um da lista ou cadastre-o em Clientes.");
      clienteId = c.id;
    }
    const planoId = txt(f, "plano_id");
    if (!isUuid(clienteId) || !isUuid(planoId)) throw new ErroNegocio("Escolha o cliente e o plano");
    const pagoAgora = f.get("pago_agora") === "on";
    await criarAssinatura(u.empresa_id, u.id, { clienteId, planoId, inicio: txt(f, "inicio"), pagoAgora, metodo: pagoAgora ? txt(f, "metodo") : null });
    return pagoAgora ? "Plano ativado e primeiro pagamento registrado" : "Plano criado: aguardando o primeiro pagamento";
  });
}

export async function registrarMensalidadeAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await usuario();
    const id = txt(f, "cobranca_id");
    if (!isUuid(id)) throw new ErroNegocio("Mensalidade inválida");
    await registrarPagamentoMensalidade(u.empresa_id, u.id, id, txt(f, "metodo"));
    return "Pagamento registrado";
  });
}

export async function desfazerMensalidadeAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const id = txt(f, "cobranca_id");
    if (!isUuid(id)) throw new ErroNegocio("Mensalidade inválida");
    await desfazerPagamentoMensalidade(u.empresa_id, id);
    return "Registro desfeito: a mensalidade voltou a pendente";
  });
}

export async function cancelarAssinaturaAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const id = txt(f, "assinatura_id");
    if (!isUuid(id)) throw new ErroNegocio("Assinatura inválida");
    if (f.get("confirmo") !== "on") throw new ErroNegocio("Marque a confirmação para cancelar");
    await cancelarAssinatura(u.empresa_id, id, txt(f, "motivo").slice(0, 200) || null);
    return "Assinatura cancelada";
  });
}

// ---------------------------------------------------------------- agenda × plano

/** "Usar plano": registra o uso do benefício num atendimento (se o plano cobrir). */
export async function usarPlanoAcao(f: FormData) {
  const u = await usuario();
  const id = txt(f, "id");
  if (!isUuid(id)) return;
  await tx(async (t) => {
    const [ag] = await t.query<Agendamento>(`select * from agendamento where id = $1 and empresa_id = $2 for update`, [id, u.empresa_id]);
    if (!ag || !["confirmado", "concluido"].includes(ag.status)) return;
    // não cobre por cima de um pagamento já feito: evita "pagou e usou o plano" no mesmo atendimento
    const [pago] = await t.query(`select 1 from pagamento where agendamento_id = $1 and status = 'pago'`, [id]);
    if (pago) return;
    await aplicarCobertura(t, ag);
  });
  revalidatePath("/painel", "layout");
}

/** "Cobrar avulso": desfaz o uso do benefício (o atendimento volta a ser cobrado normalmente). */
export async function cobrarAvulsoAcao(f: FormData) {
  const u = await usuario();
  const id = txt(f, "id");
  if (!isUuid(id)) return;
  await tx(async (t) => {
    const [ag] = await t.query(`select 1 from agendamento where id = $1 and empresa_id = $2`, [id, u.empresa_id]);
    if (ag) await removerCobertura(t, id);
  });
  revalidatePath("/painel", "layout");
}

export async function editarAgendamentoAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await usuario();
    const id = txt(f, "id");
    const prof = txt(f, "profissional");
    if (!isUuid(id) || !isUuid(prof)) throw new ErroNegocio("Dados inválidos");
    await editarPelaEmpresa(u.empresa_id, id, { dia: txt(f, "dia"), hora: txt(f, "hora"), profissionalId: prof, observacao: txt(f, "observacao") || null });
    return "Agendamento atualizado";
  });
}
