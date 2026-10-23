/** Componentes visuais compartilhados (servidor e cliente). */

export function Aurora({ suave = false }: { suave?: boolean }) {
  return (
    <div className={`aurora ${suave ? "suave" : ""}`} aria-hidden="true">
      <div className="blade b1" />
      <div className="blade b2" />
      <div className="blade b3" />
      <div className="blade b4" />
      <div className="grain" />
      <div className="vignette" />
    </div>
  );
}

export function Logo({ nome = "Agendou", className = "" }: { nome?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb347" />
            <stop offset=".5" stopColor="#ff6b4a" />
            <stop offset="1" stopColor="#ff2f3a" />
          </linearGradient>
        </defs>
        <path d="M12 1.5 22.5 12 12 22.5 1.5 12Z" fill="url(#lg-logo)" />
        <path d="M12 7 17 12 12 17 7 12Z" fill="#07080a" opacity=".55" />
      </svg>
      {nome}
    </span>
  );
}

type IconeNome =
  | "calendario"
  | "recorrente"
  | "usuarios"
  | "tesoura"
  | "pessoa"
  | "relogio"
  | "bloqueio"
  | "dinheiro"
  | "sino"
  | "engrenagem"
  | "grafico"
  | "lista"
  | "upload"
  | "link"
  | "busca"
  | "seta"
  | "check"
  | "x"
  | "mapa"
  | "whatsapp"
  | "copiar"
  | "download"
  | "sair"
  | "escudo"
  | "raio"
  | "alerta";

const PATHS: Record<IconeNome, string> = {
  calendario: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  usuarios: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74",
  tesoura: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12",
  pessoa: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  relogio: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  bloqueio: "M5.6 5.6l12.8 12.8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  dinheiro: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  sino: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  engrenagem:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  grafico: "M3 3v18h18M7 15v2M11 11v6M15 8v9M19 5v12",
  lista: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  busca: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  seta: "M5 12h14M13 5l7 7-7 7",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  mapa: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  whatsapp: "M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.5L3 21ZM9 9.5c.3 2.3 2.2 4.4 4.6 5l1.2-1.1 2 .9-.4 1.6c-3.6.6-8-3.6-7.5-7.3l1.7-.4.8 2.1L9 9.5Z",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4",
  raio: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  recorrente: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  alerta: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
};

export function Icone({ nome, tamanho = 16, className = "" }: { nome: IconeNome; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[nome]} />
    </svg>
  );
}

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  confirmado: { rotulo: "Confirmado", classe: "badge-ok" },
  pendente_pagamento: { rotulo: "Aguardando Pix", classe: "badge-warn" },
  concluido: { rotulo: "Concluído", classe: "badge-neutro" },
  cancelado: { rotulo: "Cancelado", classe: "badge-danger" },
  faltou: { rotulo: "Faltou", classe: "badge-warn" },
};
export const ROTULO_STATUS = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.rotulo]));

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, classe: "badge-neutro" };
  return <span className={`badge ${s.classe}`}>{s.rotulo}</span>;
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  variacao,
  icone,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  /** variação percentual vs. período anterior (null = sem base de comparação) */
  variacao?: number | null;
  icone?: IconeNome;
}) {
  return (
    <div className="card p-4 surgir">
      <div className="flex items-center gap-2 text-xs muted">
        {icone && <Icone nome={icone} tamanho={14} />}
        {rotulo}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight num">{valor}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {variacao !== undefined && variacao !== null && (
          <span className={variacao >= 0 ? "text-[#7ee2b0]" : "text-[#ff9aa2]"} aria-label={`variação de ${variacao}%`}>
            {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao)}%
          </span>
        )}
        {detalhe && <span className="faint">{detalhe}</span>}
      </div>
    </div>
  );
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mt-1 text-sm muted">{texto}</p>}
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}
