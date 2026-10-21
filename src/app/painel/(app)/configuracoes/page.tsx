import { q, q1 } from "@/lib/db";
import { usuarioPainel } from "@/lib/sessao";
import { configAgendamento, configTema } from "@/lib/empresa";
import type { CampoPersonalizado, Empresa } from "@/lib/tipos";
import { salvarCampo, salvarEmpresa, salvarRegras, salvarTema } from "../../acoes";
import { Campo, Form, inp } from "../../Form";

export const metadata = { title: "Configurações" };

export default async function Page() {
  const u = (await usuarioPainel())!;
  const [e, tema, cfg, campos] = await Promise.all([
    q1<Empresa>(`select * from empresa where id = $1`, [u.empresa_id]),
    configTema(u.empresa_id),
    configAgendamento(u.empresa_id),
    q<CampoPersonalizado>(`select * from campo_personalizado where empresa_id = $1 order by ordem`, [u.empresa_id]),
  ]);
  const card = "rounded-2xl bg-white p-4 shadow-sm";

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Empresa</h2>
        <Form action={salvarEmpresa} className="grid gap-3 md:grid-cols-2">
          <Campo rotulo="Nome">
            <input name="nome" required defaultValue={e!.nome} className={inp} />
          </Campo>
          <Campo rotulo="Endereço da página (agendou/…)">
            <input name="slug" required defaultValue={e!.slug} className={inp} />
          </Campo>
          <Campo rotulo="WhatsApp da empresa (recebe avisos de novos agendamentos)">
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

      <section className={card}>
        <h2 className="mb-3 font-semibold">Cores da página pública</h2>
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
              <input type="color" name={k} defaultValue={tema[k]} className="h-10 w-full rounded-lg border" />
            </Campo>
          ))}
        </Form>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Regras de agendamento e pagamento</h2>
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
        <p className="mt-3 text-xs text-slate-500">Pagamentos rodam em modo de teste (sandbox): nenhum valor real é cobrado.</p>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Campos extras do formulário de agendamento</h2>
        <div className="grid gap-2">
          {campos.map((c) => (
            <Form key={c.id} action={salvarCampo} className="flex flex-wrap items-end gap-3 border-b pb-2">
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
        <h2 className="mb-1 font-semibold">Plano</h2>
        <p className="text-sm text-slate-500">Gestão de assinatura da plataforma: fora do escopo desta versão (ver LOG.md).</p>
      </section>
    </div>
  );
}
