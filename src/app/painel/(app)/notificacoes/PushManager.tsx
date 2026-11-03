"use client";
import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function detectarAparelho(): string {
  const ua = navigator.userAgent;
  const plat = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : "Desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} · ${plat}`;
}

type Estado = "carregando" | "nao_suportado" | "ios_instrucoes" | "bloqueado" | "ativo" | "inativo";

export default function PushManager() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [msg, setMsg] = useState("");
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("nao_suportado");
      return;
    }
    // Detecta iOS Safari fora do modo standalone
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone) {
      setEstado("ios_instrucoes");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    });
  }, []);

  async function ativar() {
    setMsg("");
    try {
      const res = await fetch("/api/push/chave-publica");
      const { vapidPublicKey } = (await res.json()) as { vapidPublicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
      const r = await fetch("/api/push/inscricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth, aparelho: detectarAparelho() }),
      });
      if (!r.ok) throw new Error("Falha ao salvar inscrição");
      setEstado("ativo");
      setMsg("Notificações ativadas neste aparelho.");
    } catch {
      setMsg("Não foi possível ativar. Verifique as permissões do navegador.");
    }
  }

  async function desativar() {
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = sub.toJSON() as { endpoint: string };
        await sub.unsubscribe();
        await fetch("/api/push/inscricao", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setEstado("inativo");
      setMsg("Notificações desativadas neste aparelho.");
    } catch {
      setMsg("Não foi possível desativar. Tente novamente.");
    }
  }

  async function enviarTeste() {
    setTestando(true);
    setMsg("");
    try {
      const r = await fetch("/api/push/teste", { method: "POST" });
      const d = (await r.json()) as { mensagem?: string; erro?: string };
      setMsg(d.mensagem ?? d.erro ?? "Teste enviado.");
    } catch {
      setMsg("Falha ao enviar o teste.");
    } finally {
      setTestando(false);
    }
  }

  if (estado === "carregando") return <p className="text-sm muted">Verificando suporte a notificações…</p>;

  if (estado === "nao_suportado") return <p className="text-sm muted">Este navegador não suporta notificações push.</p>;

  if (estado === "ios_instrucoes") {
    return (
      <div className="card p-4 text-sm">
        <p className="font-medium">Como ativar no iPhone / iPad (iOS 16.4+)</p>
        <ol className="mt-2 muted list-decimal list-inside space-y-1">
          <li>
            Toque no ícone <strong>Compartilhar</strong> (seta para cima) no Safari
          </li>
          <li>
            Role e toque em <strong>"Adicionar à Tela de Início"</strong>
          </li>
          <li>
            Confirme com <strong>"Adicionar"</strong>
          </li>
          <li>Abra o Agendou pela Tela de Início e volte a esta página para ativar</li>
        </ol>
      </div>
    );
  }

  if (estado === "bloqueado") {
    return (
      <p className="text-sm text-[#ffcf8a]">
        Notificações bloqueadas neste navegador. Para ativar, clique no cadeado na barra de endereço e permita notificações para este site.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {estado === "ativo" ? (
        <>
          <span className="text-sm text-[#7ee2b0]">✓ Ativo neste aparelho</span>
          <button onClick={desativar} className="btn btn-sutil btn-sm">
            Desativar
          </button>
          <button onClick={enviarTeste} disabled={testando} className="btn btn-sutil btn-sm">
            {testando ? "Enviando…" : "Enviar notificação de teste"}
          </button>
        </>
      ) : (
        <button onClick={ativar} className="btn btn-quente">
          Ativar notificações neste aparelho
        </button>
      )}
      {msg && (
        <p role="status" aria-live="polite" className="text-sm w-full">
          {msg}
        </p>
      )}
    </div>
  );
}
