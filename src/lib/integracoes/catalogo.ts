/**
 * Catálogo das integrações por chave (client-safe).
 * Cada serviço descreve os campos que o cliente precisa colar e as ações liberadas.
 */

export type CampoIntegracao = {
  id: string;
  label: string;
  placeholder?: string;
  tipo?: "texto" | "senha";
};

export type AcaoIntegracao =
  | "importar-clientes"
  | "importar-pedidos"
  | "enviar-contatos"
  | "testar-aviso";

export type MetaIntegracao = {
  slug: string;
  nome: string;
  ajuda: string;
  campos: CampoIntegracao[];
  acoes: AcaoIntegracao[];
  /** Mostra a chave "enviar venda automaticamente para o serviço". */
  autoVenda?: boolean;
  /** Texto do rodapé do painel. */
  rodape?: string;
};

const token = (label = "Token de acesso", placeholder = "Cole o token aqui"): CampoIntegracao => ({
  id: "token",
  label,
  placeholder,
  tipo: "senha",
});

export const INTEGRACOES: Record<string, MetaIntegracao> = {
  // ---------- avisos para a equipe ----------
  slack: {
    slug: "slack",
    nome: "Slack",
    ajuda:
      "No Slack, abra api.slack.com/apps → Incoming Webhooks → Add New Webhook to Workspace, escolha o canal e copie a URL gerada.",
    campos: [{ id: "url", label: "URL do webhook do canal", placeholder: "https://hooks.slack.com/services/..." }],
    acoes: ["testar-aviso"],
    rodape: "Avisamos o canal em: lead novo, venda ganha, lead perdido e pesquisa respondida.",
  },
  "microsoft-teams": {
    slug: "microsoft-teams",
    nome: "Microsoft Teams",
    ajuda:
      "No Teams, clique nos três pontos do canal → Conectores (ou Workflows) → Webhook de entrada, dê um nome e copie a URL.",
    campos: [{ id: "url", label: "URL do webhook do canal", placeholder: "https://...webhook.office.com/..." }],
    acoes: ["testar-aviso"],
    rodape: "Avisamos o canal em: lead novo, venda ganha, lead perdido e pesquisa respondida.",
  },
  zapier: {
    slug: "zapier",
    nome: "Zapier",
    ajuda:
      'No Zapier, crie um Zap com o gatilho "Webhooks by Zapier → Catch Hook" e copie a URL que ele mostra.',
    campos: [{ id: "url", label: "URL do Catch Hook", placeholder: "https://hooks.zapier.com/hooks/catch/..." }],
    acoes: ["testar-aviso"],
    rodape: "Cada evento do atendimento vira um disparo do seu Zap.",
  },
  make: {
    slug: "make",
    nome: "Make (Integromat)",
    ajuda:
      'No Make, crie um cenário começando pelo módulo "Webhooks → Custom webhook" e copie o endereço gerado.',
    campos: [{ id: "url", label: "URL do webhook", placeholder: "https://hook.make.com/..." }],
    acoes: ["testar-aviso"],
    rodape: "Cada evento do atendimento inicia o seu cenário no Make.",
  },
  n8n: {
    slug: "n8n",
    nome: "n8n",
    ajuda: 'No n8n, adicione o nó "Webhook" ao fluxo, salve e copie a Production URL.',
    campos: [{ id: "url", label: "URL do webhook", placeholder: "https://seu-n8n.com/webhook/..." }],
    acoes: ["testar-aviso"],
    rodape: "Cada evento do atendimento inicia o seu fluxo no n8n.",
  },

  // ---------- ERPs e financeiro ----------
  bling: {
    slug: "bling",
    nome: "Bling ERP",
    ajuda:
      "No Bling, vá em Preferências → Integrações → API para Desenvolvedores e gere um Access Token (API v3).",
    campos: [token("Access Token (API v3)")],
    acoes: ["importar-clientes"],
    autoVenda: true,
    rodape: "Com a chave ligada, cada venda registrada vira um pedido no Bling.",
  },
  omie: {
    slug: "omie",
    nome: "Omie",
    ajuda: "No Omie, acesse Configurações → Chaves de Integração e copie o App Key e o App Secret.",
    campos: [
      { id: "app_key", label: "App Key", placeholder: "0000000000" },
      { id: "app_secret", label: "App Secret", tipo: "senha" },
    ],
    acoes: ["importar-clientes"],
    rodape: "Importa os clientes do Omie para o seu funil.",
  },
  "conta-azul": {
    slug: "conta-azul",
    nome: "Conta Azul",
    ajuda:
      "No Conta Azul, acesse Configurações → Integrações → API e gere um token de acesso para aplicativos.",
    campos: [token()],
    acoes: ["importar-clientes"],
    rodape: "Importa os clientes do Conta Azul para o seu funil.",
  },
  asaas: {
    slug: "asaas",
    nome: "Asaas",
    ajuda: "No Asaas, acesse Minha Conta → Integrações → Chave de API e copie a chave.",
    campos: [{ id: "api_key", label: "Chave de API", tipo: "senha", placeholder: "$aact_..." }],
    acoes: ["importar-clientes"],
    autoVenda: true,
    rodape: "Com a chave ligada, cada venda registrada gera uma cobrança no Asaas (boleto/Pix).",
  },
  "mercado-pago": {
    slug: "mercado-pago",
    nome: "Mercado Pago",
    ajuda:
      "No Mercado Pago, acesse Suas integrações → sua aplicação → Credenciais de produção e copie o Access Token.",
    campos: [token("Access Token", "APP_USR-...")],
    acoes: [],
    autoVenda: true,
    rodape: "Com a chave ligada, cada venda registrada gera um link de pagamento do Mercado Pago.",
  },
  stripe: {
    slug: "stripe",
    nome: "Stripe",
    ajuda: "No Stripe, acesse Desenvolvedores → Chaves de API e copie a chave secreta (sk_live_...).",
    campos: [{ id: "api_key", label: "Chave secreta", tipo: "senha", placeholder: "sk_live_..." }],
    acoes: ["importar-clientes"],
    autoVenda: true,
    rodape: "Com a chave ligada, cada venda registrada gera um link de pagamento da Stripe.",
  },
  "pix-efi": {
    slug: "pix-efi",
    nome: "Pix",
    ajuda:
      "O Pix é emitido pela sua conta Asaas. No Asaas, acesse Minha Conta → Integrações → Chave de API e copie a chave.",
    campos: [{ id: "api_key", label: "Chave de API do Asaas", tipo: "senha", placeholder: "$aact_..." }],
    acoes: [],
    autoVenda: true,
    rodape: "Com a chave ligada, cada venda registrada gera uma cobrança Pix com QR Code.",
  },

  // ---------- e-commerce ----------
  nuvemshop: {
    slug: "nuvemshop",
    nome: "Nuvemshop",
    ajuda:
      "Na Nuvemshop, crie um app em Parceiros → Aplicativos (ou use o app de integração) para obter o ID da loja e o Access Token.",
    campos: [
      { id: "store_id", label: "ID da loja", placeholder: "1234567" },
      token("Access Token"),
    ],
    acoes: ["importar-clientes", "importar-pedidos"],
  },
  yampi: {
    slug: "yampi",
    nome: "Yampi",
    ajuda:
      "Na Yampi, acesse Configurações → Credenciais de API e copie o Alias da loja, o User Token e a Secret Key.",
    campos: [
      { id: "alias", label: "Alias da loja", placeholder: "minha-loja" },
      { id: "user_token", label: "User Token", tipo: "senha" },
      { id: "secret_key", label: "Secret Key", tipo: "senha" },
    ],
    acoes: ["importar-clientes", "importar-pedidos"],
  },
  woocommerce: {
    slug: "woocommerce",
    nome: "WooCommerce",
    ajuda:
      "No WordPress, acesse WooCommerce → Configurações → Avançado → REST API e crie uma chave com permissão de leitura.",
    campos: [
      { id: "url", label: "Endereço da loja", placeholder: "https://minhaloja.com.br" },
      { id: "ck", label: "Consumer Key", placeholder: "ck_..." },
      { id: "cs", label: "Consumer Secret", tipo: "senha", placeholder: "cs_..." },
    ],
    acoes: ["importar-clientes", "importar-pedidos"],
  },

  // ---------- marketing ----------
  "rd-station": {
    slug: "rd-station",
    nome: "RD Station",
    ajuda:
      "No RD Station Marketing, acesse Integrações → Token de API (ou gere um token pessoal em app.rdstation.com.br) e cole abaixo.",
    campos: [token("Token de acesso")],
    acoes: ["enviar-contatos"],
    rodape: "Envia os contatos do funil como leads no RD Station.",
  },
  mailchimp: {
    slug: "mailchimp",
    nome: "Mailchimp",
    ajuda:
      "No Mailchimp, acesse Account → Extras → API keys para gerar a chave e copie o ID da audiência em Audience → Settings.",
    campos: [
      { id: "api_key", label: "API Key", tipo: "senha", placeholder: "xxxxxxxx-us21" },
      { id: "list_id", label: "ID da audiência", placeholder: "a1b2c3d4e5" },
    ],
    acoes: ["enviar-contatos"],
    rodape: "Envia os contatos do funil para a sua audiência do Mailchimp.",
  },

  // ---------- produtividade ----------
  notion: {
    slug: "notion",
    nome: "Notion",
    ajuda:
      "No Notion, crie uma integração em notion.so/my-integrations, copie o Internal Token, compartilhe a base com a integração e copie o ID da base (parte final do link).",
    campos: [
      token("Internal Integration Token", "secret_..."),
      { id: "database_id", label: "ID da base de dados" },
    ],
    acoes: ["enviar-contatos"],
    rodape: "Cada lead vira um item na sua base do Notion, com nome, telefone e etapa.",
  },
  trello: {
    slug: "trello",
    nome: "Trello",
    ajuda:
      "No Trello, gere a Key e o Token em trello.com/app-key e copie o ID da lista onde os cartões devem entrar.",
    campos: [
      { id: "key", label: "API Key" },
      { id: "token", label: "Token", tipo: "senha" },
      { id: "list_id", label: "ID da lista" },
    ],
    acoes: ["enviar-contatos"],
    rodape: "Cada lead vira um cartão na sua lista do Trello.",
  },
};

export const SLUGS_INTEGRACAO = Object.keys(INTEGRACOES);
