# Leads parados na qualificação quando o cliente não responde

## O que o vídeo mostra

Conversa da Madeireira: o cliente pergunta preço e endereço, o Agente de IA responde
("Posso encaminhar você para um atendente...", "Se precisar de mais alguma informação, é só avisar!")
e o cliente não responde mais. O card fica preso na etapa de qualificação: não vai para
follow-up nem é transferido para atendimento humano.

## Diagnóstico (a confirmar antes de corrigir)

Na rotina do funil existem duas regras que podem estar se anulando:

- "Parar se o lead responder / se houver mensagem" pausa a régua da etapa quando há
  qualquer mensagem enviada naquela etapa — inclusive a própria resposta da IA. Com a
  régua pausada, o prazo de "sem resposta" deixa de contar.
- A mudança de etapa por "X dias sem resposta" só acontece se essa régua estiver ativa.

Hipótese: a resposta da IA pausa a régua e o card nunca dispara o follow-up.
O primeiro passo do trabalho é confirmar isso nos cards reais citados no vídeo
(estado da régua, etapa, data da última mensagem) antes de mudar qualquer lógica.

## O que será feito

1. Levantar os cards parados da empresa (Madeireira) e conferir estado da régua, etapa e
   última interação — confirmando a causa exata.
2. Corrigir a regra: mensagem enviada pela IA não pausa mais a régua de acompanhamento.
   Só a resposta do cliente ou uma mensagem enviada por um humano pausa.
3. Garantir que a contagem de "dias sem resposta" use a última mensagem do cliente (ou,
   na falta dela, a entrada na etapa), de modo que o card sempre saia da qualificação no
   prazo configurado.
4. Reativar/destravar os cards que já ficaram presos, para que entrem no fluxo normal.
5. Validar com um caso real do funil e conferir que o comportamento comercial atual
   (cards que o cliente respondeu) continua igual.

## Detalhes técnicos

- `src/lib/kanban-engine.server.ts`: `parar_se_responder` hoje pausa a régua quando há
  saída na etapa (`houveSaidaNaEtapa`), sem distinguir autor IA x humano; `shouldMoveNoReply`
  exige `regua_status = 'ativa'` e usa a data-base atual. Ajuste: considerar apenas
  mensagens com autor humano/cliente para pausar, e basear o prazo em `ultima_mensagem_cliente`.
- Consulta de verificação em `crm_cards` + `mensagens` para a empresa da Madeireira antes
  de qualquer alteração.
- Sem mudança de schema.
