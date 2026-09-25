# Compactar card do lead no CRM Kanban (direção v2 aprovada)

## Objetivo
Card mais denso e curto (~250px → ~165px de altura) mantendo todas as informações essenciais: nome, telefone, valor, etapa/canal, prévia da última mensagem, responsável, data e ações rápidas.

## Referência visual (aprovada)
Direção "Compacto com barra de ações": avatar menor, valor no canto superior direito, badges em pílulas pequenas, ações de ícone em linha horizontal discreta (destaque no hover), prévia de mensagem em 1 linha com borda esquerda, rodapé em linha única (responsável + data).

## Mudanças (somente `CardBody` em `src/routes/app/crm.tsx`)

1. **Topo**
   - Avatar reduzido de 44px para 32px.
   - Nome de 15px bold → 13px semibold; telefone 12px → 11px.
   - Valor "R$" movido para o topo, à direita (13px bold, cor da marca), em vez do rodapé.
2. **Linha de badges + ações**
   - Badges (IA, canal, tags, SLA atrasado) em pílulas 10px compactas, à esquerda.
   - Ações (WhatsApp, Agendar, Encaminhar, mover etapa) em linha horizontal à direita, ícones 16px, opacity reduzida e 100% no hover do card — comportamento/títulos/stopPropagation preservados.
3. **Prévia da mensagem** — 1 linha truncada, 12px, com borda esquerda discreta.
4. **Rodapé** — linha única: avatar 20px + nome do responsável (ou "Agente IA") à esquerda, data/hora à direita (10px). Sem divisor duplo; um `border-t` fino.
5. **Espaçamentos** — padding py-3/gap menores; borda lateral de canal mantida (5px, cor por canal).

## Fora de escopo
- Nenhuma mudança de colunas, drag-and-drop, diálogos (Agendar/Encaminhar), permissões ou backend.
- Nenhum impacto em outros clientes (visual padrão do produto).

## Validação
- Typecheck (`tsgo`) e build.
- Playwright: screenshot do kanban em /app/crm confirmando altura menor e ações no hover; clicar em Agendar/Encaminhar para garantir que abrem.
