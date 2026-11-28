import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

const REEMB_URL = "https://capiconversa.com/reembolso";
const REEMB_TITLE = "Política de Reembolso — Capiconversa";
const REEMB_DESC = "Garantía de 30 días en Capiconversa. Conozca cómo solicitar un reembolso.";

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
    <LegalShell title="Política de Reembolso" updatedAt="17 de junio de 2026">
      <section>
        <h2>Garantía de 30 días</h2>
        <p>
          <strong>Capiconversa</strong> ofrece una garantía de satisfacción de
          <strong> 30 días</strong>. Si no está satisfecho con su compra, puede
          solicitar un reembolso íntegro dentro de los 30 días posteriores a la fecha del pedido.
        </p>
      </section>

      <section>
        <h2>Cómo solicitarlo</h2>
        <p>
          Los reembolsos son procesados por nuestro proveedor de pagos,
          <strong> Paddle</strong> (Merchant of Record). Para solicitarlo:
        </p>
        <ol>
          <li>
            Acceda a{" "}
            <a href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a>{" "}
            y localice su pedido con el correo electrónico de compra.
          </li>
          <li>Solicite el reembolso directamente desde el portal de Paddle.</li>
          <li>O póngase en contacto con nuestro soporte y gestionaremos su solicitud.</li>
        </ol>
      </section>

      <section>
        <h2>Plazo de procesamiento</h2>
        <p>
          Tras la aprobación, el abono suele reflejarse en el método de pago original en un
          plazo de 5 a 10 días hábiles, según las reglas del emisor de la tarjeta o medio de pago.
        </p>
      </section>

      <section>
        <h2>Suscripciones y renovaciones</h2>
        <p>
          Puede cancelar su suscripción en cualquier momento para evitar renovaciones
          futuras. Los cobros realizados dentro del período de 30 días de la última factura
          pueden reembolsarse conforme a esta política.
        </p>
      </section>

      <section>
        <h2>Contacto</h2>
        <p>
          Si tiene dudas, comuníquese con nuestro soporte o directamente en paddle.net.
        </p>
      </section>
    </LegalShell>
  );
}
