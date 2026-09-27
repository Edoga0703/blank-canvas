import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "@/components/legal-shell";

const URL_PAGE = "https://metrixcrm.com.br/exclusao-dados";
const TITLE = "Exclusão de Dados do Usuário — Capi Conversa";
const DESC =
  "Como solicitar a exclusão dos seus dados e desconectar o Facebook/Instagram do Capi Conversa.";

export const Route = createFileRoute("/exclusao-dados")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL_PAGE },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL_PAGE }],
  }),
  component: ExclusaoDadosPage,
});

function ExclusaoDadosPage() {
  return (
    <LegalShell title="Exclusão de Dados do Usuário" updatedAt="1 de agosto de 2026">
      <section>
        <h2>Resumo</h2>
        <p>
          O <strong>Capi Conversa</strong> permite que você exclua a qualquer momento os dados
          associados à sua conta, incluindo os dados recebidos da Meta (Facebook e Instagram)
          por meio das conexões de mensagens.
        </p>
      </section>

      <section>
        <h2>Opção 1 — Dentro do sistema (imediato)</h2>
        <ol>
          <li>Acesse sua conta em metrixcrm.com.br e entre em <strong>Conexões</strong>.</li>
          <li>
            Localize a conexão do <strong>Facebook Messenger</strong> ou{" "}
            <strong>Instagram Direct</strong> e clique em <strong>Desconectar</strong>.
          </li>
          <li>
            A desconexão remove imediatamente os tokens de acesso, o vínculo com a página e
            as assinaturas de webhook da Meta.
          </li>
          <li>
            Para apagar também as conversas e contatos, vá em{" "}
            <strong>Configurações → Conta → Excluir conta</strong>.
          </li>
        </ol>
      </section>

      <section>
        <h2>Opção 2 — Pelo Facebook</h2>
        <p>
          Você também pode revogar o acesso em{" "}
          <a
            href="https://www.facebook.com/settings?tab=applications"
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook → Configurações → Apps e sites
          </a>
          , removendo o app <strong>Capi Conversa</strong>. Ao receber a notificação de remoção,
          excluímos os dados vinculados a esse acesso.
        </p>
      </section>

      <section>
        <h2>Opção 3 — Solicitação por e-mail</h2>
        <p>
          Envie um e-mail para{" "}
          <a href="mailto:agenciavirtusmkt@gmail.com">agenciavirtusmkt@gmail.com</a> com o
          assunto <strong>"Exclusão de dados"</strong>, informando o e-mail da sua conta e,
          se aplicável, o nome da página do Facebook ou do perfil do Instagram conectado.
        </p>
      </section>

      <section>
        <h2>Prazos</h2>
        <ul>
          <li>Confirmação da solicitação: até 5 dias úteis.</li>
          <li>Exclusão definitiva dos dados: até 30 dias corridos.</li>
          <li>
            Backups criptografados são sobrescritos no ciclo normal de retenção, em até 90 dias.
          </li>
        </ul>
      </section>

      <section>
        <h2>O que é excluído</h2>
        <ul>
          <li>Tokens de acesso e identificadores de página/conta da Meta.</li>
          <li>Mensagens, conversas e anexos recebidos por Messenger e Instagram Direct.</li>
          <li>Contatos, leads e histórico de atendimento associados.</li>
          <li>Dados de perfil (nome, foto e identificador do usuário da Meta).</li>
        </ul>
        <p>
          Podemos reter registros mínimos de faturamento e logs de segurança quando exigido
          por lei, sem conteúdo de mensagens.
        </p>
      </section>

      <section>
        <h2>Contato do controlador</h2>
        <p>
          Gabriel de Souza Gadelha — CNPJ 45.044.275/0001-65 ·{" "}
          <a href="mailto:agenciavirtusmkt@gmail.com">agenciavirtusmkt@gmail.com</a>
        </p>
      </section>
    </LegalShell>
  );
}
