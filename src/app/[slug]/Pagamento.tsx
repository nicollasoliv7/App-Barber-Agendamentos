"use client";

import { useCallback, useEffect, useState } from "react";
import { reais } from "@/lib/tempo";
import { api, type PagamentoCfg } from "./cliente-api";

type Pix = {
  id: string;
  valor_centavos: number;
  status: string;
  pix_copia_cola: string;
  qr_data_url: string;
  expira_em: string;
};
type Cartao = { id: string; bandeira: string; ultimos4: string; validade_mes: number; validade_ano: number; favorito: boolean };

interface Props {
  agendamentoId: string;
  token?: string;
  preco: number;
  cfg: PagamentoCfg;
  obrigatorio: boolean;
  logado?: boolean;
  onPago: () => void;
  onCancelado: () => void;
}

export default function Pagamento({ agendamentoId, token, preco, cfg, obrigatorio, logado, onPago, onCancelado }: Props) {
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [tipo, setTipo] = useState<"minimo" | "integral">(cfg.tipo === "minimo" ? "minimo" : "integral");
  const [pix, setPix] = useState<Pix | null>(null);
  const [restante, setRestante] = useState(0);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);

  const minimo = Math.max(1, Math.ceil((preco * cfg.minimo_pct) / 100));
  const valor = tipo === "minimo" ? minimo : preco;
  const qs = token ? `?token=${token}` : "";

  const gerarPix = useCallback(async () => {
    setErro("");
    setOcupado(true);
    try {
      const r = await api<{ pagamento: Pix }>(`/api/pagamentos/pix`, { json: { agendamento: agendamentoId, token, tipo } });
      setPix(r.pagamento);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }, [agendamentoId, token, tipo]);

  // contador + consulta de status a cada 3 s
  useEffect(() => {
    if (!pix) return;
    const fim = new Date(pix.expira_em).getTime();
    const tick = () => setRestante(Math.max(0, Math.round((fim - Date.now()) / 1000)));
    tick();
    const t1 = setInterval(tick, 1000);
    const t2 = setInterval(async () => {
      try {
        const r = await api<{ pagamento: { status: string } }>(`/api/pagamentos/${pix.id}${qs}`);
        if (r.pagamento.status === "pago") onPago();
        else if (r.pagamento.status === "expirado") {
          setPix(null);
          setErro(obrigatorio ? "O tempo do Pix acabou e o horário foi liberado." : "O Pix expirou. Gere um novo código.");
          if (obrigatorio) onCancelado();
        }
      } catch {}
    }, 3000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [pix, qs, obrigatorio, onPago, onCancelado]);

  useEffect(() => {
    if (metodo === "cartao" && logado && cartoes === null)
      api<{ cartoes: Cartao[] }>(`/api/cliente/cartoes`).then((r) => setCartoes(r.cartoes)).catch(() => setCartoes([]));
  }, [metodo, logado, cartoes]);

  async function simular() {
    if (!pix) return;
    setOcupado(true);
    try {
      await api(`/api/pagamentos/${pix.id}/simular`, { json: { token } });
      onPago();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (pix) await api(`/api/pagamentos/${pix.id}/cancelar`, { json: { token } }).catch(() => {});
    if (obrigatorio) onCancelado();
    else setPix(null);
  }

  async function pagarCartao(cartaoId: string) {
    setErro("");
    setOcupado(true);
    try {
      await api(`/api/pagamentos/cartao`, { json: { agendamento: agendamentoId, cartao: cartaoId, tipo } });
      onPago();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const mm = String(Math.floor(restante / 60)).padStart(2, "0");
  const ss = String(restante % 60).padStart(2, "0");

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
        Ambiente de teste (sandbox): nenhum valor real é cobrado.
      </div>

      {!pix && (
        <>
          <div className="flex gap-2">
            {(["pix", "cartao"] as const).map((m) => (
              <button key={m} onClick={() => setMetodo(m)} data-ativo={metodo === m} className="chip cartao flex-1 rounded-lg py-2 font-medium">
                {m === "pix" ? "Pix" : "Cartão"}
              </button>
            ))}
          </div>

          {cfg.tipo === "cliente_escolhe" && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setTipo("minimo")} data-ativo={tipo === "minimo"} className="chip cartao rounded-lg p-3 text-left">
                <div className="text-xs suave">Sinal ({cfg.minimo_pct}%)</div>
                <div className="font-semibold">{reais(minimo)}</div>
              </button>
              <button onClick={() => setTipo("integral")} data-ativo={tipo === "integral"} className="chip cartao rounded-lg p-3 text-left">
                <div className="text-xs suave">Valor integral</div>
                <div className="font-semibold">{reais(preco)}</div>
              </button>
            </div>
          )}
          {cfg.tipo !== "cliente_escolhe" && (
            <p className="text-center">
              Valor a pagar: <strong>{reais(valor)}</strong>
              {tipo === "minimo" && <span className="suave text-sm"> (sinal de {cfg.minimo_pct}%)</span>}
            </p>
          )}

          {metodo === "pix" ? (
            <button disabled={ocupado} onClick={gerarPix} className="btn rounded-lg py-3 font-semibold">
              {ocupado ? "Gerando…" : `Gerar código Pix de ${reais(valor)}`}
            </button>
          ) : !logado ? (
            <p className="text-sm suave text-center">
              Para pagar com cartão salvo, entre na aba <strong>Histórico</strong> com seu telefone e senha.
            </p>
          ) : (
            <Cartoes cartoes={cartoes} ocupado={ocupado} onPagar={pagarCartao} onAtualizar={() => setCartoes(null)} />
          )}
        </>
      )}

      {pix && (
        <div className="grid gap-3 text-center">
          <p>
            Pague <strong>{reais(pix.valor_centavos)}</strong> pelo Pix
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pix.qr_data_url} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
          <div className="flex gap-2">
            <input readOnly value={pix.pix_copia_cola} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-xs" aria-label="Pix copia e cola" />
            <button
              className="cartao rounded-lg px-3 text-sm"
              onClick={() => {
                navigator.clipboard?.writeText(pix.pix_copia_cola).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                });
              }}
            >
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="text-lg font-mono" aria-live="polite">
            Tempo restante: {mm}:{ss}
          </p>
          <p className="text-xs suave">Aguardando confirmação do pagamento…</p>
          <button disabled={ocupado} onClick={simular} className="btn rounded-lg py-3 font-semibold">
            Simular pagamento aprovado (teste)
          </button>
          <button onClick={cancelar} className="text-sm underline suave">
            Cancelar pagamento
          </button>
        </div>
      )}

      {erro && <p className="text-sm text-red-400 text-center">{erro}</p>}
    </div>
  );
}

function Cartoes({
  cartoes,
  ocupado,
  onPagar,
  onAtualizar,
}: {
  cartoes: Cartao[] | null;
  ocupado: boolean;
  onPagar: (id: string) => void;
  onAtualizar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ numero: "", validade: "", cvv: "" });
  const [erro, setErro] = useState("");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const [mes, ano] = f.validade.split("/").map((x) => Number(x));
    try {
      await api(`/api/cliente/cartoes`, { json: { numero: f.numero, mes, ano, cvv: f.cvv } });
      setNovo(false);
      setF({ numero: "", validade: "", cvv: "" });
      onAtualizar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  if (cartoes === null) return <p className="suave text-sm">Carregando cartões…</p>;
  return (
    <div className="grid gap-2">
      {cartoes.map((c) => (
        <div key={c.id} className="cartao flex items-center justify-between rounded-lg p-3 text-sm">
          <span className="first-letter:uppercase">
            {c.bandeira} •••• {c.ultimos4} {c.favorito && "★"}
          </span>
          <button disabled={ocupado} onClick={() => onPagar(c.id)} className="btn rounded-md px-3 py-1">
            Pagar
          </button>
        </div>
      ))}
      {!novo ? (
        <button onClick={() => setNovo(true)} className="cartao rounded-lg py-2 text-sm">
          + Cadastrar cartão
        </button>
      ) : (
        <form onSubmit={salvar} className="grid gap-2 text-sm">
          <input
            required
            inputMode="numeric"
            placeholder="Número do cartão"
            value={f.numero}
            onChange={(e) => setF({ ...f, numero: e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") })}
            className="rounded-lg px-3 py-2"
          />
          <div className="flex gap-2">
            <input
              required
              placeholder="MM/AA"
              value={f.validade}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                setF({ ...f, validade: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
              }}
              className="w-1/2 rounded-lg px-3 py-2"
            />
            <input
              required
              inputMode="numeric"
              placeholder="CVV"
              value={f.cvv}
              onChange={(e) => setF({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              className="w-1/2 rounded-lg px-3 py-2"
            />
          </div>
          <p className="text-xs suave">Teste: 4111 1111 1111 1111 (aprova) · 4000 0000 0000 0002 (recusa)</p>
          {erro && <p className="text-red-400">{erro}</p>}
          <button className="btn rounded-lg py-2">Salvar cartão</button>
        </form>
      )}
    </div>
  );
}
