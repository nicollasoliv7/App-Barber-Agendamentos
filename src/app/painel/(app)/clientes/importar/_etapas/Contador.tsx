/** Número de destaque usado nos resumos da revisão e do resultado. */
export default function Contador({ rotulo, valor, classe = "", texto }: { rotulo: string; valor: number; classe?: string; texto?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="text-xs muted">{rotulo}</div>
      <div className={`text-2xl font-semibold num ${classe}`}>{valor}</div>
      {texto && <div className="text-[11px] faint">{texto}</div>}
    </div>
  );
}
