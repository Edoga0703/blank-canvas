# Kiwify como padrão + gestão de pagamento + carência pós-trial

## 1. Voltar a Kiwify como pagamento principal

- Uma chave de configuração no Master define o gateway padrão (`kiwify` agora,
  `abacatepay` quando você quiser voltar). Padrão: **Kiwify**.
- Com Kiwify ativa, a tela "Meu plano" e a tela de checkout mostram o botão que
  leva ao checkout da Kiwify (link do plano, já cadastrado), com e-mail e
  identificação da empresa preenchidos.
- O checkout interno (PIX/cartão do Abacate Pay) fica oculto enquanto o padrão
  for Kiwify, mas continua no código — é só trocar a chave para reativar.
- Webhooks da Kiwify, Cakto e PerfectPay continuam funcionando como hoje.

## 2. Alterar forma de pagamento (em Configurações → Plano)

Novo bloco "Forma de pagamento" mostrando o método atual (cartão, PIX, etc.) e
a data da próxima cobrança, com dois botões:

- **Alterar forma de pagamento** — abre a página de assinatura da Kiwify já
  identificada pela empresa, onde o cliente troca o cartão sem cancelar nada.
- **Solicitar pagamento novamente** — gera um novo link de cobrança do ciclo
  atual (útil quando o cartão foi recusado por limite) e registra a tentativa.

Assim o cliente resolve cartão sem limite / cartão trocado sem precisar
cancelar e reassinar.

## 3. Mensagem correta do trial vencido

Hoje aparece "seu teste termina hoje" mesmo semanas depois. Passa a mostrar o
tempo real decorrido:

- Trial em andamento: "Faltam X dias do seu teste grátis".
- Trial vencido: "Seu período de teste terminou há X dias — sua conta está com
  restrições" (bloqueio total mostra "acesso bloqueado desde DD/MM").

## 4. Carência de 1 dia após o trial (modo somente leitura)

Linha do tempo:

```text
trial ativo  →  D0..D+1 (carência: navega, não age)  →  após D+1: bloqueado
```

- **Durante a carência (24h após o fim do trial):** o cliente entra e navega em
  todos os módulos, mas nenhuma ação é permitida — não move card, não envia
  mensagem, não cria/edita/exclui. Só Configurações (incluindo Plano) e o
  checkout permanecem liberados.
- **Pop-up ao entrar:** aviso de que o teste terminou, que a conta está em modo
  somente leitura por 24h e botão "Ativar meu plano". Aparece uma vez por
  sessão.
- **Faixa fixa no topo** enquanto durar a carência, com contagem restante.
- **Depois das 24h:** comportamento atual — o cliente cai direto na tela de
  plano/checkout, sem acesso aos módulos.

## Detalhes técnicos

- Gateway padrão em `app_config` (chave `gateway_padrao`), lido por
  `getMyBillingSummary` e exposto ao painel; ajuste no Master → Configurações.
- Estado de acesso calculado num único ponto (`src/lib/tenant.ts`):
  `ativo | trial | carencia | bloqueado`, derivado de `status_cobranca` e
  `trial_ate + 24h`. `src/routes/app.tsx` usa esse estado: `carencia` passa a
  liberar as rotas (hoje redireciona), `bloqueado` mantém o redirect para
  `/app/checkout`.
- Modo somente leitura no cliente via contexto do `app.tsx` + componente de
  bloqueio que intercepta botões de ação; no servidor, guarda
  `assertCanWrite(companyId)` aplicada nas funções de escrita dos módulos
  (CRM, conversas/envio, contatos, campanhas, agente) — o bloqueio não é só
  visual.
- Pop-up com `sessionStorage` por empresa/dia, reaproveitando o padrão do
  `trial-banner.tsx`.
- "Solicitar pagamento novamente" usa o link de checkout do plano com
  `ref=company_id`; quando o gateway padrão voltar a ser Abacate Pay, o mesmo
  botão gera a cobrança interna.
