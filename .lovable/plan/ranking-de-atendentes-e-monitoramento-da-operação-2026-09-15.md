# Ranking de atendentes e monitoramento da operação

Três widgets novos na categoria "Atendimento & Operação", em tempo real, mais sugestões extras. Nada do painel atual muda: são opcionais, adicionados pela galeria.

## 1. Ranking de atendimento (tempo real)

Lista simples, em ordem de quem mais atendeu no período escolhido:

- Posição, foto/inicial, nome e setor
- Atendimentos (conversas respondidas), mensagens enviadas e demandas concluídas
- Barra de proporção e variação em relação ao período anterior
- Atualiza sozinho conforme chegam mensagens (sem precisar recarregar)

## 2. Monitoramento de usuários (tempo real)

Painel de "quem está trabalhando agora", pensado para operação de atendimento:

- Estado de cada atendente: online agora, ativo nos últimos minutos ou sem atividade hoje
- Conversas em aberto com ele e quantas estão sem resposta
- Tempo desde a última resposta dele e a espera mais antiga da fila dele
- Demandas atrasadas sob responsabilidade dele
- Alerta visual quando alguém acumula fila parada além de um limite

Observação honesta: o sistema não tem ponto/expediente, então "online" é medido pela atividade real (última mensagem enviada, última movimentação de card). É o indicador mais fiel possível hoje; se você quiser status manual (disponível/pausa/almoço), isso precisa virar um recurso à parte.

## 3. Ranking de satisfação

Melhor leitura das pesquisas:

- Atendentes ordenados pela nota média, com quantidade de respostas
- Distribuição de notas (1 a 5) em barrinha
- Percentual de promotores (4-5) e de insatisfeitos (1-2)
- Só entra no ranking quem tem um mínimo de respostas, para não distorcer
- Comentário negativo mais recente em destaque

## Outras sugestões para esse tipo de operação

- Tempo médio de resposta por atendente (velocidade, não volume)
- Conversas sem resposta há mais de X minutos (SLA de atendimento)
- Fila por setor agora: aguardando atendimento em cada departamento
- Mapa de calor de horários: quando chega demanda x quando a equipe responde
- Transferências entre setores por atendente (indica triagem errada)
- Reaberturas: demandas concluídas que voltaram
- Clientes atendidos por atendente no período

## Detalhes técnicos

- Novas consultas em `src/lib/dashboard-ops.functions.ts` (`getAtendimentoRanking`, `getUsuariosMonitor`, `getCsatRanking`), reaproveitando `mensagens`, `crm_cards`, `crm_card_stage_history`, `company_user`, `department_member` e `csat_response`. Sem tabela nova.
- Tempo real via canal Supabase Realtime em `mensagens` e `crm_cards`, com recarga agrupada (debounce) e assinatura encerrada ao desmontar, reaproveitando o cache existente de `ops-data.tsx`.
- Registro dos widgets em `src/components/dashboard-v2/ops-widgets.tsx` e `widgets-registry.tsx`, na categoria já existente.
- Escopo por papel mantido: atendente vê o próprio desempenho; dono e administrador veem todos. Sem mudança em `LAYOUT_VERSION` nem nos presets.
