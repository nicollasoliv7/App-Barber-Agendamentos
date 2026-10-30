import "server-only";

/**
 * Geração de BR Code (Pix copia-e-cola) estático — padrão EMV QR Code do BCB.
 * Referência: Manual de Padrões para Iniciação do Pix, versão 2.x.
 *
 * Formato estático: Point of Initiation = "11" (pode ser reutilizado).
 * O txid identifica a cobrança; nome e cidade passam por limpeza de acentos.
 */

export interface DadosPix {
  tipo: "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";
  chave: string;
  recebedor: string; // máx 25 chars no BR Code
  cidade: string;    // máx 15 chars no BR Code
}

// Codifica um campo TLV: id (2 dígitos) + comprimento (2 dígitos) + valor
const tlv = (id: string, valor: string) =>
  `${id}${String(valor.length).padStart(2, "0")}${valor}`;

function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Remove acentos e caracteres não permitidos; substitui espaços múltiplos
function sanitizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gera o payload de um BR Code Pix estático com valor fixo.
 *
 * @param pix     Dados da chave Pix da barbearia (de config_pix)
 * @param centavos Valor da mensalidade em centavos
 * @param cobrancaId UUID da assinatura_cobranca — vira o txid (25 chars alfanuméricos)
 */
export function gerarBRCode(pix: DadosPix, centavos: number, cobrancaId: string): string {
  const chave = pix.chave.trim().slice(0, 77); // chave Pix: máx 77 chars (email)
  const recebedor = sanitizar(pix.recebedor).slice(0, 25);
  const cidade = sanitizar(pix.cidade).slice(0, 15);
  const txid = cobrancaId.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "COBRANCA";
  const valor = (centavos / 100).toFixed(2);

  // Campo 26 — Merchant Account Information (Pix)
  const mai = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chave);

  // Campo 62 — Additional Data Field Template (txid)
  const adicional = tlv("05", txid);

  // Monta payload sem CRC
  const sem_crc =
    tlv("00", "01") +       // Payload Format Indicator
    tlv("01", "11") +       // Point of Initiation (estático)
    tlv("26", mai) +        // Merchant Account Information
    tlv("52", "0000") +     // Merchant Category Code
    tlv("53", "986") +      // Transaction Currency (BRL)
    tlv("54", valor) +      // Transaction Amount
    tlv("58", "BR") +       // Country Code
    tlv("59", recebedor) +  // Merchant Name
    tlv("60", cidade) +     // Merchant City
    tlv("62", adicional) +  // Additional Data
    "6304";                 // CRC placeholder (length + 4 hex chars)

  return sem_crc + crc16ccitt(sem_crc);
}

/** Valida se uma chave Pix tem formato aceitável para o tipo informado. */
export function validarChavePix(tipo: DadosPix["tipo"], chave: string): string | null {
  const v = chave.trim();
  if (!v) return "Informe a chave Pix";
  switch (tipo) {
    case "cpf":
      return /^\d{11}$/.test(v.replace(/\D/g, "")) ? null : "CPF deve ter 11 dígitos";
    case "cnpj":
      return /^\d{14}$/.test(v.replace(/\D/g, "")) ? null : "CNPJ deve ter 14 dígitos";
    case "telefone":
      return /^\+?\d{10,13}$/.test(v.replace(/[\s-]/g, "")) ? null : "Telefone inválido (ex.: +5511999999999)";
    case "email":
      return v.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "E-mail inválido";
    case "aleatoria":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
        ? null
        : "Chave aleatória deve ser um UUID (ex.: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)";
  }
}
