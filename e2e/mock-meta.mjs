// Servidor FALSO da Graph API da Meta, só para testes locais da integração com o WhatsApp.
// Uso: node e2e/mock-meta.mjs  (porta 4010) e, no app, WHATSAPP_GRAPH_URL=http://localhost:4010
// Nada aqui fala com a Meta de verdade. Dados 100% fictícios.
import http from "node:http";

const PORTA = Number(process.env.MOCK_PORTA ?? 4010);
const V = "v25.0";
export const TOKEN_OK = "EAATESTE_token_valido_0123456789abcdef";
export const TOKEN_OUTRA = "EAATESTE_token_da_outra_barbearia_98765";
let revogado = false;
const enviadas = [];
let seq = 0;

const NUMEROS = {
  "111111111111111": { waba: "222222222222222", token: TOKEN_OK, display: "+55 11 90000-0001", nome: "Barbearia Exemplo" },
  "333333333333333": { waba: "444444444444444", token: TOKEN_OUTRA, display: "+55 21 90000-0002", nome: "Outra Barbearia" },
};
const corpo6 = "Olá, {{1}}! Seu horário na {{2}} está confirmado: {{3}} com {{4}}, {{5}}. Para remarcar ou cancelar, acesse {{6}} Até breve!";
const MODELOS = [
  { name: "confirmacao_agendamento", language: "pt_BR", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: corpo6 }] },
  { name: "lembrete_agendamento", language: "pt_BR", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: corpo6.replace("Olá", "Lembrete") }] },
  {
    name: "codigo_verificacao",
    language: "pt_BR",
    status: "APPROVED",
    category: "AUTHENTICATION",
    components: [{ type: "BODY", text: "*{{1}}* é seu código de verificação." }, { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] }],
  },
  {
    name: "cobranca_mensalidade",
    language: "pt_BR",
    status: "APPROVED",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Olá {{1}}, a mensalidade do plano \"{{2}}\" ({{3}}) vence em {{4}}.\nPague com Pix: {{5}}" }],
  },
  { name: "modelo_em_analise", language: "pt_BR", status: "PENDING", category: "UTILITY", components: [{ type: "BODY", text: "Oi {{1}}" }] },
  { name: "hello_world", language: "en_US", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello World" }] },
];

const erro = (res, status, code, message) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code, message, type: "OAuthException" } }));
};
const json = (res, data) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    let body = "";
    for await (const c of req) body += c;

    // controles do teste
    if (u.pathname === "/__enviadas") return json(res, enviadas);
    if (u.pathname === "/__revogar") return (revogado = u.searchParams.get("v") !== "0"), json(res, { revogado });

    const partes = u.pathname.split("/").filter(Boolean); // [v25.0, id, sub?]
    if (partes[0] !== V) return erro(res, 400, 2500, "versão desconhecida");
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const dono = (id) => Object.entries(NUMEROS).find(([n, x]) => n === id || x.waba === id);
    const alvo = dono(partes[1]);
    if (!alvo) return erro(res, 400, 100, "Unsupported get request. Object does not exist");
    const [numero, info] = alvo;
    if (revogado || token !== info.token) return erro(res, 401, 190, "Invalid OAuth access token");

    if (req.method === "GET" && partes.length === 2) return json(res, { id: numero, display_phone_number: info.display, verified_name: info.nome });
    if (req.method === "GET" && partes[2] === "phone_numbers") return json(res, { data: [{ id: numero }] });
    if (req.method === "GET" && partes[2] === "message_templates") {
      const nome = u.searchParams.get("name");
      return json(res, { data: MODELOS.filter((m) => m.name === nome) });
    }
    if (req.method === "POST" && partes[2] === "messages") {
      const b = JSON.parse(body || "{}");
      if (b.to === "5511900009999") return erro(res, 400, 131030, "Recipient phone number not in allowed list");
      const id = `wamid.TESTE${++seq}`;
      enviadas.push({ id, numero, ...b });
      return json(res, { messaging_product: "whatsapp", contacts: [{ input: b.to, wa_id: b.to }], messages: [{ id }] });
    }
    erro(res, 404, 100, "rota desconhecida");
  })
  .listen(PORTA, () => console.log(`mock da Meta em http://localhost:${PORTA}`));
