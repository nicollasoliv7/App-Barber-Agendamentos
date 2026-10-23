import Link from "next/link";
import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";
import { linkWhatsapp } from "@/lib/mensagens";
import { Icone } from "@/components/ui";
import { Cabecalho } from "../../Form";

export const metadata = { title: "Notificações" };

const STATUS: Record<string, { rotulo: string; classe: string; dica: string }> = {
  pendente: { rotulo: "Na fila", classe: "badge-neutro", dica: "Aguardando envio" },
  nao_enviado: { rotulo: "Não enviada", classe: "badge-warn", dica: "Não saiu automaticamente" },
  aceito: { rotulo: "Aceita pela Meta", classe: "badge-neutro", dica: "A Meta aceitou; a entrega ainda não foi confirmada" },
  enviado: { rotulo: "Enviada", classe: "badge-ok", dica: "Confirmado pela Meta" },
  entregue: { rotulo: "Entregue", classe: "badge-ok", dica: "Chegou no celular do cliente" },
  lido: { rotulo: "Lida", classe: "badge-ok", dica: "O cliente abriu a mensagem" },
  falhou: { rotulo: "Falhou", classe: "badge-danger", dica: "A Meta recusou ou não conseguiu entregar" },
};

const TIPOS: Record<string, string> = {
  confirmacao: "Confirmação",
  lembrete: "Lembrete",
  codigo: "Código de verificação",
  cancelamento: "Cancelamento",
  remarcacao: "Remarcação",
  aviso_empresa: "Aviso para a barbearia",
  teste: "Teste",
};

export default async function Page() {
  const u = await usuarioOuLogin();
  const ns = await q<{ id: string; canal: string; tipo: string | null; destino: string; mensagem: string; status: string; erro: string | null; criado_em: Date }>(
    `select id, canal, tipo, destino, mensagem, status, erro, criado_em from notificacao where empresa_id = $1 order by criado_em desc limit 100`,
    [u.empresa_id],
  );
  return (
    <>
      <Cabecalho
        titulo="Notificações"
        descricao="Mensagens de WhatsApp geradas pelo sistema e o que de fato aconteceu com cada uma. Só aparece como enviada, entregue ou lida o que a Meta confirmou."
      >
        <Link href="/painel/whatsapp" className="btn btn-sutil">
          <Icone nome="whatsapp" tamanho={15} /> Configurar WhatsApp
        </Link>
      </Cabecalho>
      <ul className="grid gap-2">
        {ns.length === 0 && <li className="faint">Nenhuma notificação ainda.</li>}
        {ns.map((n) => {
          const st = STATUS[n.status] ?? { rotulo: n.status, classe: "badge-neutro", dica: "" };
          const ehCodigo = n.tipo === "codigo" || /código de verificação é \d{6}/.test(n.mensagem);
          const texto = n.mensagem.replace(/código de verificação é \d{6}/, "código de verificação é ••••••");
          const manual = (n.status === "nao_enviado" || n.status === "falhou") && !ehCodigo && n.tipo !== "aviso_empresa" && n.tipo !== "teste";
          return (
            <li key={n.id} className="card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs muted">
                <span>
                  {n.tipo ? `${TIPOS[n.tipo] ?? n.tipo} · ` : ""}
                  {n.canal} → {formatarTelefone(n.destino)}
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
