# Limpar a tela do Plano e mostrar créditos de IA

## O que está acontecendo hoje

A aba **Configurações → Plano** mostra dois blocos que vieram de lugares diferentes:

1. O painel novo (checkout Abacate Pay): cartão azul do plano ativo, adicionais, montar pagamento e **Histórico de cobranças**.
2. O bloco antigo: avisos de teste/créditos, **Uso do ciclo atual**, cartão **Pagamento** (cartão salvo + cancelar assinatura), **Incluído** e **Histórico de faturas**.

Por isso aparecem dois históricos e informações repetidas de pagamento e renovação. Não é por causa dos dois gateways — é sobreposição das duas telas.

## Sobre os dois meios de pagamento

Só existe um fluxo de compra dentro do sistema: Abacate Pay (PIX/cartão). Kiwify/Cakto/PerfectPay continuam funcionando apenas como origem da assinatura de quem já comprou por lá (hoje 3 contas em Kiwify).

Regra que vou aplicar:
- Cliente com assinatura de origem externa (Kiwify e afins): vê o plano, o uso e o histórico de faturas dele; **não** vê o bloco "Montar pagamento" nem cobranças do Abacate Pay. No lugar, uma linha discreta: "Sua assinatura é gerenciada pela Kiwify".
- Cliente novo / assinatura interna: vê plano, uso, adicionais e o checkout Abacate Pay normalmente.

## Créditos de IA no cartão do plano

No cartão azul ("Plano ativo"), junto de status, renovação, usuários e conexões, entra:

- **Créditos de IA: usados / total** (ex.: 420/3.000)

Valores reais confirmados no sistema: plano Metrix PRO = 3.000 créditos por mês; período de teste = 500 créditos (plano Cortesia = ilimitado). O total continua respeitando créditos extras concedidos no Master.

## Como fica a tela, sem repetição

Ordem final da aba Plano:

1. **Cartão do plano ativo** — nome, valor, status, renovação, usuários, conexões, créditos de IA.
2. **Adicionais ativos** (como já é).
3. **Avisos** — fim de teste ou créditos de IA acima de 80%.
4. **Uso do ciclo atual** — barras de créditos de IA, usuários e conexões (mantido só aqui, com o detalhe visual que o cartão resume).
5. **Montar pagamento / cobrança pendente** — apenas para assinatura interna.
6. **Incluído no plano** — lista de recursos.
7. **Histórico de faturas** — um único bloco, unindo cobranças internas e faturas legadas, com recibo em PDF.
8. **Cancelar assinatura** — botão discreto ao final, sem o cartão "Pagamento" duplicado.

Removidos: o cartão "Pagamento" separado (dado de cartão e próxima cobrança já aparecem acima) e o segundo histórico.

## Detalhes técnicos

- `src/components/billing/meu-plano-panel.tsx`: adicionar badge de créditos de IA no hero (saldo/consumo já disponíveis via `company.creditos_saldo` + `credit_ledger`, hoje calculados em `PlanoCard`); esconder o bloco de checkout quando `subscription.provider` não for interno; remover o histórico próprio.
- `src/routes/app/configuracoes.tsx` (`PlanoCard`): mover o cálculo de créditos/uso para um hook compartilhado, remover o card "Pagamento", manter avisos + "Uso do ciclo atual", manter `InvoicesCard` como histórico único (incorporando as cobranças Abacate Pay), e reposicionar `CancelSubscriptionButton`.
- Histórico unificado: estender a fonte do `InvoicesCard` para incluir `billing_charge` além das faturas legadas, ordenado por data, com botão de recibo para itens pagos.
- Sem alterações de cobrança, webhooks ou dados dos clientes Kiwify.
