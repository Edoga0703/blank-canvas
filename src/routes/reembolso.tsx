import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

const REEMB_URL = "https://atendzap-board.lovable.app/reembolso";
const REEMB_TITLE = "Política de Reembolso — Capi Conversa";
const REEMB_DESC = "Garantia de 30 dias no Capi Conversa. Saiba como solicitar reembolso.";

export const Route = createFileRoute("/reembolso")({
  head: () => ({
    meta: [
      { title: REEMB_TITLE },
      { name: "description", content: REEMB_DESC },
      { property: "og:title", content: REEMB_TITLE },
      { property: "og:description", content: REEMB_DESC },
      { property: "og:url", content: REEMB_URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: REEMB_URL }],
  }),
  component: ReembolsoPage,
});

function ReembolsoPage() {
  return (
    <LegalShell title="Política de Reembolso" updatedAt="17 de junho de 2026">
      <section>
        <h2>Garantia de 30 dias</h2>
        <p>
          O <strong>Capi Conversa</strong> oferece uma garantia de satisfação de
          <strong> 30 dias</strong>. Se você não estiver satisfeito com sua compra, pode
          solicitar reembolso integral em até 30 dias a partir da data do pedido.
        </p>
      </section>

      <section>
        <h2>Como solicitar</h2>
        <p>
          Os reembolsos são processados pelo nosso provedor de pagamentos,
          <strong> Paddle</strong> (Merchant of Record). Para solicitar:
        </p>
        <ol>
          <li>
            Acesse{" "}
            <a href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a>{" "}
            e localize seu pedido pelo e-mail de compra.
          </li>
          <li>Solicite o reembolso diretamente pelo portal da Paddle.</li>
          <li>Ou entre em contato com nosso suporte e encaminharemos o pedido.</li>
        </ol>
      </section>

      <section>
        <h2>Prazo de processamento</h2>
        <p>
          Após a aprovação, o estorno costuma aparecer no método de pagamento original em
          até 5 a 10 dias úteis, conforme as regras do emissor do cartão ou meio de pagamento.
        </p>
      </section>

      <section>
        <h2>Assinaturas e renovações</h2>
        <p>
          Você pode cancelar sua assinatura a qualquer momento para evitar renovações
          futuras. Cobranças já realizadas dentro do período de 30 dias da última fatura
          podem ser reembolsadas conforme esta política.
        </p>
      </section>

      <section>
        <h2>Contato</h2>
        <p>
          Em caso de dúvidas, entre em contato com nosso suporte ou diretamente em paddle.net.
        </p>
      </section>
    </LegalShell>
  );
}
