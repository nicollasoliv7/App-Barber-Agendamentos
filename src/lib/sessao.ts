import "server-only";
import { cookies } from "next/headers";
import { q, q1, tx } from "./db";
import { conferirSenha, hashSenha, sha256, tokenAleatorio } from "./senha";
import { notificar } from "./notificacoes";
import { ErroNegocio } from "./tipos";
import { normalizarTelefone } from "./validacao";

const DIAS = 30;
const COOKIE = { painel: "agendou_painel", cliente: "agendou_cliente" } as const;

async function criarSessao(tipo: "painel" | "cliente", id: string) {
  const token = tokenAleatorio(32);
  const expira = new Date(Date.now() + DIAS * 86400000);
  await q(
    `insert into sessao (id, tipo, cliente_id, usuario_id, expira_em) values ($1,$2,$3,$4,$5)`,
    [sha256(token), tipo, tipo === "cliente" ? id : null, tipo === "painel" ? id : null, expira],
  );
  (await cookies()).set(COOKIE[tipo], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expira,
  });
}

async function lerSessao(tipo: "painel" | "cliente") {
  const token = (await cookies()).get(COOKIE[tipo])?.value;
  if (!token) return null;
  return q1<{ cliente_id: string | null; usuario_id: string | null }>(
    `select cliente_id, usuario_id from sessao where id = $1 and tipo = $2 and expira_em > now()`,
    [sha256(token), tipo],
  );
}

export async function encerrarSessao(tipo: "painel" | "cliente") {
  const jar = await cookies();
  const token = jar.get(COOKIE[tipo])?.value;
  if (token) await q(`delete from sessao where id = $1`, [sha256(token)]);
  jar.delete(COOKIE[tipo]);
}

// ---------- Painel ----------

export interface UsuarioPainel {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  papel: string;
  empresa_id: string;
  empresa_nome: string;
  empresa_slug: string;
}

export async function usuarioPainel(): Promise<UsuarioPainel | null> {
  const s = await lerSessao("painel");
  if (!s?.usuario_id) return null;
  return (
    (await q1<UsuarioPainel>(
      `select u.id, u.nome, u.telefone, u.email, u.papel, u.empresa_id, e.nome as empresa_nome, e.slug as empresa_slug
       from usuario_painel u join empresa e on e.id = u.empresa_id where u.id = $1 and u.ativo`,
      [s.usuario_id],
    )) ?? null
  );
}

export async function loginPainel(telefoneDigitado: string, senha: string) {
  const telefone = normalizarTelefone(telefoneDigitado);
  if (!telefone) throw new ErroNegocio("Informe o celular com DDD", 400);
  const u = await q1<{ id: string; senha_hash: string }>(
    `select id, senha_hash from usuario_painel where telefone = $1 and ativo`,
    [telefone],
  );
  if (!u || !conferirSenha(senha, u.senha_hash)) throw new ErroNegocio("Telefone ou senha incorretos", 401);
  await criarSessao("painel", u.id);
}

// ---------- Cliente (R30–R32) ----------

export interface ClienteSessao {
  id: string;
  nome: string;
  telefone: string;
  empresa_id: string;
}

export async function clienteLogado(empresaId?: string): Promise<ClienteSessao | null> {
  const s = await lerSessao("cliente");
  if (!s?.cliente_id) return null;
  const c = await q1<ClienteSessao>(`select id, nome, telefone, empresa_id from cliente where id = $1`, [s.cliente_id]);
  if (!c || (empresaId && c.empresa_id !== empresaId)) return null;
  return c;
}

export async function situacaoTelefone(empresaId: string, telefoneBruto: string) {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) throw new ErroNegocio("Telefone inválido");
  const c = await q1<{ nome: string; senha_hash: string | null }>(
    `select nome, senha_hash from cliente where empresa_id = $1 and telefone = $2`,
    [empresaId, telefone],
  );
  return { telefone, cadastrado: !!c, temSenha: !!c?.senha_hash, nome: c?.nome?.split(" ")[0] ?? null };
}

export async function loginCliente(empresaId: string, telefoneBruto: string, senha: string) {
  const telefone = normalizarTelefone(telefoneBruto);
  const c = telefone
    ? await q1<{ id: string; senha_hash: string | null }>(
        `select id, senha_hash from cliente where empresa_id = $1 and telefone = $2`,
        [empresaId, telefone],
      )
    : undefined;
  if (!c || !conferirSenha(senha, c.senha_hash)) throw new ErroNegocio("Telefone ou senha incorretos", 401);
  await criarSessao("cliente", c.id);
}

const COD_VALIDADE_MIN = 10;
const COD_REENVIO_S = 60;
const COD_TENTATIVAS = 5;

export async function enviarCodigo(empresaId: string, telefoneBruto: string) {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) throw new ErroNegocio("Telefone inválido");
  const r = await tx(async (t) => {
    const [recente] = await t.query(
      `select 1 from codigo_verificacao where empresa_id = $1 and telefone = $2 and criado_em > now() - make_interval(secs => $3)`,
      [empresaId, telefone, COD_REENVIO_S],
    );
    if (recente) throw new ErroNegocio(`Aguarde ${COD_REENVIO_S}s para pedir um novo código`, 429);
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    await t.query(`update codigo_verificacao set usado = true where empresa_id = $1 and telefone = $2 and not usado`, [empresaId, telefone]);
    await t.query(
      `insert into codigo_verificacao (empresa_id, telefone, codigo_hash, expira_em) values ($1,$2,$3, now() + make_interval(mins => $4))`,
      [empresaId, telefone, sha256(`${telefone}:${codigo}`), COD_VALIDADE_MIN],
    );
    const notificacaoId = await notificar(t, {
      empresaId,
      destino: telefone,
      tipo: "codigo",
      parametros: [codigo],
      mensagem: `Seu código de verificação é ${codigo}. Ele vale por ${COD_VALIDADE_MIN} minutos.`,
    });
    return { notificacaoId, reenvioEmSegundos: COD_REENVIO_S, codigoDev: process.env.NODE_ENV !== "production" || process.env.MODO_DEMO === "1" ? codigo : undefined };
  });
  // o envio acontece depois do commit; aqui só lemos o resultado real
  const st = await q1<{ status: string }>(`select status from notificacao where id = $1`, [r.notificacaoId]);
  return { reenvioEmSegundos: r.reenvioEmSegundos, codigoDev: r.codigoDev, enviado: st?.status === "aceito" };
}

/** Cadastra (ou redefine) a senha após validar o código enviado ao telefone. */
export async function cadastrarSenha(empresaId: string, telefoneBruto: string, codigo: string, senha: string, nome?: string) {
  const telefone = normalizarTelefone(telefoneBruto);
  if (!telefone) throw new ErroNegocio("Telefone inválido");
  if (!senha || senha.length < 6) throw new ErroNegocio("A senha precisa ter pelo menos 6 caracteres");
  const clienteId = await tx(async (t) => {
    const [cod] = await t.query<{ id: string; codigo_hash: string; tentativas: number }>(
      `select id, codigo_hash, tentativas from codigo_verificacao
       where empresa_id = $1 and telefone = $2 and not usado and expira_em > now()
       order by criado_em desc limit 1 for update`,
      [empresaId, telefone],
    );
    if (!cod) throw new ErroNegocio("Código expirado. Peça um novo.");
    if (cod.tentativas >= COD_TENTATIVAS) throw new ErroNegocio("Muitas tentativas. Peça um novo código.", 429);
    if (cod.codigo_hash !== sha256(`${telefone}:${(codigo ?? "").trim()}`)) {
      await t.query(`update codigo_verificacao set tentativas = tentativas + 1 where id = $1`, [cod.id]);
      throw new ErroNegocio("Código incorreto");
    }
    await t.query(`update codigo_verificacao set usado = true where id = $1`, [cod.id]);
    const [c] = await t.query<{ id: string }>(
      `insert into cliente (empresa_id, nome, telefone, senha_hash, telefone_verificado) values ($1,$2,$3,$4,true)
       on conflict (empresa_id, telefone) do update set senha_hash = excluded.senha_hash, telefone_verificado = true
       returning id`,
      [empresaId, nome?.trim() || "Cliente", telefone, hashSenha(senha)],
    );
    return c.id;
  });
  await criarSessao("cliente", clienteId);
}
