import Link from "next/link";
import { notificacoesRecentes } from "@/lib/consultas/historicos";
import { inscricoesPush } from "@/lib/consultas/push";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { linkWhatsapp } from "@/lib/mensagens";
import { Icone } from "@/components/ui";
import { Cabecalho } from "../../Form";
import PushManager from "./PushManager";
import { removerInscricaoPush } from "../../acoes-push";

export const metadata = { title: "Notificações" };

const STATUS: Record<string, { rotulo: string; classe: string; dica: string }> = {
  pendente: { rotulo: "Na fila", classe: "badge-neutro", dica: "Aguardando envio" },
  nao_enviado: { rotulo: "Não enviada", classe: "badge-warn", dica: "Não saiu automaticamente" },
  aceito: { rotulo: "Aceita", classe: "badge-neutro", dica: "Aceita pelo provedor; entrega ainda não confirmada" },
  enviado: { rotulo: "Enviada", classe: "badge-ok", dica: "Confirmado pelo provedor" },
  entregue: { rotulo: "Entregue", classe: "badge-ok", dica: "Chegou no celular do cliente" },
  lido: { rotulo: "Lida", classe: "badge-ok", dica: "O cliente abriu a mensagem" },
  falhou: { rotulo: "Falhou", classe: "badge-danger", dica: "O provedor recusou ou não conseguiu entregar" },
};

const TIPOS: Record<string, string> = {
  confirmacao: "Confirmação",
  lembrete: "Lembrete",
  codigo: "Código de verificação",
  cancelamento: "Cancelamento",
  remarcacao: "Remarcação",
  aviso_empresa: "Aviso para a barbearia",
  teste: "Teste",
  cobranca_mensalidade: "Cobrança de mensalidade",
};

export default async function Page() {
  const u = await usuarioOuLogin();
  const usuarioIdFiltro = u.papel === "profissional" ? u.id : undefined;
  const [ns, inscritos] = await Promise.all([notificacoesRecentes(u.empresa_id), inscricoesPush(u.empresa_id, usuarioIdFiltro)]);

  return (
    <>
      <Cabecalho
        titulo="Notificações"
        descricao="Mensagens automáticas geradas pelo sistema (WhatsApp e push) e o status real de cada uma."
      >
        <Link href="/painel/whatsapp" className="btn btn-sutil">
          <Icone nome="whatsapp" tamanho={15} /> Configurar WhatsApp
        </Link>
      </Cabecalho>

      {/* ── Seção: notificações push ── */}
      <section className="mb-8 card p-4 grid gap-4">
        <div>
          <h2 className="font-semibold">Notificações push</h2>
          <p className="text-sm muted mt-0.5">
            Receba alertas neste aparelho quando um cliente agendar, cancelar ou remarcar.
          </p>
        </div>
        <PushManager />

        {inscritos.length > 0 && (
          <div>
            <p className="text-xs muted mb-2">Aparelhos inscritos ({inscritos.length})</p>
            <ul className="grid gap-2">
              {inscritos.map((ins) => (
                <li key={ins.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{ins.aparelho ?? "Aparelho desconhecido"}</span>
                    <span className="ml-2 text-xs muted">{formatarDataHora(ins.criado_em)}</span>
                  </span>
                  <form action={removerInscricaoPush.bind(null, ins.id)}>
                    <button className="btn btn-sutil btn-sm">Remover</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Histórico de notificações ── */}
      <ul className="grid gap-2">
        {ns.length === 0 && <li className="faint">Nenhuma notificação ainda.</li>}
        {ns.map((n) => {
          const st = STATUS[n.status] ?? { rotulo: n.status, classe: "badge-neutro", dica: "" };
          const ehCodigo = n.tipo === "codigo" || /código de verificação é \d{6}/.test(n.mensagem);
          const texto = n.mensagem.replace(/código de verificação é \d{6}/, "código de verificação é ••••••");
          const ehPush = n.canal === "push";
          const manual = !ehPush && (n.status === "nao_enviado" || n.status === "falhou") && !ehCodigo && n.tipo !== "aviso_empresa" && n.tipo !== "teste";
          const destino = ehPush ? "painel" : formatarTelefone(n.destino);
          return (
            <li key={n.id} className="card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs muted">
                <span>
                  {n.tipo ? `${TIPOS[n.tipo] ?? n.tipo} · ` : ""}
                  {n.canal} → {destino}
                </span>
                <span className="flex items-center gap-2">
                  {formatarDataHora(n.criado_em)}
                  <span className={`badge ${st.classe}`} title={st.dica}>
                    {st.rotulo}
                  </span>
                </span>
              </div>
              <p className="mt-1">{texto}</p>
              {(n.erro || manual) && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {n.erro ? <p className="text-xs text-[#ffcf8a]">Motivo: {n.erro}</p> : <span />}
                  {manual && (
                    <a href={linkWhatsapp(n.destino, n.mensagem)} target="_blank" rel="noreferrer" className="btn btn-sutil btn-sm">
                      <Icone nome="whatsapp" tamanho={13} /> Enviar pelo meu WhatsApp
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
