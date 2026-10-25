import Link from "next/link";
import { CONTATO, Documento, Lista, Secao } from "@/components/Documento";

export const metadata = { title: "Política de privacidade" };

export default function Page() {
  return (
    <Documento titulo="Política de privacidade do Agendou">
      <p>
        Esta política explica quais dados o <strong>Agendou</strong> trata, para quê, com quem compartilha e quais são os seus direitos, de acordo
        com a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD). Ela vale para quem usa o painel (barbearias e suas equipes) e para os
        clientes que agendam pelas páginas das barbearias.
      </p>

      <Secao n={1} titulo="Papéis de cada um">
        <Lista
          itens={[
            <>
              <strong>Dados da barbearia e da equipe</strong> (conta, login, assinatura): o Agendou é o <strong>controlador</strong>.
            </>,
            <>
              <strong>Dados dos clientes da barbearia</strong> (cadastros, agendamentos, histórico): a barbearia é a <strong>controladora</strong> e o
              Agendou é o <strong>operador</strong>, que trata esses dados só para prestar o serviço à barbearia, seguindo as instruções dela.
            </>,
          ]}
        />
      </Secao>

      <Secao n={2} titulo="Quais dados tratamos">
        <p>
          <strong>Barbearia e equipe:</strong> nome da barbearia, nome das pessoas, celular (usado como login), e-mail quando informado, senha
          (guardada só em forma criptografada, nunca em texto), papel de acesso e o histórico de pagamentos da assinatura (plano, valor, datas e
          situação).
        </p>
        <p>
          <strong>Clientes da barbearia:</strong> nome, celular, e-mail e observações quando informados, campos extras que a barbearia decidir pedir
          (por exemplo CPF ou data de nascimento), agendamentos, serviços, valores, pagamentos registrados, planos contratados e as notificações
          enviadas.
        </p>
        <p>
          <strong>Dados técnicos:</strong> um cookie de sessão necessário para manter você conectado e registros técnicos de acesso e de erros.
          Não usamos cookies de publicidade. Se a barbearia configurar um pixel de campanha na página dela, ele só é carregado depois que o visitante
          aceita o aviso de privacidade.
        </p>
        <p>
          <strong>Pagamentos:</strong> o pagamento da assinatura acontece na página da AbacatePay. O Agendou não recebe nem guarda número de cartão,
          código de segurança ou dados bancários.
        </p>
      </Secao>

      <Secao n={3} titulo="Para que usamos e com qual base legal">
        <Lista
          itens={[
            "Criar e manter a conta, permitir o login e prestar o serviço contratado (execução de contrato).",
            "Liberar o plano pago após a confirmação do pagamento e manter o histórico de cobranças (execução de contrato e cumprimento de obrigação legal).",
            "Enviar confirmações e lembretes de agendamento pelo WhatsApp da barbearia, quando ela conectar o próprio número (legítimo interesse da barbearia e execução do serviço contratado pelo cliente).",
            "Proteger a plataforma contra fraudes e acessos indevidos (legítimo interesse).",
            "Atender pedidos e dúvidas enviados para o nosso contato.",
          ]}
        />
        <p>Não vendemos dados pessoais nem os usamos para publicidade.</p>
      </Secao>

      <Secao n={4} titulo="Com quem compartilhamos">
        <p>Apenas com fornecedores necessários para o funcionamento do serviço:</p>
        <Lista
          itens={[
            <>
              <strong>Vercel</strong>: hospedagem do sistema.
            </>,
            <>
              <strong>Supabase</strong>: banco de dados.
            </>,
            <>
              <strong>AbacatePay</strong>: processamento do pagamento da assinatura.
            </>,
            <>
              <strong>Meta (WhatsApp)</strong>: envio de mensagens, somente quando a barbearia conecta o próprio número.
            </>,
          ]}
        />
        <p>
          Parte desses fornecedores mantém servidores fora do Brasil (por exemplo, nos Estados Unidos). Nesses casos a transferência internacional
          acontece para viabilizar o serviço, com fornecedores que adotam medidas de segurança compatíveis com a LGPD. Também podemos compartilhar
          dados quando a lei ou uma autoridade competente exigir.
        </p>
      </Secao>

      <Secao n={5} titulo="Como protegemos os dados">
        <Lista
          itens={[
            "Senhas guardadas com hash (scrypt), nunca em texto.",
            "Conexões criptografadas (HTTPS) e credenciais de integrações guardadas criptografadas.",
            "Separação entre barbearias: cada uma só acessa os próprios dados, com regras aplicadas no servidor e no banco de dados.",
            "Os dados brutos de planilhas importadas são apagados ao concluir ou cancelar a importação, e os códigos de verificação são apagados logo após o envio.",
          ]}
        />
      </Secao>

      <Secao n={6} titulo="Por quanto tempo guardamos">
        <p>
          Mantemos os dados enquanto a conta da barbearia estiver ativa. Quando a barbearia pede o encerramento, os dados são excluídos, exceto o que
          a lei obrigar a guardar por mais tempo (por exemplo, registros de pagamentos). Sessões de login expiram em 30 dias.
        </p>
      </Secao>

      <Secao n={7} titulo="Seus direitos">
        <p>
          Pela LGPD, você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão, portabilidade, informação
          sobre compartilhamentos e revisão de consentimentos.
        </p>
        <Lista
          itens={[
            <>
              <strong>Se você é uma barbearia ou faz parte da equipe:</strong> escreva para {CONTATO}.
            </>,
            <>
              <strong>Se você é cliente de uma barbearia:</strong> fale primeiro com a própria barbearia, que é a responsável pelos seus dados. Se
              precisar, escreva para {CONTATO} que encaminhamos o pedido a ela.
            </>,
          ]}
        />
        <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </Secao>

      <Secao n={8} titulo="Alterações e contato">
        <p>
          Esta política pode ser atualizada; a data no topo indica a versão em vigor. Dúvidas ou pedidos:{" "}
          <a href={`mailto:${CONTATO}`} className="text-white underline underline-offset-4">
            {CONTATO}
          </a>
          . Veja também os{" "}
          <Link href="/termos" className="text-white underline underline-offset-4">
            Termos de uso
          </Link>
          .
        </p>
      </Secao>
    </Documento>
  );
}
