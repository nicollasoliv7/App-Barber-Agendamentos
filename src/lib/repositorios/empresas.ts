import "server-only";
import { tx } from "../db";
import { hashSenha } from "../senha";
import { ErroNegocio } from "../tipos";

/** Endereços que não podem virar página de barbearia (rotas do próprio app). */
export const SLUGS_RESERVADOS = ["api", "painel", "_next", "cadastro", "termos", "privacidade"];

function slugBase(nome: string) {
  const s = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s.length >= 3 && !SLUGS_RESERVADOS.includes(s) ? s : `barbearia-${s || "nova"}`.slice(0, 40).replace(/-+$/g, "");
}

/**
 * Cadastro self-service: cria a barbearia no plano Gratuito, com as configurações padrão
 * (pagamento online desligado) e o dono com login por celular + senha. Retorna o id do usuário.
 */
export async function criarBarbearia(d: { barbearia: string; nome: string; telefone: string; senha: string }): Promise<string> {
  return tx(async (t) => {
    const [ja] = await t.query(`select 1 from usuario_painel where telefone = $1`, [d.telefone]);
    if (ja) throw new ErroNegocio("Este celular já tem uma conta. Entre pelo painel.", 409);
    const base = slugBase(d.barbearia);
    let slug = base;
    for (let i = 2; (await t.query(`select 1 from empresa where slug = $1`, [slug])).length; i++) slug = `${base}-${i}`;
    const [e] = await t.query<{ id: string }>(`insert into empresa (nome, slug, telefone_whatsapp) values ($1,$2,$3) returning id`, [d.barbearia, slug, d.telefone]);
    await t.query(`insert into config_tema (empresa_id) values ($1)`, [e.id]);
    await t.query(`insert into config_agendamento (empresa_id, pagamento_modo) values ($1, 'desativado')`, [e.id]);
    const [u] = await t.query<{ id: string }>(
      `insert into usuario_painel (empresa_id, nome, telefone, senha_hash, papel) values ($1,$2,$3,$4,'dono') returning id`,
      [e.id, d.nome, d.telefone, hashSenha(d.senha)],
    );
    return u.id;
  });
}
