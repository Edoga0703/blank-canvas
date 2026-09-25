# Checkout próprio com Abacate Pay (plano + adicionais em uma cobrança)

## Recomendação

Parar de criar links manuais. Em vez disso, o sistema monta a cobrança sozinho:
o cliente escolhe os adicionais dentro do Metrix, o sistema soma tudo e gera
**uma única cobrança** no Abacate Pay via API (PIX ou cartão). Nada de link por
combinação — o carrinho vira a cobrança.

Por que Abacate Pay: PIX com taxa fixa baixa (centavos por transação) em vez de
~R$10 por venda na Kiwify. Kiwify/Cakto/Perfect continuam funcionando como estão
(webhook já existe), então nada quebra durante a transição.

## O que o cliente vai ver

**Tela "Meu plano" (dentro do sistema)**
- Plano atual, valor, data da próxima cobrança, status.
- Lista de adicionais com quantidade: usuários extras, conexões de WhatsApp,
  plugins pagos.
- Resumo somando plano + adicionais = total mensal.
- Botão "Confirmar" → escolhe PIX (QR Code + copia e cola na própria tela) ou
  cartão.
- Assim que o pagamento é confirmado, os adicionais são liberados na hora.

**Renovação automática todo mês**
- Cartão: cobrança recorrente automática, sem ação do cliente.
- PIX: o sistema gera a cobrança do mês alguns dias antes do vencimento e avisa
  o cliente por WhatsApp/e-mail com o QR Code; lembrete em D-3, D-0 e D+2, e
  suspensão só depois da tolerância configurada.

**Painel Master (você)**
- Cadastro dos adicionais com preço (já existe em Upgrades) — passa a não exigir
  link de checkout quando o provedor for Abacate Pay.
- Visão de cobranças geradas, pagas, vencidas e falhas, com opção de reenviar
  cobrança ou marcar como paga manualmente.
- Chave para ligar/desligar o Abacate Pay como gateway padrão.

## Etapas de execução

1. **Base de dados**: tabelas de cobrança (`billing_charge`) e itens da cobrança
   (`billing_charge_item`), com RLS por empresa + GRANTs; campos de assinatura
   recorrente (id externo, método, próximo vencimento) em `company_billing`.
2. **Cliente Abacate Pay no servidor**: criar cobrança PIX, criar cobrança com
   cartão, consultar status, cancelar. Chave de API guardada como segredo.
3. **Carrinho e checkout**: tela "Meu plano" com seleção de adicionais, cálculo
   do total e geração da cobrança única (QR Code PIX exibido no próprio sistema).
4. **Webhook**: estender o endpoint existente do Abacate Pay para casar a
   cobrança pelo id interno, liberar plano/adicionais e registrar o pagamento.
5. **Renovação automática**: rotina diária que gera a cobrança do próximo ciclo,
   dispara avisos e aplica suspensão após tolerância.
6. **Painel Master**: lista de cobranças, reenvio, baixa manual e chave de
   gateway padrão.

## Detalhes técnicos

- Cobranças criadas em `src/lib/billing/abacatepay.server.ts` (fetch puro, sem
  SDK Node), chamado por `createServerFn` autenticado em
  `src/lib/billing-checkout.functions.ts`.
- `metadata.externalId` da cobrança leva o `billing_charge.id`, garantindo
  conciliação exata no webhook (`src/routes/api/public/billing/webhook.ts` +
  `normalize.ts`, que já tratam `abacatepay`).
- Valores sempre em centavos; `billing_charge_item` guarda snapshot de
  nome/preço/quantidade para o histórico não mudar quando o preço mudar.
- Idempotência: webhook ignora evento repetido pelo par (charge_id, status) e a
  rotina mensal usa chave única (company_id, ciclo).
- Recorrência de cartão usa o recurso de assinatura do Abacate Pay; se a conta
  não tiver esse recurso liberado, o fallback é a mesma rotina mensal com
  cobrança gerada por API. Confirmo na implementação.
- Kiwify/Cakto/Perfect permanecem intactos; o gateway ativo é decidido por
  configuração, com Abacate Pay como padrão quando você ligar.

## Necessário de você

- Chave de API do Abacate Pay (produção e/ou dev) para eu salvar como segredo.
- Confirmação de que a conta Abacate Pay tem cartão habilitado.
