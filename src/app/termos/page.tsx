import Link from "next/link";
import { CONTATO, Documento, Lista, Secao } from "@/components/Documento";

export const metadata = { title: "Termos de uso" };

export default function Page() {
  return (
    <Documento titulo="Termos de uso do Agendou">
      <p>
        Estes termos regem o uso do <strong>Agendou</strong>, sistema on-line de gestão para barbearias (agenda, clientes, financeiro,
        cobranças e planos para clientes). Ao criar uma conta ou usar o sistema, você declara que leu e concorda com estes termos e com a{" "}
        <Link href="/privacidade" className="text-white underline underline-offset-4">
          Política de privacidade
        </Link>
        .
      </p>

      <Secao n={1} titulo="Quem é quem">
        <Lista
          itens={[
            <>
              <strong>Agendou</strong>: a plataforma e quem a mantém.
            </>,
            <>
              <strong>Barbearia (você)</strong>: quem cria a conta e usa o painel, incluindo dono, administradores e profissionais cadastrados por ele.
            </>,
            <>
              <strong>Clientes da barbearia</strong>: as pessoas atendidas, que agendam pela página pública da barbearia.
            </>,
          ]}
        />
      </Secao>

      <Secao n={2} titulo="Conta e acesso">
        <Lista
          itens={[
            "Para criar a conta, informe dados verdadeiros: nome da barbearia, seu nome, celular e uma senha.",
            "O celular é o seu login. Guarde a senha com cuidado: você responde pelo que for feito com o seu acesso e pelos acessos que criar para a sua equipe.",
            "Avise-nos imediatamente se suspeitar de uso indevido da sua conta.",
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Planos, preços e pagamento">
        <Lista
          itens={[
            <>
              <strong>Gratuito (R$ 0)</strong>: todos os recursos, com limite de até <strong>15 clientes cadastrados</strong>. Atingido o limite,
              o cadastro de novos clientes fica bloqueado até a contratação de um plano pago. Nenhum dado é apagado.
            </>,
            <>
              <strong>Mensal (R$ 59,90)</strong>, <strong>Trimestral (R$ 159,90)</strong> e <strong>Anual (R$ 599,90)</strong>: os mesmos
              recursos, sem o limite de 15 clientes. Cada pagamento libera, respectivamente, 1, 3 ou 12 meses de uso.
            </>,
            "Os pagamentos são processados pela AbacatePay, por Pix ou cartão. O Agendou não recebe nem guarda os dados do seu cartão.",
            "Não há renovação automática nem cobrança recorrente. Perto do vencimento, o painel avisa, e você decide se renova. Pagar antes de vencer soma o novo período ao atual.",
            "O plano só é liberado depois que a AbacatePay confirma o pagamento. Ao fim do período pago, a conta volta ao plano Gratuito, com o limite de 15 clientes.",
            "Os preços podem mudar. Mudanças não afetam períodos já pagos e serão informadas com antecedência.",
            <>
              Você pode desistir da contratação em até <strong>7 dias</strong> a contar do pagamento, conforme o artigo 49 do Código de Defesa do
              Consumidor, escrevendo para {CONTATO}.
            </>,
          ]}
        />
      </Secao>

      <Secao n={4} titulo="Uso permitido">
        <p>Você se compromete a usar o Agendou só para gerir a sua barbearia, de forma lícita. Não é permitido:</p>
        <Lista
          itens={[
            "cadastrar dados de pessoas sem uma base legal adequada (por exemplo, sem relação de atendimento ou sem consentimento, quando ele for exigido);",
            "enviar mensagens indesejadas (spam) pelos recursos de WhatsApp;",
            "tentar acessar dados de outras barbearias, burlar limites do plano ou atrapalhar o funcionamento do sistema;",
            "revender ou copiar o sistema sem autorização.",
          ]}
        />
      </Secao>

      <Secao n={5} titulo="Dados dos seus clientes">
        <p>
          Os dados dos clientes que você cadastra ou que agendam pela sua página pertencem à sua barbearia. Pela Lei Geral de Proteção de Dados (LGPD),
          a barbearia é a <strong>controladora</strong> desses dados e o Agendou atua como <strong>operador</strong>, tratando-os apenas para prestar o
          serviço. Cabe a você informar seus clientes sobre o uso dos dados e atender aos pedidos deles. Detalhes na{" "}
          <Link href="/privacidade" className="text-white underline underline-offset-4">
            Política de privacidade
          </Link>
          .
        </p>
      </Secao>

      <Secao n={6} titulo="Integrações de terceiros">
        <Lista
          itens={[
            "Pagamento da assinatura: AbacatePay, sujeito aos termos dela.",
            "WhatsApp: opcional. Usa o número da própria barbearia na API oficial da Meta, conectado por você; as mensagens são cobradas pela Meta na conta da barbearia, conforme a tabela dela.",
            "O Agendou não responde por falhas, indisponibilidades ou cobranças desses serviços, mas trabalha para que a integração funcione corretamente.",
          ]}
        />
      </Secao>

      <Secao n={7} titulo="Pagamento online dos seus clientes">
        <p>
          O pagamento de atendimentos por Pix ou cartão na página de agendamento ainda está em implantação e funciona apenas em modo de testes, sem
          movimentar dinheiro. Até ser liberado, os recebimentos dos seus clientes são registrados por você no painel.
        </p>
      </Secao>

      <Secao n={8} titulo="Disponibilidade e responsabilidade">
        <Lista
          itens={[
            "Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de fornecedores de infraestrutura.",
            "O Agendou é uma ferramenta de organização: as decisões de negócio, os preços que você cobra e o relacionamento com seus clientes são de sua responsabilidade.",
            "Recomendamos exportar periodicamente seus relatórios (há exportação em CSV no painel).",
          ]}
        />
      </Secao>

      <Secao n={9} titulo="Encerramento da conta">
        <p>
          Você pode pedir o encerramento da conta e a exclusão dos dados a qualquer momento, escrevendo para {CONTATO} a partir do celular ou e-mail
          cadastrado. Podemos suspender contas que violem estes termos, avisando antes sempre que possível.
        </p>
      </Secao>

      <Secao n={10} titulo="Alterações e contato">
        <p>
          Estes termos podem ser atualizados. A data no topo indica a última versão, e mudanças relevantes serão avisadas no painel. Dúvidas:{" "}
          <a href={`mailto:${CONTATO}`} className="text-white underline underline-offset-4">
            {CONTATO}
          </a>
          . Estes termos seguem a legislação brasileira.
        </p>
      </Secao>
    </Documento>
  );
}
