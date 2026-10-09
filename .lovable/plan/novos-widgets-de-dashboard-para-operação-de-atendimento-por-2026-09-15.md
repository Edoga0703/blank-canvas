# Novos widgets de dashboard para operação de atendimento por setor

Widgets adicionais para clientes que usam o sistema como operação de atendimento (triagem manual, setores, prazos), como a SEVCON. Nada do painel atual muda: todos são novos, opcionais, e só aparecem se a pessoa adicionar pela galeria de widgets.

## Garantia: nenhum cliente existente é afetado

- Nenhum widget atual é alterado ou removido.
- Os novos não entram em nenhum painel por padrão — ficam disponíveis na galeria para quem quiser adicionar.
- Quem usa o painel de vendas hoje continua vendo exatamente o mesmo.

## Widgets a criar

### Fila e triagem
1. Fila de triagem — demandas na etapa de entrada sem setor/responsável, com a mais antiga esperando
2. Tempo médio de triagem — da entrada até o encaminhamento
3. Pico de entrada — volume por hora e por dia da semana
4. Tempo até a primeira resposta humana

### Carga e prazos
5. Demandas abertas por setor
6. Carga por atendente — demandas em aberto por pessoa
7. Demandas sem responsável por setor
8. Reencaminhamentos — quantas trocaram de setor (indica triagem errada)
9. No prazo x atrasadas
10. Vencendo hoje e nas próximas 24h
11. Paradas há X dias sem movimentação
12. Envelhecimento do backlog — 0–3 / 4–7 / mais de 7 dias

### Fluxo e gargalos
13. Entradas x concluídas no período (o backlog cresce ou diminui)
14. Tempo médio por etapa — onde a demanda trava
15. Aguardando cliente / aguardando documentos — lista das mais antigas
16. Aguardando órgão — demandas protocoladas ou em exigência

### Produtividade e qualidade
17. Concluídas por atendente e por setor
18. Retrabalho — demandas que voltaram para uma etapa anterior
19. CSAT por setor e por atendente
20. Clientes sem nenhuma demanda no mês
21. Cumprimento das rotinas recorrentes do mês

## Como aparece para o usuário

- Na galeria de widgets surge um grupo novo, "Atendimento & Operação", com esses itens.
- Cada um respeita o filtro de período já existente no painel e o que a pessoa pode ver (atendente vê o escopo dele; dono e administrador veem tudo).
- Widgets de lista (fila, aguardando cliente, vencendo hoje) levam direto para a demanda ao clicar.

## Detalhes técnicos

- Novo arquivo de consultas `src/lib/dashboard-ops.functions.ts` com server functions autenticadas, reaproveitando `crm_cards`, `crm_stage`, `crm_pipeline`, `crm_card_stage_history`, `department`, `department_member`, `mensagens` e `csat_response`; sem tabela nova.
- Métricas de tempo por etapa, retrabalho e reencaminhamento saem de `crm_card_stage_history` (já gravada por trigger).
- Prazos usam os campos de prazo já existentes na etapa/card; se a etapa não tiver prazo definido, o widget mostra "sem prazo configurado" em vez de considerar atrasado.
- Registro dos widgets em `src/components/dashboard-v2/widgets-registry.tsx`, seguindo o mesmo formato dos atuais (id, título, tamanho, componente), em uma categoria nova.
- Nenhum layout padrão é alterado: sem mudança em `LAYOUT_VERSION` nem nos presets existentes.
- Entrega em quatro lotes, na ordem dos grupos acima, validando build e visual a cada lote.
