import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

const PRIV_URL = "https://metrixcrm.com.br/privacidade";
const PRIV_TITLE = "Política de Privacidade — Metrix CRM";
const PRIV_DESC = "Como o Metrix CRM coleta, usa e protege seus dados (LGPD).";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: PRIV_TITLE },
      { name: "description", content: PRIV_DESC },
      { property: "og:title", content: PRIV_TITLE },
      { property: "og:description", content: PRIV_DESC },
      { property: "og:url", content: PRIV_URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: PRIV_URL }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="17 de junho de 2026">
      <section>
        <h2>1. Controlador dos dados</h2>
        <p>
          <strong>Metrix CRM</strong> atua como controlador dos dados pessoais tratados
          no âmbito do Serviço, conforme a LGPD (Lei nº 13.709/2018) e demais leis aplicáveis.
        </p>
      </section>

      <section>
        <h2>2. Dados que coletamos</h2>
        <ul>
          <li><strong>Cadastro:</strong> nome, e-mail, senha (hash), telefone.</li>
          <li><strong>Conteúdo:</strong> mensagens, contatos e mídias que você processa no Serviço.</li>
          <li><strong>Uso e telemetria:</strong> logs, IP, dispositivo, navegador.</li>
          <li><strong>Suporte:</strong> conteúdo de tickets e comunicações.</li>
          <li><strong>Cobrança:</strong> tratada pela Paddle (MoR) — não armazenamos dados de cartão.</li>
        </ul>
      </section>

      <section>
        <h2>3. Finalidades e bases legais</h2>
        <ul>
          <li>Prestar o Serviço e cumprir o contrato (execução de contrato).</li>
          <li>Segurança, prevenção a fraudes e cumprimento de obrigações legais.</li>
          <li>Suporte ao cliente (execução de contrato).</li>
          <li>Melhorias do produto e analytics (legítimo interesse).</li>
          <li>Comunicações de marketing (consentimento, quando aplicável).</li>
        </ul>
      </section>

      <section>
        <h2>4. Compartilhamento</h2>
        <p>Compartilhamos dados apenas com:</p>
        <ul>
          <li><strong>Paddle.com</strong> — atua como Merchant of Record para processar pagamentos, assinaturas, impostos e faturamento.</li>
          <li>Provedores de hospedagem, banco de dados e analytics (subprocessadores).</li>
          <li>Consultores profissionais (jurídico, contábil) quando necessário.</li>
          <li>Autoridades, quando exigido por lei.</li>
        </ul>
      </section>

      <section>
        <h2>5. Retenção</h2>
        <p>
          Mantemos os dados pelo tempo necessário às finalidades descritas, ou conforme
          exigido por lei. Após esse período, os dados são excluídos ou anonimizados.
        </p>
      </section>

      <section>
        <h2>6. Seus direitos</h2>
        <p>
          Você pode solicitar acesso, correção, anonimização, portabilidade, eliminação
          dos seus dados, revogação de consentimento e informações sobre compartilhamento,
          nos termos da LGPD. Para exercer seus direitos, entre em contato pelos canais
          do Serviço.
        </p>
      </section>

      <section>
        <h2>7. Segurança</h2>
        <p>
          Adotamos medidas técnicas e organizacionais adequadas (criptografia em trânsito,
          controles de acesso, monitoramento) para proteger seus dados contra acessos não
          autorizados, perdas ou alterações.
        </p>
      </section>

      <section>
        <h2>8. Cookies</h2>
        <p>
          Utilizamos cookies essenciais para autenticação e funcionamento do Serviço, e
          cookies de analytics para melhorar a experiência. Você pode gerenciar
          preferências no seu navegador.
        </p>
      </section>

      <section>
        <h2>9. Dados do Google (Google API Services)</h2>
        <p>
          Quando você conecta sua conta Google ao Metrix CRM (integração com o Google
          Agenda), solicitamos apenas os escopos necessários para criar, ler, atualizar e
          excluir eventos de agenda associados aos agendamentos criados no Serviço, além
          do seu e-mail para identificar a conta conectada.
        </p>
        <p>
          O uso e a transferência, pelo Metrix CRM, de informações recebidas das APIs do
          Google seguem a{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado (Limited Use).
        </p>
        <ul>
          <li>Não vendemos nem compartilhamos dados do Google com terceiros.</li>
          <li>Não usamos dados do Google para publicidade ou perfilamento.</li>
          <li>
            Humanos não leem esses dados, exceto com sua autorização expressa, para
            segurança, para suporte solicitado por você ou por exigência legal.
          </li>
          <li>
            Os tokens de acesso são armazenados de forma segura e podem ser revogados a
            qualquer momento em Plugins → Google Agenda → Desconectar, ou em{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            . Ao desconectar, os tokens são excluídos dos nossos servidores.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Alterações</h2>
        <p>
          Esta Política pode ser atualizada periodicamente. Mudanças relevantes serão
          comunicadas no Serviço.
        </p>
      </section>
    </LegalShell>
  );
}
