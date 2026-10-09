# Limpeza de dados — BRILHANTAO MATERIAL DE CONSTRUCAO LTDA

## O que o botão "Zona de Perigo" faz hoje

O texto do botão promete apagar conversas, contatos, campanhas, cards e configurações de IA. Na prática ele tenta apagar uma lista de tabelas com nomes que em boa parte não existem mais no sistema (nomes antigos como "conversas", "contatos", "campanhas", "agent_ai_configs"). Essas tentativas falham em silêncio.

Do que ele realmente apaga hoje: mensagens, cards do CRM e o histórico de auditoria da conta. Funis, etapas, automações e a configuração do agente de IA **não** são tocados — mas isso é por acaso, não por desenho, e o aviso na tela diz o contrário. Por isso não recomendo usá-lo.

## O que farei

Limpeza manual e controlada nessa conta (id 45a25827-220b-4105-a1fc-b6c1ab5b6108), apagando só dados de operação:

- Conversas e mensagens: 10.576 registros
- Leads e cards do CRM: 535 registros, junto com o que depende deles (notas, eventos do lead e histórico de etapas)

## O que fica intacto

- Funis, etapas e toda a régua/automação configurada
- Configuração do agente de IA, respostas rápidas, menus de setor
- Usuários, equipe, conexões de WhatsApp, plano, créditos e financeiro
- Produtos, serviços, formulários e campanhas

## Detalhes técnicos

- Empresa: BRILHANTAO MATERIAL DE CONSTRUCAO LTDA — 45a25827-220b-4105-a1fc-b6c1ab5b6108
- Apagar `mensagens` e `crm_cards` filtrando por `company_id`
- `lead_nota`, `lead_evento` e `crm_card_stage_history` saem por cascata
- `agendamento`, `mensagem_agendada`, `crm_venda`, `fin_lancamento` e `agent_feedback` têm a referência ao card/mensagem zerada (ON DELETE SET NULL) — os registros em si permanecem
- Conferência de contagens antes e depois
- Nenhuma alteração de código; o botão da Zona de Perigo fica como está
