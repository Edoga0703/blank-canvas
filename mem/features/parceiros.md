---
name: Programa de Parceiros
description: Sistema de afiliados/indicação para agências e parceiros comerciais com painel de monitoramento e comissões.
type: feature
---
# Programa de Parceiros (Afiliados)

Sistema onde parceiros (agências, consultores) podem indicar o Metrix CRM e receber comissões recorrentes.

## Estrutura de Dados
- **parceiro**: Tabela para armazenar os dados do parceiro, código de indicação e saldo.
- **parceiro_indicacao**: Vincula uma empresa indicada a um parceiro.
- **parceiro_saque**: Registro de solicitações de pagamento de comissão.

## Regras de Negócio
- Comissão recorrente (padrão 20%) sobre faturas pagas.
- Link de indicação único.
- Painel dedicado para monitoramento de leads e saldo.
- Não é White Label; mantém a marca Metrix CRM.
