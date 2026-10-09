# Conversa duplicada da Pâmela (Madeireira Nova)

## O que aconteceu (confirmado nos dados)

Hoje, 16/09, na conta MADEIREIRA NOVA:

| Hora | Número gravado | Quem falou |
|---|---|---|
| 11:45 e 11:46 | 5585**9**99926859 (13 dígitos) | Diego (humano) — "Boa tarde", "Diego aqui da Madeireira..." |
| 11:47 | 558599926859 (12 dígitos) | Pâmela respondeu "Testado" e a IA respondeu |

É o mesmo contato. A conversa começou com o número digitado **com o nono dígito** (13 dígitos). O WhatsApp entrega normalmente, mas devolve a resposta no número real da conta, que nessa região é **sem o nono dígito** (12 dígitos). Como o sistema trata o número como texto puro, ele não reconheceu que era a mesma pessoa e abriu uma segunda conversa — a de cima, só com o número, e a de baixo com o nome "Pâmela".

Só existe 1 card no CRM (o de 12 dígitos, "Pâmela Tomaz"); o de 13 dígitos é uma conversa solta com as 2 mensagens enviadas.

## É bug do sistema ou só deles?

É do sistema, não é específico da Madeireira Nova. Acontece sempre que alguém inicia a conversa digitando/importando um número do Nordeste (DDD 81–89) e de outras regiões onde o WhatsApp usa o número antigo, sem o nono dígito. Quem sempre recebe o primeiro contato do cliente nunca vê o problema — por isso só apareceu agora, num teste de saída.

## Correção proposta

1. **Número canônico único**: criar uma função de comparação/normalização de números brasileiros que trate as duas formas (com e sem o nono dígito) como o mesmo contato.
2. **Antes de enviar**: consultar no provedor (Uazapi) qual é o número real do WhatsApp daquele contato e gravar a conversa sempre nesse número, não no que foi digitado.
3. **Na entrada**: ao chegar mensagem, procurar a conversa existente também pela forma alternativa do número antes de criar uma nova.
4. **Unificar o que já duplicou**: juntar as mensagens do número de 13 dígitos na conversa de 12 dígitos da Pâmela e rodar a mesma checagem nas demais contas, mostrando antes a lista do que será unificado (nada é apagado).

## Detalhes técnicos

- Nova util `br.ts` (ou dentro de `src/lib/evolution-helpers.ts`): `phoneVariants(numero)` retornando as formas 12/13 dígitos para DDI 55 + celular, e `isSameWhatsappNumber` passando a usar essas variantes (hoje só compara sufixos e falha nesse caso).
- Envio: `src/lib/wa-dispatch.server.ts` resolve o JID real via Uazapi (`/chat/check` ou o `jid` retornado no envio) e usa esse número ao gravar em `mensagens` e ao criar/achar o card.
- Entrada: `src/lib/uazapi-webhook.server.ts`, `src/routes/api/public/uazapi-webhook.ts` e `src/lib/crm-engine.server.ts` passam a buscar `crm_cards`/`mensagens` com `in ("numero", phoneVariants(n))` antes de criar registro novo.
- Merge: script pontual por empresa, atualizando `mensagens.numero` para a forma canônica e removendo o card órfão (sem excluir mensagens).
