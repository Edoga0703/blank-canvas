export type KbCategoria =
  | "Conexão"
  | "Agente IA"
  | "CRM"
  | "Campanhas"
  | "Agendamentos"
  | "Cobrança"
  | "Conta";

export type KbArtigo = {
  id: string;
  categoria: KbCategoria;
  titulo: string;
  palavrasChave: string[];
  /** Texto curto em markdown simples (parágrafos, listas com "- " e passos "1. ") */
  conteudo: string;
  rotaRelacionada?: string;
  rotaLabel?: string;
  /** rotas onde este artigo é sugerido primeiro */
  contexto?: string[];
};

export const KB_CATEGORIAS: KbCategoria[] = [
  "Conexão",
  "Agente IA",
  "CRM",
  "Campanhas",
  "Agendamentos",
  "Cobrança",
  "Conta",
];

export const SUPPORT_KB: KbArtigo[] = [
  // ───────── Conexão
  {
    id: "conectar-whatsapp",
    categoria: "Conexão",
    titulo: "Conectar meu WhatsApp",
    palavrasChave: ["whatsapp", "qr", "qrcode", "conectar", "numero", "número", "instancia", "instância"],
    rotaRelacionada: "/app/conexao",
    rotaLabel: "Ir para Conexões",
    contexto: ["/app/conexao"],
    conteudo: `Para conectar seu número:

1. Abra o módulo **Conexões**.
2. Clique em **Nova conexão** e escolha o tipo (D-API QR Code ou Meta Oficial).
3. Um **QR Code** aparece na tela.
4. No celular: WhatsApp → Configurações → **Aparelhos conectados** → Conectar aparelho.
5. Aponte a câmera para o QR Code.

Quando o status ficar **Conectado** (verde), já pode receber e enviar mensagens em Conversas.`,
  },
  {
    id: "whatsapp-caiu",
    categoria: "Conexão",
    titulo: "Meu WhatsApp desconectou / caiu",
    palavrasChave: ["desconectou", "caiu", "offline", "desconectado", "parou", "não envia", "nao envia"],
    rotaRelacionada: "/app/conexao",
    rotaLabel: "Ir para Conexões",
    contexto: ["/app/conexao", "/app/conversas"],
    conteudo: `Quedas quase sempre têm 3 causas:

- **Celular sem internet** ou desligado por muito tempo.
- O número foi **desconectado manualmente** em "Aparelhos conectados".
- WhatsApp aberto em outro serviço concorrente com o mesmo número.

Como resolver:

1. Vá em **Conexões** e clique em **Reconectar**.
2. Leia o novo QR Code com o celular.
3. Mantenha o celular com internet — mesmo que a tela esteja bloqueada.

Se o status voltar a cair em poucos minutos, abra um chamado que a gente investiga o número.`,
  },
  {
    id: "tipos-conexao",
    categoria: "Conexão",
    titulo: "Diferença entre WhatsApp QR Code e WhatsApp Oficial Meta",
    palavrasChave: ["dapi", "meta", "oficial", "api", "tipos", "diferença", "diferenca", "upgrade"],
    rotaRelacionada: "/app/conexao",
    rotaLabel: "Ver conexões",
    conteudo: `- **WhatsApp Não Oficial (D-API)** — Conexão via QR Code ou código de 8 dígitos, ideal para conectar seu aparelho físico sem burocracia ou aprovações.
- **WhatsApp API Oficial Meta (Cloud API)** — Conexão corporativa direta via D-API com a Meta, sem risco de bloqueio, com selo de verificação da empresa e suporte a templates HSM aprovados.

Você pode conectar ambas opções diretamente no módulo Conexões.`,
  },
  {
    id: "mais-de-um-numero",
    categoria: "Conexão",
    titulo: "Posso usar mais de um número?",
    palavrasChave: ["varios numeros", "vários números", "segundo numero", "multiplos", "múltiplos"],
    rotaRelacionada: "/app/conexao",
    rotaLabel: "Ir para Conexões",
    conteudo: `Sim. Cada número é uma conexão separada e todas as conversas caem na mesma caixa de entrada, identificadas pela conexão de origem.

A quantidade de números disponíveis depende do seu plano — confira em Configurações → Plano.`,
  },

  // ───────── Agente IA
  {
    id: "configurar-agente",
    categoria: "Agente IA",
    titulo: "Configurar o Agente de IA",
    palavrasChave: ["ia", "agente", "robo", "robô", "bot", "inteligencia", "inteligência", "configurar"],
    rotaRelacionada: "/app/agente",
    rotaLabel: "Ir para Agente IA",
    contexto: ["/app/agente"],
    conteudo: `1. Abra **Automação → Agente IA**.
2. Defina **nome, personalidade e objetivo** do agente (ex.: agendar consultas).
3. Preencha a **base de conhecimento** com informações do seu negócio: preços, horários, endereço, serviços.
4. Use o **Playground** para testar antes de ativar.
5. Ative o agente e escolha em quais conexões ele responde.

Dica: quanto mais específica a base de conhecimento, melhores as respostas.`,
  },
  {
    id: "ia-respondendo-errado",
    categoria: "Agente IA",
    titulo: "A IA está respondendo errado",
    palavrasChave: ["errado", "resposta ruim", "alucina", "inventa", "treinar", "ensinar"],
    rotaRelacionada: "/app/agente",
    rotaLabel: "Ir para Agente IA",
    contexto: ["/app/agente"],
    conteudo: `Use o botão **Ensinar aqui** direto na conversa: você corrige a resposta e ela vira conhecimento do agente.

Além disso:

- Revise a **base de conhecimento** — respostas genéricas indicam falta de informação.
- Seja explícito no que o agente **não deve** fazer (ex.: "nunca prometa desconto").
- Teste as mudanças no **Playground** antes de subir ao ar.`,
  },
  {
    id: "assumir-conversa",
    categoria: "Agente IA",
    titulo: "Assumir uma conversa da IA (handoff)",
    palavrasChave: ["handoff", "assumir", "humano", "desativar ia", "pausar ia"],
    rotaRelacionada: "/app/conversas",
    rotaLabel: "Ir para Conversas",
    contexto: ["/app/conversas"],
    conteudo: `Dentro da conversa há um botão **IA ativa / IA pausada** no topo.

- Com a IA **ativa**, ela responde automaticamente e o campo de digitação fica bloqueado.
- Clicando para **pausar**, você assume o atendimento manualmente.

O agente também pode passar sozinho para humano quando detecta pedido explícito do cliente.`,
  },
  {
    id: "varios-agentes",
    categoria: "Agente IA",
    titulo: "Criar mais de um agente",
    palavrasChave: ["multiplos agentes", "vários agentes", "segundo agente"],
    rotaRelacionada: "/app/agente",
    rotaLabel: "Ir para Agente IA",
    conteudo: `Sim, você pode ter vários agentes — um para vendas, outro para suporte, por exemplo.

Cada agente tem personalidade e base de conhecimento próprias, e você escolhe qual conexão cada um atende.`,
  },

  // ───────── CRM
  {
    id: "crm-etapas",
    categoria: "CRM",
    titulo: "Criar e organizar etapas do funil",
    palavrasChave: ["kanban", "funil", "etapas", "coluna", "pipeline", "crm"],
    rotaRelacionada: "/app/crm",
    rotaLabel: "Ir para o CRM",
    contexto: ["/app/crm"],
    conteudo: `No **CRM Kanban** cada coluna é uma etapa do seu funil.

1. Clique em **+ Etapa** para criar (ex.: Novo, Em contato, Proposta, Fechado).
2. Arraste os cards entre as etapas conforme o lead avança.
3. Clique num card para ver histórico, tags, responsável e abrir a conversa.

Dica: menos etapas = funil mais fácil de manter atualizado.`,
  },
  {
    id: "lead-vira-card",
    categoria: "CRM",
    titulo: "Novos contatos não viram card no CRM",
    palavrasChave: ["nao aparece", "não aparece", "lead", "card", "sumiu"],
    rotaRelacionada: "/app/crm",
    rotaLabel: "Ir para o CRM",
    conteudo: `Verifique:

- Se existe uma **etapa de entrada** definida no funil.
- Se a conexão de WhatsApp está ativa (mensagens sem conexão não geram card).
- Se algum **filtro** está aplicado no topo do quadro (responsável, tag ou período).

Você também pode criar o card manualmente pelo botão **+** dentro da etapa.`,
  },

  // ───────── Campanhas
  {
    id: "criar-campanha",
    categoria: "Campanhas",
    titulo: "Criar uma campanha de disparo",
    palavrasChave: ["campanha", "disparo", "massa", "envio", "lista", "xlsx", "planilha"],
    rotaRelacionada: "/app/campanhas",
    rotaLabel: "Ir para Campanhas",
    contexto: ["/app/campanhas"],
    conteudo: `1. Abra **Automação → Campanhas** e clique em **Nova campanha**.
2. Escolha o público: contatos filtrados por tag ou **importar planilha (.xlsx)**.
3. Escreva a mensagem — use variáveis como \`{{nome}}\` para personalizar.
4. Defina a conexão de envio e o intervalo entre mensagens.
5. Revise e dispare (ou agende).

Acompanhe entregas, leituras e respostas no painel da campanha.`,
  },
  {
    id: "evitar-bloqueio",
    categoria: "Campanhas",
    titulo: "Como evitar bloqueio do número em disparos",
    palavrasChave: ["bloqueio", "banido", "ban", "spam", "limite"],
    rotaRelacionada: "/app/campanhas",
    rotaLabel: "Ir para Campanhas",
    conteudo: `Boas práticas que reduzem muito o risco:

- Use **intervalo aleatório** entre mensagens (nunca disparo instantâneo).
- Comece com volumes baixos e aumente aos poucos ("aquecimento").
- Envie apenas para quem já teve contato com você.
- Sempre ofereça uma saída ("responda SAIR para não receber mais").
- Varie o texto — mensagens 100% idênticas em massa são o principal gatilho de denúncia.

Para volumes altos e recorrentes, o ideal é a conexão **Meta Oficial**.`,
  },

  // ───────── Agendamentos
  {
    id: "criar-agendamento",
    categoria: "Agendamentos",
    titulo: "Criar e gerenciar agendamentos",
    palavrasChave: ["agenda", "agendamento", "horario", "horário", "consulta", "calendario", "calendário"],
    rotaRelacionada: "/app/agendamentos",
    rotaLabel: "Ir para Agendamentos",
    contexto: ["/app/agendamentos"],
    conteudo: `Em **Agendamentos** você tem visão de dia, semana e mês.

1. Clique em um horário livre (ou no botão **Novo**).
2. Selecione o contato, o serviço e o responsável.
3. Salve — o cliente pode receber uma confirmação automática pelo WhatsApp.

Arraste o agendamento no calendário para remarcar.`,
  },

  // ───────── Cobrança
  {
    id: "mudar-plano",
    categoria: "Cobrança",
    titulo: "Alterar meu plano ou fazer upgrade",
    palavrasChave: ["plano", "upgrade", "assinatura", "trocar plano", "mudar plano", "preço", "preco"],
    rotaRelacionada: "/app/configuracoes",
    rotaLabel: "Ir para Configurações",
    conteudo: `Vá em **Configurações → Plano e cobrança**. Ali você vê o plano atual, o consumo e as opções de upgrade.

A troca vale imediatamente e o valor é ajustado de forma proporcional na próxima fatura.`,
  },
  {
    id: "periodo-teste",
    categoria: "Cobrança",
    titulo: "Como funciona o período de teste",
    palavrasChave: ["trial", "teste", "gratis", "grátis", "7 dias", "expira"],
    rotaRelacionada: "/app/configuracoes",
    rotaLabel: "Ver meu plano",
    conteudo: `Você tem **7 dias de teste** com acesso completo, sem precisar cadastrar cartão.

Um aviso no topo do sistema mostra quantos dias faltam. Ao escolher um plano antes do fim, nenhum dado é perdido e a operação continua exatamente como está.`,
  },
  {
    id: "nota-fiscal",
    categoria: "Cobrança",
    titulo: "Segunda via e nota fiscal",
    palavrasChave: ["boleto", "fatura", "nota fiscal", "nf", "recibo", "segunda via", "pagamento"],
    rotaRelacionada: "/app/configuracoes",
    rotaLabel: "Ir para Configurações",
    conteudo: `As faturas ficam em **Configurações → Plano e cobrança → Histórico**.

Se precisar de nota fiscal com dados específicos (CNPJ, razão social, endereço), atualize o cadastro fiscal na mesma tela ou abra um chamado com os dados corretos.`,
  },

  // ───────── Conta
  {
    id: "adicionar-usuario",
    categoria: "Conta",
    titulo: "Adicionar usuários e definir permissões",
    palavrasChave: ["usuario", "usuário", "equipe", "permissao", "permissão", "convidar", "atendente"],
    rotaRelacionada: "/app/configuracoes",
    rotaLabel: "Ir para Configurações",
    conteudo: `Em **Configurações → Equipe**:

1. Clique em **Convidar usuário** e informe o e-mail.
2. Escolha o papel (administrador ou atendente).
3. A pessoa recebe um e-mail para criar a senha.

Atendentes veem apenas as conversas e leads atribuídos a eles, conforme as permissões definidas.`,
  },
  {
    id: "esqueci-senha",
    categoria: "Conta",
    titulo: "Esqueci minha senha / não consigo entrar",
    palavrasChave: ["senha", "login", "entrar", "acesso", "recuperar", "esqueci"],
    conteudo: `Na tela de login clique em **Esqueci minha senha** e informe seu e-mail — você recebe um link para redefinir.

Se o e-mail não chegar em alguns minutos, confira a caixa de spam. Marcar **"Manter-me conectado"** no login evita ter que digitar a senha toda vez.`,
  },
  {
    id: "instalar-app",
    categoria: "Conta",
    titulo: "Instalar o Metrix no celular",
    palavrasChave: ["app", "aplicativo", "celular", "instalar", "android", "iphone", "pwa"],
    conteudo: `O Metrix funciona como aplicativo:

- **Android (Chrome):** menu ⋮ → **Instalar aplicativo**.
- **iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**.

Ele abre em tela cheia, com ícone próprio e sem a barra do navegador.`,
  },
];

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Busca simples por título + palavras-chave + conteúdo. */
export function buscarKb(termo: string): KbArtigo[] {
  const q = normalizar(termo.trim());
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);

  return SUPPORT_KB.map((a) => {
    const titulo = normalizar(a.titulo);
    const chaves = normalizar(a.palavrasChave.join(" "));
    const corpo = normalizar(a.conteudo);
    let score = 0;
    for (const t of tokens) {
      if (titulo.includes(t)) score += 5;
      if (chaves.includes(t)) score += 3;
      if (corpo.includes(t)) score += 1;
    }
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 6)
    .map((x) => x.a);
}

/** Sugestões iniciais, priorizando a rota em que o usuário está. */
export function sugestoesPorContexto(pathname: string, limite = 4): KbArtigo[] {
  const contextuais = SUPPORT_KB.filter((a) => a.contexto?.some((c) => pathname.startsWith(c)));
  const padrao = SUPPORT_KB.filter(
    (a) =>
      !contextuais.includes(a) &&
      ["conectar-whatsapp", "configurar-agente", "criar-campanha", "mudar-plano", "crm-etapas"].includes(a.id),
  );
  return [...contextuais, ...padrao].slice(0, limite);
}

export function artigosPorCategoria(cat: KbCategoria): KbArtigo[] {
  return SUPPORT_KB.filter((a) => a.categoria === cat);
}

const DEFLECT_KEY = "metrix_support_deflect";

export function registrarFeedback(artigoId: string, resolveu: boolean) {
  try {
    const raw = localStorage.getItem(DEFLECT_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[artigoId] = { resolveu, at: new Date().toISOString() };
    localStorage.setItem(DEFLECT_KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
}
