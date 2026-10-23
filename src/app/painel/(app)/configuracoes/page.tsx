import { q, q1 } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { configAgendamento, configTema } from "@/lib/empresa";
import type { CampoPersonalizado, Empresa } from "@/lib/tipos";
import { conexaoPublica } from "@/lib/whatsapp";
import Link from "next/link";
import { salvarCampo, salvarEmpresa, salvarRegras, salvarTema, salvarUnidade } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Configurações" };

export default async function Page() {
  const u = await usuarioOuLogin();
  const [e, tema, cfg, campos, unidades, wa] = await Promise.all([
    q1<Empresa>(`select * from empresa where id = $1`, [u.empresa_id]),
    configTema(u.empresa_id),
    configAgendamento(u.empresa_id),
    q<CampoPersonalizado>(`select * from campo_personalizado where empresa_id = $1 order by ordem`, [u.empresa_id]),
    q<{ id: string; nome: string; endereco: string | null; maps_url: string | null; ativo: boolean }>(
      `select id, nome, endereco, maps_url, ativo from unidade where empresa_id = $1 order by nome`,
      [u.empresa_id],
    ),
    conexaoPublica(u.empresa_id),
  ]);
  const card = "card p-4 md:p-5";
  const integracoes = [
    {
      nome: "Agendamento público",
      ok: true,
      estado: "",
      texto: `Funcionando em /${e!.slug}, sem login para o cliente.`,
    },
    {
      nome: "WhatsApp",
      ok: wa?.status === "conectado" && !!wa.modelo_confirmacao,
      estado: !wa ? "Não conectado" : wa.status === "erro" ? "Erro na conexão" : "Falta o modelo",
      texto:
        wa?.status === "conectado" && wa.modelo_confirmacao
          ? `Confirmações automáticas pelo número ${wa.numero_exibicao ?? wa.phone_number_id} (API oficial da Meta).`
          : "Nenhuma mensagem automática é enviada; o envio manual pelo seu WhatsApp continua disponível. Configure em WhatsApp.",
      href: "/painel/whatsapp",
    },
    {
      nome: "Pagamentos online",
      ok: false,
      estado: "Modo de teste",
      texto: "Pix e cartão em sandbox: nenhum valor real é cobrado. Ainda não há provedor de pagamento conectado.",
    },
    {
      nome: "Links nas mensagens",
      ok: !!process.env.APP_URL,
      estado: "Sem endereço",
      texto: process.env.APP_URL
        ? `Links de remarcar/cancelar apontam para ${process.env.APP_URL}.`
        : "Defina APP_URL (endereço público do app) para incluir o link de remarcar/cancelar nas mensagens.",
    },
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>

      <section className={card} aria-labelledby="titulo-integracoes">
        <h2 id="titulo-integracoes" className="mb-1 font-medium">
          Status das integrações
        </h2>
        <p className="mb-3 text-xs muted">O que já funciona de verdade e o que ainda depende de configuração.</p>
        <ul className="grid gap-2 text-sm md:grid-cols-2">
          {integracoes.map((i) => (
            <li key={i.nome} className="flex items-start gap-3 rounded-lg border border-white/[0.08] p-3">
              <span className={`badge ${i.ok ? "badge-ok" : "badge-warn"}`}>{i.ok ? "Ativo" : i.estado}</span>
              <span>
                <b className="font-medium">
                  {"href" in i && i.href ? (
                    <Link href={i.href} className="underline underline-offset-2">
                      {i.nome}
                    </Link>
                  ) : (
                    i.nome
                  )}
                </b>
                <span className="block text-xs muted">{i.texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-medium">Empresa</h2>
        <Form action={salvarEmpresa} className="grid gap-3 md:grid-cols-2">
          <Campo rotulo="Nome">
            <input name="nome" required defaultValue={e!.nome} className={inp} />
          </Campo>
          <Campo rotulo="Endereço da página (agendou/…)">
            <input name="slug" required defaultValue={e!.slug} className={inp} />
          </Campo>
          <Campo rotulo="WhatsApp da barbearia (o cliente usa para falar com você)">
            <input name="telefone_whatsapp" defaultValue={e!.telefone_whatsapp ?? ""} className={inp} />
          </Campo>
          <Campo rotulo="Endereço">
            <input name="endereco" defaultValue={e!.endereco ?? ""} className={inp} />
          </Campo>
          <Campo rotulo="Link do Google Maps">
            <input name="maps_url" type="url" defaultValue={e!.maps_url ?? ""} className={inp} />
          </Campo>
          <Campo rotulo="Logo (URL da imagem)">
            <input name="logo_url" type="url" defaultValue={e!.logo_url ?? ""} className={inp} />
          </Campo>
          <Campo rotulo="Pixel de campanha (ID)">
            <input name="pixel_campanha" defaultValue={e!.pixel_campanha ?? ""} className={inp} />
          </Campo>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" name="multiunidade" defaultChecked={e!.multiunidade} /> Empresa com várias unidades
          </label>
        </Form>
      </section>

      {e!.multiunidade && (
        <section className={card}>
          <h2 className="mb-1 font-medium">Unidades</h2>
          <p className="mb-3 text-xs muted">
            O cliente escolhe a unidade na página pública e só vê os profissionais dela (ou os marcados para todas as unidades).
          </p>
          <div className="grid gap-2">
            {unidades.map((un) => (
              <Form key={un.id} action={salvarUnidade} className="grid gap-2 border-b border-white/[0.08] pb-3 md:grid-cols-4 md:items-end">
                <input type="hidden" name="id" value={un.id} />
                <Campo rotulo="Nome">
                  <input name="nome" required defaultValue={un.nome} className={inp} />
                </Campo>
                <Campo rotulo="Endereço">
                  <input name="endereco" defaultValue={un.endereco ?? ""} className={inp} />
                </Campo>
                <Campo rotulo="Link do Maps">
                  <input name="maps_url" type="url" defaultValue={un.maps_url ?? ""} className={inp} />
                </Campo>
                <label className="flex items-center gap-2 text-sm pb-2">
                  <input type="checkbox" name="ativo" defaultChecked={un.ativo} /> Ativa
                </label>
              </Form>
            ))}
            <Form action={salvarUnidade} className="grid gap-2 pt-2 md:grid-cols-3 md:items-end" botao="Adicionar unidade" resetar>
              <Campo rotulo="Nova unidade">
                <input name="nome" placeholder="ex.: Unidade Centro" className={inp} />
              </Campo>
              <Campo rotulo="Endereço">
                <input name="endereco" className={inp} />
              </Campo>
              <Campo rotulo="Link do Maps">
                <input name="maps_url" type="url" className={inp} />
              </Campo>
            </Form>
          </div>
        </section>
      )}

      <section className={card}>
        <h2 className="mb-3 font-medium">Cores da página pública</h2>
        <Form action={salvarTema} className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {(
            [
              ["cor_primaria", "Principal (botões)"],
              ["cor_secundaria", "Destaque"],
              ["cor_fundo", "Fundo"],
              ["cor_texto", "Texto"],
            ] as const
          ).map(([k, r]) => (
            <Campo key={k} rotulo={r}>
              <input type="color" name={k} defaultValue={tema[k]} className="h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-transparent" />
            </Campo>
          ))}
        </Form>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-medium">Regras de agendamento e pagamento</h2>
        <Form action={salvarRegras} className="grid gap-3 md:grid-cols-3">
          <Campo rotulo="Intervalo entre horários oferecidos (min)">
            <input type="number" name="intervalo_slots_min" min={5} max={120} defaultValue={cfg.intervalo_slots_min} className={inp} />
          </Campo>
          <Campo rotulo="Antecedência mínima para agendar (min)">
            <input type="number" name="antecedencia_min_min" min={0} defaultValue={cfg.antecedencia_min_min} className={inp} />
          </Campo>
          <Campo rotulo="Agenda aberta para os próximos (dias)">
            <input type="number" name="janela_max_dias" min={1} max={365} defaultValue={cfg.janela_max_dias} className={inp} />
          </Campo>
          <Campo rotulo="Cliente cancela até (min antes)">
            <input type="number" name="cancelamento_ate_min" min={0} defaultValue={cfg.cancelamento_ate_min} className={inp} />
          </Campo>
          <Campo rotulo="Cliente remarca até (min antes)">
            <input type="number" name="remarcacao_ate_min" min={0} defaultValue={cfg.remarcacao_ate_min} className={inp} />
          </Campo>
          <Campo rotulo="Pagamento online">
            <select name="pagamento_modo" defaultValue={cfg.pagamento_modo} className={inp}>
              <option value="desativado">Desativado</option>
              <option value="opcional">Opcional</option>
              <option value="obrigatorio">Obrigatório (Pix para confirmar)</option>
            </select>
          </Campo>
          <Campo rotulo="Valor cobrado">
            <select name="pagamento_tipo" defaultValue={cfg.pagamento_tipo} className={inp}>
              <option value="minimo">Só o sinal</option>
              <option value="integral">Valor integral</option>
              <option value="cliente_escolhe">Cliente escolhe</option>
            </select>
          </Campo>
          <Campo rotulo="Sinal (% do serviço)">
            <input type="number" name="pagamento_minimo_pct" min={1} max={100} defaultValue={cfg.pagamento_minimo_pct} className={inp} />
          </Campo>
          <Campo rotulo="Prazo para pagar o Pix (min)">
            <input type="number" name="pix_expiracao_min" min={1} max={60} defaultValue={cfg.pix_expiracao_min} className={inp} />
          </Campo>
        </Form>
        <p className="mt-3 text-xs text-[#ffcf8a]">
          Pagamentos online estão em modo de teste (sandbox): nenhum valor real é cobrado. Para a maioria das barbearias, deixe &quot;Desativado&quot; até conectar um
          provedor de pagamento.
        </p>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-medium">Campos extras do formulário de agendamento</h2>
        <div className="grid gap-2">
          {campos.map((c) => (
            <Form key={c.id} action={salvarCampo} className="flex flex-wrap items-end gap-3 border-b border-white/[0.08] pb-2">
              <input type="hidden" name="id" value={c.id} />
              <Campo rotulo={`Rótulo (${c.tipo})`}>
                <input name="rotulo" defaultValue={c.rotulo} className={inp} />
              </Campo>
              <label className="flex items-center gap-1 text-sm pb-2">
                <input type="checkbox" name="ativo" defaultChecked={c.ativo} /> Ativo
              </label>
              <label className="flex items-center gap-1 text-sm pb-2">
                <input type="checkbox" name="obrigatorio" defaultChecked={c.obrigatorio} /> Obrigatório
              </label>
            </Form>
          ))}
          <Form action={salvarCampo} className="flex flex-wrap items-end gap-3 pt-2" botao="Adicionar campo" resetar>
            <Campo rotulo="Novo campo">
              <input name="rotulo" placeholder="ex.: Instagram" className={inp} />
            </Campo>
            <Campo rotulo="Tipo">
              <select name="tipo" className={inp}>
                <option value="texto">Texto</option>
                <option value="textarea">Texto longo</option>
                <option value="data">Data</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
            </Campo>
            <label className="flex items-center gap-1 text-sm pb-2">
              <input type="checkbox" name="obrigatorio" /> Obrigatório
            </label>
          </Form>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-medium">Plano</h2>
        <p className="text-sm muted">Gestão de assinatura da plataforma: fora do escopo desta versão (ver LOG.md).</p>
      </section>
    </div>
  );
}
