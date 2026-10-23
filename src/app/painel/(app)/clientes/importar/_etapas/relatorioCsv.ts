/** Gera e baixa no navegador um CSV (separador ;, UTF-8 com BOM) com os relatórios da importação. */
export function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
