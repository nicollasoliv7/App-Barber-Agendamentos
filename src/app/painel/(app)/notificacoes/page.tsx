import { q } from "@/lib/db";
import { usuarioOuLogin } from "@/lib/painel";
import { formatarDataHora } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/validacao";

export const metadata = { title: "Notificações" };

export default async function Page() {
  const u = await usuarioOuLogin();
  const ns = await q<{ id: string; canal: string; destino: string; mensagem: string; status: string; criado_em: Date }>(
    `select id, canal, destino, mensagem, status, criado_em from notificacao where empresa_id = $1 order by criado_em desc limit 100`,
    [u.empresa_id],
  );
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-sm muted">
          Mensagens de WhatsApp/SMS geradas pelo sistema. Sem um provedor configurado (variável <code>WHATSAPP_API_URL</code>), o envio é
          simulado e a mensagem fica registrada aqui.
        </p>
      </div>
      <ul className="grid gap-2">
        {ns.length === 0 && <li className="faint">Nenhuma notificação ainda.</li>}
        {ns.map((n) => (
          <li key={n.id} className="card p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-xs muted">
              <span>
                {n.canal} → {formatarTelefone(n.destino)}
              </span>
              <span>
                {formatarDataHora(n.criado_em)} · {n.status}
              </span>
            </div>
            <p className="mt-1">{n.mensagem.replace(/código de verificação é \d{6}/, "código de verificação é ••••••")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
