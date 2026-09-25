# Pesquisa de satisfação no próprio WhatsApp

Hoje só existe um formato: o sistema manda um link e o cliente responde em outra página. Vamos manter esse formato e acrescentar um segundo, respondido dentro da própria conversa. O dono da empresa escolhe qual dos dois usar.

## Como vai funcionar

**Configuração (Configurações → Satisfação)**
- Escolha do formato: "Link de pesquisa" (como hoje) ou "Responder no chat" (novo).
- Texto da pergunta editável, enviado exatamente como digitado (linhas, emojis e estrelas preservados). Texto padrão sugerido:

```text
Como você avalia o atendimento que acabou de receber?

⭐ 1 — Muito insatisfeito
⭐⭐ 2 — Insatisfeito
⭐⭐⭐ 3 — Regular
⭐⭐⭐⭐ 4 — Satisfeito
⭐⭐⭐⭐⭐ 5 — Muito satisfeito
```

- Pedir comentário depois da nota: ligado/desligado, com texto próprio ("Quer deixar um comentário?").
- Quando enviar: manual pelo atendente (padrão) e/ou automático ao finalizar o atendimento — as duas opções ficam disponíveis.
- Nada muda para quem não mexer: o formato continua "Link", igual a hoje.

**Na conversa**
- O atendente continua com o botão de enviar pesquisa; no formato novo o sistema envia a pergunta e passa a aguardar a resposta daquele contato.
- O cliente responde "4", "⭐⭐⭐⭐" ou "muito satisfeito" — o sistema entende número, estrelas e as palavras das opções. Se vier algo fora disso, reenvia uma orientação curta uma única vez.
- Registrada a nota, o sistema agradece e (se ativado) pede o comentário; a próxima mensagem do cliente vira o comentário.
- Enquanto a pesquisa está aberta, o agente de IA não responde por cima; a janela expira em 24h sem resposta.
- A resposta aparece na conversa normalmente, para o atendente ver o que o cliente escreveu.

**Página "Satisfação" (novo módulo no menu)**
- Média geral, total enviado, total respondido e taxa de resposta.
- Distribuição de 1 a 5 em barras e evolução por período (7/30/90 dias).
- Ranking por atendente com média, respostas e nº de notas baixas.
- Lista de respostas com nome, telefone, nota, comentário, atendente e data; filtros por período, atendente e nota; link para abrir a conversa.
- Exportar em planilha.
- Alerta automático: nota 1 ou 2 gera notificação para dono e administradores (sino), com acesso direto à conversa.

## Detalhes técnicos

- Banco: colunas novas em `company` (`csat_formato` default `link`, `csat_pedir_comentario`, `csat_texto_comentario`, `csat_enviar_ao_finalizar`) e em `csat_response` (`canal` default `link`, `estado`, `expira_em`). Tudo aditivo e com padrão igual ao comportamento atual.
- Envio: `sendCsat` em `src/lib/csat.functions.ts` ganha o ramo "chat" — grava a resposta pendente, envia o texto literal via `renderTemplate` e não gera link.
- Leitura da resposta: nova etapa em `src/lib/ai-engine.server.ts` / pipeline de entrada — antes de qualquer processamento da IA, se houver `csat_response` pendente para o número, interpreta nota (1-5, estrelas, palavras), grava, responde o agradecimento e, se configurado, coleta o comentário na mensagem seguinte. Mesmo caminho serve para Uazapi/Telegram/Meta.
- Pausa da IA durante a janela da pesquisa reutiliza o mecanismo de `contact_pause`.
- Relatórios: `src/lib/csat-reports.functions.ts` passa a devolver série temporal e filtro por nota; nova rota `src/routes/app/satisfacao.tsx` consome tudo.
- Alertas de nota baixa usam `push_notificacao` na gravação da nota.
- Envio ao finalizar atendimento: gatilho no ponto onde a conversa é marcada como finalizada, respeitando a configuração.
