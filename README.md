# Agendou

App de agendamento para barbearias e salões: página pública por empresa, histórico do cliente, pagamentos em modo de teste e painel do dono.

## Rodar no Windows (jeito fácil)
Dê dois cliques em **`iniciar-agendou.bat`**. Na primeira vez ele instala as dependências (alguns minutos) e depois abre o navegador.

## Rodar pelo terminal
```bash
npm install
npm run dev
```
- Página pública: http://localhost:3000/barbearia-exemplo
- Painel: http://localhost:3000/painel — `dono@agendou.dev` / `agendou123` (acesso fictício, só no desenvolvimento)

O banco é criado sozinho em `.data/pglite` (Postgres embutido) com dados fictícios. Para zerar, apague a pasta `.data`.

## Testar pagamentos (sandbox)
- Pix: gere o código e clique em **Simular pagamento aprovado (teste)**. O contador expira no prazo configurado.
- Cartão (cliente logado no Histórico): `4111 1111 1111 1111` aprova; `4000 0000 0000 0002` é recusado. Qualquer validade futura e CVV.
- Nenhum valor real é cobrado.

## Variáveis de ambiente (opcionais) — ver `.env.example`
| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Usar Postgres/Supabase em vez do banco embutido |
| `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN` | Enviar notificações de verdade (sem isso, ficam registradas no painel) |
| `CRON_SECRET` | Proteger `POST /api/cron/expirar` |
| `PAGAMENTOS_SANDBOX=0` | Desliga o botão de simular pagamento |

## Documentação
`docs/MAPA_DE_TELAS.md`, `docs/MODELO_DE_DADOS.md`, `docs/REGRAS_DE_NEGOCIO.md`, `docs/ESTRUTURA_DO_APP.md`.
