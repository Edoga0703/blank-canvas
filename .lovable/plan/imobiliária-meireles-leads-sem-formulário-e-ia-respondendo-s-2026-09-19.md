# Imobiliária Meireles — leads "sem formulário" e IA respondendo sozinha

## O que está acontecendo (confirmado no banco)

Os dois relatos têm a mesma origem: os leads **vêm sim do formulário**, mas o sistema os rotula errado e a primeira mensagem automática é marcada como se fosse a IA.

1. **"Entra lead sem ser pelo formulário"**
   Os leads chegam pela chave de integração "FORM. INC PULSE" (Make), que envia os leads dos formulários do Instagram/Facebook. Como o envio traz a origem do anúncio (ig/fb, campanha "[...] [form.meta]"), o sistema classifica o contato como "Link com UTM" em vez de "Formulário". Por isso o cliente vê leads novos sem formulário no histórico ("Lead via wa_link_utm").

2. **"O contato não fala nada e só a IA responde"**
   A etapa **Novo Lead** (funil Comercial) está com **automação ligada e disparo imediato (0 minutos)**, com o texto "Olá! Sou da Imobiliária Meireles...". Assim que o lead entra, essa mensagem sai sozinha — antes de o contato escrever qualquer coisa.

3. **"Na coluna Novo Lead a IA está desativada, mas aparece IA respondendo"**
   A etapa está mesmo em atendimento **manual** (IA desligada). A mensagem é da automação da etapa, não do agente de IA — só que ela é gravada com o autor "IA", então o chat mostra a etiqueta "AGENTE IA" e o topo da conversa fica "IA ativa". É um problema de rótulo, que faz parecer que a IA está agindo sozinha.

## O que proponho corrigir

1. **Rotular corretamente a origem**: quando o lead chega por uma chave de integração de formulário, registrar o canal como "Formulário" e manter a campanha/anúncio como informação complementar, em vez de virar "Link com UTM".
2. **Separar automação de IA nas mensagens**: mensagens disparadas pela automação da etapa passam a ser marcadas como "Automação", com etiqueta própria no chat, e deixam de acionar o indicador "IA ativa". O agente de IA continua identificado como IA.
3. **Deixar claro na etapa**: no ajuste da coluna Novo Lead, mostrar aviso de que a automação com disparo imediato envia a mensagem de boas-vindas assim que o lead entra, para o cliente decidir se mantém, atrasa ou desliga.

Nada disso muda a configuração de nenhum cliente sozinho — só corrige rótulos e deixa a escolha visível.

## Alternativa imediata (sem mexer no sistema)

Se o cliente quiser parar a mensagem automática hoje: basta desligar a automação da etapa Novo Lead, ou colocar um atraso, nas configurações do funil.

## Detalhes técnicos

- Entrada: `src/routes/api/public/lead-capture.ts` usa `deriveCanal`, que retorna `wa_link_utm` sempre que há `utm_source`; passar a priorizar `formulario` quando a origem é um token de captura de formulário (e preservar utm em `origem`/campos utm).
- Disparo: `src/lib/kanban-engine.server.ts` grava `autor: "ia"` na mensagem da régua; criar/usar `autor: "automacao"` e ajustar a renderização em `conversas.tsx`/bolha de mensagem e o cálculo do estado "IA ativa" no cabeçalho.
- Retrocompatibilidade: tratar `autor: "ia"` existente como hoje; só as novas mensagens de régua usam o novo autor.
- Etapa afetada no cliente: funil Comercial, "Novo Lead" (`regua_ativa=true`, `delay 0 minutos`, `modo_atendimento=manual`).
