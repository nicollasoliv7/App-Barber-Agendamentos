import type { Executor } from "./db";
import { diaLocal, diaSemana, instanteLocal, somarDias } from "./tempo";
import { hashSenha } from "./senha";

/** Dados 100% fictícios para desenvolvimento. */
export const SEED_LOGIN = { telefone: "11900000001", email: "dono@agendou.dev", senha: "agendou123" };

export async function semear(t: Executor) {
  const [emp] = await t.query<{ id: string }>(
    `insert into empresa (nome, slug, telefone_whatsapp, endereco, maps_url)
     values ('Barbearia Exemplo', 'barbearia-exemplo', '11999990000',
             'Rua Fictícia, 123 - Centro, São Paulo/SP',
             'https://maps.google.com/?q=Rua+Ficticia+123')
     returning id`,
  );
  const e = emp.id;
  await t.query(`insert into config_tema (empresa_id, cor_primaria, cor_fundo, cor_texto) values ($1, '#ff5a3c', '#07080a', '#f5f5f5')`, [e]);
  // pagamento online desligado por padrão: não há provedor real conectado (só sandbox)
  await t.query(`insert into config_agendamento (empresa_id, pagamento_modo) values ($1, 'desativado')`, [e]);
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

  const profIds: string[] = [];
  const profs: [string, number, string[]][] = [
    ["Rafael Lima", 40, ids],
    ["Bruno Souza", 45, ids.slice(0, 7)],
  ];
  for (const [nome, com, servs] of profs) {
    const [p] = await t.query<{ id: string }>(
      `insert into profissional (empresa_id, nome, comissao_pct, telefone) values ($1,$2,$3,'11988880000') returning id`,
      [e, nome, com],
    );
    profIds.push(p.id);
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
    `insert into usuario_painel (empresa_id, nome, telefone, email, senha_hash, papel) values ($1,'Dono Exemplo',$2,$3,$4,'dono')`,
    [e, SEED_LOGIN.telefone, SEED_LOGIN.email, hashSenha(SEED_LOGIN.senha)],
  );

  // a barbearia de demonstração tem mais de 15 clientes fictícios: entra como cortesia (sem cobrança)
  await t.query(
    `insert into assinatura_sistema (empresa_id, plano, valido_ate, origem) values ($1, 'anual', now() + interval '10 years', 'cortesia')`,
    [e],
  );

  await historicoFicticio(t, e, ids, profIds);
}

/**
 * Histórico FICTÍCIO para a demonstração (45 dias para trás e 7 para frente),
 * para o painel não abrir vazio. Só roda no seed do banco de exemplo.
 */
async function historicoFicticio(t: Executor, empresa: string, servicos: string[], profs: string[]) {
  let semente = 20261021;
  const rand = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const nomes = [
    "Lucas Martins", "Pedro Almeida", "Diego Rocha", "Thiago Nunes", "Felipe Costa", "André Lopes", "Bruno Carvalho", "Gabriel Dias",
    "Rafael Teixeira", "Mateus Freitas", "Vinícius Melo", "Leonardo Pires", "Gustavo Ramos", "Henrique Barros", "Caio Moreira", "João Vitor Reis",
    "Eduardo Faria", "Rodrigo Cunha", "Marcelo Duarte", "Fábio Monteiro", "Daniel Azevedo", "Igor Batista", "Renan Castro", "Otávio Lima",
    "Samuel Pacheco", "Murilo Gomes", "Paulo Henrique", "Arthur Viana", "Victor Sales", "Enzo Fonseca",
  ];
  const clientes: string[] = [];
  for (const [i, nome] of nomes.entries()) {
    const [c] = await t.query<{ id: string }>(
      `insert into cliente (empresa_id, nome, telefone, criado_em) values ($1,$2,$3, now() - make_interval(days => $4)) returning id`,
      [empresa, nome, `1199${String(1000000 + i * 7919).slice(-7)}`, 50 - Math.floor(i * 1.6)],
    );
    clientes.push(c.id);
  }
  const serv = await t.query<{ id: string; preco_centavos: number; duracao_min: number }>(
    `select id, preco_centavos, duracao_min from servico where id = any($1::uuid[]) and duracao_min <= 50`,
    [servicos],
  );
  const pesos = [5, 3, 4, 2, 1, 1, 2]; // Corte é o mais pedido
  const escolherServico = () => {
    const total = serv.reduce((acc, _, i) => acc + (pesos[i] ?? 1), 0);
    let r = rand() * total;
    for (const [i, s] of serv.entries()) if ((r -= pesos[i] ?? 1) < 0) return s;
    return serv[0];
  };
  const fuso = "America/Sao_Paulo";
  const hoje = diaLocal(new Date(), fuso);
  const horas = [540, 600, 660, 780, 840, 900, 960, 1020];
  for (let d = -45; d <= 7; d++) {
    const dia = somarDias(hoje, d);
    if (diaSemana(dia) === 0) continue;
    for (const p of profs) {
      for (const m of horas) {
        if (diaSemana(dia) === 6 && m >= 960) continue;
        const ocupacao = d < 0 ? 0.55 : d === 0 ? 0.35 : 0.25;
        if (rand() > ocupacao) continue;
        const inicio = instanteLocal(dia, m, fuso);
        if (d >= 0 && inicio.getTime() < Date.now() + 2 * 3600000) continue; // não ocupa horários de hoje que já passaram/estão perto
        const s = escolherServico();
        const fim = new Date(inicio.getTime() + s.duracao_min * 60000);
        let status = "confirmado";
        let canceladoPor: string | null = null;
        if (d < 0) {
          const r = rand();
          status = r < 0.86 ? "concluido" : r < 0.93 ? "faltou" : "cancelado";
          if (status === "cancelado") canceladoPor = "cliente";
        }
        const cliente = clientes[Math.floor(rand() * clientes.length)];
        const [a] = await t.query<{ id: string }>(
          `insert into agendamento (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, preco_centavos, status, cancelado_por, origem, criado_em)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, $5::timestamptz - interval '3 days') returning id`,
          [empresa, cliente, p, s.id, inicio, fim, s.preco_centavos, status, canceladoPor, rand() < 0.8 ? "publico" : "painel"],
        );
        if (status === "concluido")
          await t.query(`insert into pagamento (agendamento_id, metodo, tipo, valor_centavos, status, pago_em) values ($1,'local','integral',$2,'pago',$3)`, [
            a.id,
            s.preco_centavos,
            fim,
          ]);
      }
    }
  }
}
