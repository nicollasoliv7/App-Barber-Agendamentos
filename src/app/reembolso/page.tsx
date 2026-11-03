import Link from "next/link";
import { CONTATO, Documento, Lista, Secao } from "@/components/Documento";

export const metadata = { title: "Política de cancelamento e reembolso" };

export default function Page() {
  return (
    <Documento titulo="Política de cancelamento e reembolso do Agendou">
      <p>
        Esta política explica como funciona o cancelamento e o reembolso dos planos pagos do <strong>Agendou</strong>. Ela integra os{" "}
        <Link href="/termos" className="text-white underline underline-offset-4">
          Termos de uso
        </Link>
        .
      </p>

      <Secao n={1} titulo="Tipo de cobrança">
        <Lista
          itens={[
            <>
              Os planos pagos (<strong>Mensal</strong>, <strong>Trimestral</strong> e <strong>Anual</strong>) são cobrados uma única vez pelo
              período escolhido: 1, 3 ou 12 meses.
            </>,
            "Não há renovação automática nem cobrança recorrente. Perto do vencimento, o painel avisa e você decide se renova.",
            <>
              <strong>Plano Gratuito (R$ 0)</strong>: não há cobrança. A conta pode ser encerrada a qualquer momento sem custo.
            </>,
          ]}
        />
      </Secao>

      <Secao n={2} titulo="Direito de arrependimento (art. 49 do CDC)">
        <p>
          Por ser uma contratação feita pela internet, você tem o direito de desistir do pagamento em até{" "}
          <strong>7 dias corridos</strong> a contar da data do pagamento, sem precisar justificar (artigo 49 do Código de Defesa do Consumidor).
        </p>
        <Lista
          itens={[
            "O reembolso é integral, sem descontos ou taxas.",
            "Pix: o valor é devolvido ao número ou chave que efetuou o pagamento. Cartão de crédito: o estorno é lançado na fatura conforme o prazo da operadora.",
            "Ao confirmar o reembolso, o período liberado é removido e a conta volta ao Plano Gratuito (limite de 15 clientes). Os dados da barbearia não são apagados.",
          ]}
        />
      </Secao>

      <Secao n={3} titulo="Após os 7 dias">
        <Lista
          itens={[
            "Não há reembolso proporcional ao tempo não utilizado do período já liberado.",
            "Como não existe renovação automática, não há cobrança futura a cancelar. O plano simplesmente não é renovado ao vencer.",
          ]}
        />
      </Secao>

      <Secao n={4} titulo="Como pedir o reembolso">
        <p>
          Envie um e-mail para{" "}
          <a href={`mailto:${CONTATO}`} className="text-white underline underline-offset-4">
            {CONTATO}
          </a>{" "}
          com o assunto <strong>&ldquo;Reembolso&rdquo;</strong> informando o celular ou e-mail cadastrado na conta. Respondemos e concluímos
          a devolução em até <strong>7 dias úteis</strong>.
        </p>
      </Secao>

      <Secao n={5} titulo="Exclusão da conta e dos dados">
        <p>
          Independentemente de reembolso, você pode pedir o encerramento da conta e a exclusão dos seus dados a qualquer momento. Envie um
          e-mail para{" "}
          <a href={`mailto:${CONTATO}`} className="text-white underline underline-offset-4">
            {CONTATO}
          </a>{" "}
          a partir do celular ou e-mail cadastrado. Detalhes sobre seus direitos na{" "}
          <Link href="/privacidade" className="text-white underline underline-offset-4">
            Política de privacidade
          </Link>
          .
        </p>
      </Secao>
    </Documento>
  );
}
