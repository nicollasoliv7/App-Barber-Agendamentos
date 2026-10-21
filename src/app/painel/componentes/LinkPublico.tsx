"use client";

import { useState } from "react";
import { Icone } from "@/components/ui";

/** Cartão para compartilhar o link de agendamento (copiar, WhatsApp, QR Code para imprimir). */
export default function LinkPublico({ url, caminho, nome, qr }: { url: string; caminho: string; nome: string; qr: string }) {
  const [copiado, setCopiado] = useState(false);
  const [verQr, setVerQr] = useState(false);
  const msg = encodeURIComponent(`Agende seu horário na ${nome} em poucos cliques, sem cadastro: ${url}`);
  return (
    <section className="card p-4" aria-labelledby="titulo-link">
      <h2 id="titulo-link" className="flex items-center gap-2 font-medium">
        <Icone nome="link" tamanho={15} /> Seu link de agendamento
      </h2>
      <p className="mt-1 text-xs muted">Coloque na bio do Instagram, no WhatsApp ou no Google. O cliente agenda sem criar conta.</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <span className="mono min-w-0 flex-1 truncate text-[12.5px]">
          {url}
        </span>
        <button
          className="btn btn-key btn-sm"
          onClick={() =>
            navigator.clipboard?.writeText(url).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1600);
            })
          }
        >
          <Icone nome={copiado ? "check" : "copiar"} tamanho={13} /> {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="btn btn-sutil btn-sm" href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer">
          <Icone nome="whatsapp" tamanho={13} /> Enviar no WhatsApp
        </a>
        <a className="btn btn-sutil btn-sm" href={caminho} target="_blank">
          <Icone nome="seta" tamanho={13} /> Abrir página
        </a>
        <button className="btn btn-sutil btn-sm" onClick={() => setVerQr(!verQr)} aria-expanded={verQr}>
          QR Code
        </button>
      </div>
      {verQr && (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR Code do link de agendamento da ${nome}`} className="h-28 w-28 rounded-lg bg-white p-1.5" />
          <div className="text-xs muted">
            Imprima e deixe no balcão ou no espelho.
            <a className="mt-2 flex w-fit items-center gap-1 text-white underline-offset-2 hover:underline" href={qr} download="qrcode-agendamento.png">
              <Icone nome="download" tamanho={13} /> Baixar PNG
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
