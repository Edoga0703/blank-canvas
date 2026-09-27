import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

const TERMOS_URL = "https://metrixcrm.com.br/termos";
const TERMOS_TITLE = "Termos e Condições — Capi Conversa";
const TERMOS_DESC = "Termos e Condições de uso do Capi Conversa.";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: TERMOS_TITLE },
      { name: "description", content: TERMOS_DESC },
      { property: "og:title", content: TERMOS_TITLE },
      { property: "og:description", content: TERMOS_DESC },
      { property: "og:url", content: TERMOS_URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: TERMOS_URL }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <LegalShell title="Termos e Condições" updatedAt="17 de junho de 2026">
      <section>
        <h2>1. Quem somos</h2>
        <p>
          Estes Termos regulam o uso do serviço Capi Conversa ("Serviço"), fornecido por
          <strong> Capi Conversa</strong> ("nós", "nosso"). Ao usar o Serviço, você concorda com
          estes Termos. Se não concordar, não utilize o Serviço.
        </p>
      </section>

      <section>
        <h2>2. Aceitação</h2>
        <p>
          Ao criar uma conta, contratar um plano ou continuar usando o Serviço, você
          declara ter capacidade legal para celebrar este contrato e concorda integralmente
          com estes Termos.
        </p>
      </section>

      <section>
        <h2>3. Descrição do Serviço</h2>
        <p>
          O Capi Conversa oferece automação e gestão de atendimento via WhatsApp, incluindo
          recursos de mensageria, fluxos automatizados e integrações.
        </p>
      </section>

      <section>
        <h2>4. Uso aceitável</h2>
        <p>Você concorda em não:</p>
        <ul>
          <li>usar o Serviço para fins ilegais, fraudulentos ou abusivos;</li>
          <li>enviar spam ou mensagens não solicitadas em violação às leis aplicáveis;</li>
          <li>violar direitos de propriedade intelectual de terceiros;</li>
          <li>interferir na segurança do Serviço (malware, scraping, engenharia reversa);</li>
          <li>revender ou redistribuir o Serviço sem autorização.</li>
        </ul>
      </section>

      <section>
        <h2>5. Propriedade intelectual</h2>
        <p>
          Todo o software, marca, documentação e materiais do Serviço são de propriedade
          do Capi Conversa. Concedemos a você uma licença limitada, não exclusiva e
          intransferível para usar o Serviço conforme o plano contratado.
        </p>
      </section>

      <section>
        <h2>6. Pagamentos e assinaturas</h2>
        <p>
          Nosso processo de pedidos é conduzido por nosso revendedor online Paddle.com.
          <strong> Paddle.com é o Merchant of Record (MoR) de todos os nossos pedidos.</strong>
          A Paddle realiza o atendimento ao cliente em questões de cobrança e processa
          devoluções. Os termos completos de compra estão disponíveis em{" "}
          <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer">Paddle Buyer Terms</a>.
        </p>
        <p>
          Assinaturas são renovadas automaticamente conforme a periodicidade contratada,
          até que sejam canceladas. Você pode gerenciar sua assinatura a qualquer momento
          em paddle.net ou em sua conta.
        </p>
      </section>

      <section>
        <h2>7. Reembolsos</h2>
        <p>
          Reembolsos seguem nossa <Link to="/reembolso">Política de Reembolso</Link>.
        </p>
      </section>

      <section>
        <h2>8. Nível de serviço</h2>
        <p>
          Empenhamo-nos em manter o Serviço disponível, porém não garantimos operação
          ininterrupta ou livre de erros. Garantias implícitas são excluídas na máxima
          extensão permitida pela legislação aplicável.
        </p>
      </section>

      <section>
        <h2>9. Suspensão e encerramento</h2>
        <p>
          Podemos suspender ou encerrar o acesso em caso de: violação material destes
          Termos, inadimplência, risco de fraude ou segurança, ou violações repetidas das
          nossas políticas.
        </p>
      </section>

      <section>
        <h2>10. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida em lei, nossa responsabilidade total será limitada
          aos valores efetivamente pagos por você nos 12 meses anteriores ao evento.
          Não respondemos por danos indiretos, lucros cessantes ou perda de dados.
        </p>
      </section>

      <section>
        <h2>11. Lei aplicável</h2>
        <p>
          Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio
          do Capi Conversa para dirimir controvérsias, salvo disposição legal em contrário.
        </p>
      </section>

      <section>
        <h2>12. Contato</h2>
        <p>
          Dúvidas sobre estes Termos: entre em contato pelos canais do Serviço ou via
          paddle.net para questões de cobrança.
        </p>
      </section>
    </LegalShell>
  );
}
