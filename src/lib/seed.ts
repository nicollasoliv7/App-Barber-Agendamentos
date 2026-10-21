import type { Executor } from "./db";
import { hashSenha } from "./senha";

/** Dados 100% fictícios para desenvolvimento. */
export const SEED_LOGIN = { email: "dono@agendou.dev", senha: "agendou123" };

export async function semear(t: Executor) {
  const [emp] = await t.query<{ id: string }>(
    `insert into empresa (nome, slug, telefone_whatsapp, endereco, maps_url)
     values ('Barbearia Exemplo', 'barbearia-exemplo', '11999990000',
             'Rua Fictícia, 123 - Centro, São Paulo/SP',
             'https://maps.google.com/?q=Rua+Ficticia+123')
     returning id`,
  );
  const e = emp.id;
  await t.query(`insert into config_tema (empresa_id) values ($1)`, [e]);
  await t.query(`insert into config_agendamento (empresa_id) values ($1)`, [e]);
  await t.query(
    `insert into campo_personalizado (empresa_id, chave, rotulo, tipo, obrigatorio, ordem, ativo) values
     ($1,'nascimento','Data de nascimento','data',false,1,true),
     ($1,'cpf','CPF','cpf',false,2,false),
     ($1,'descricao','Observações','textarea',false,3,true)`,
    [e],
  );

  const servicos: [string, number, number, string | null][] = [
    ["Corte", 4000, 40, null],
    ["Barba", 3000, 20, null],
    ["Corte + Barba", 7000, 50, "Combo com desconto"],
    ["Corte + Sobrancelha", 4500, 40, null],
    ["Sobrancelha", 1000, 10, null],
    ["Acabamento (pezinho)", 1500, 15, null],
    ["Pigmentação", 3000, 20, null],
    ["Platinado", 15000, 80, "Corte incluso"],
    ["Luzes", 14000, 60, "Corte incluso"],
  ];
  const ids: string[] = [];
  for (const [i, [nome, preco, dur, obs]] of servicos.entries()) {
    const [s] = await t.query<{ id: string }>(
      `insert into servico (empresa_id, nome, preco_centavos, duracao_min, observacao, ordem)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [e, nome, preco, dur, obs, i],
    );
    ids.push(s.id);
  }

  const profs: [string, number, string[]][] = [
    ["Rafael Lima", 40, ids],
    ["Bruno Souza", 45, ids.slice(0, 7)],
  ];
  for (const [nome, com, servs] of profs) {
    const [p] = await t.query<{ id: string }>(
      `insert into profissional (empresa_id, nome, comissao_pct, telefone) values ($1,$2,$3,'11988880000') returning id`,
      [e, nome, com],
    );
    for (const s of servs)
      await t.query(`insert into profissional_servico (profissional_id, servico_id) values ($1,$2)`, [p.id, s]);
    // Segunda a sábado: 09:00–12:00 e 13:00–19:00 (sábado até 17:00)
    for (let d = 1; d <= 6; d++) {
      await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,540,720)`, [p.id, d]);
      await t.query(`insert into disponibilidade (profissional_id, dia_semana, inicio_min, fim_min) values ($1,$2,780,$3)`, [
        p.id,
        d,
        d === 6 ? 1020 : 1140,
      ]);
    }
  }

  await t.query(
    `insert into usuario_painel (empresa_id, nome, email, senha_hash, papel) values ($1,'Dono Exemplo',$2,$3,'dono')`,
    [e, SEED_LOGIN.email, hashSenha(SEED_LOGIN.senha)],
  );
}
