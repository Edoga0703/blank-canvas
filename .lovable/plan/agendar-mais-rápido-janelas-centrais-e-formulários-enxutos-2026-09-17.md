# Agendar mais rápido: janelas centrais e formulários enxutos

Hoje os dois formulários abrem numa aba lateral e pedem campos demais. A ideia é abrir uma janela no centro da tela e deixar visível só o essencial, com o resto escondido em "Mais opções".

## Novo compromisso

Visível por padrão (6 campos):
- Contato (busca por nome/telefone; permite digitar nome e telefone manualmente)
- Serviço (ao escolher, já preenche título e duração)
- Responsável
- Data
- Hora de início + duração
- Lembrete no WhatsApp: botões rápidos "Sem lembrete · 30 min · 1 h · 1 dia"

Dentro de "Mais opções" (recolhido):
- Título personalizado, tipo, modalidade, status
- Endereço, link da reunião
- Descrição, observações internas, tags, participantes da equipe
- Repetir (recorrência)

Mantidos: aviso de conflito de horário no topo e sugestões de horários livres.

## Nova mensagem

Visível por padrão (4 campos):
- Destinatário (busca de contato)
- Texto da mensagem, com os atalhos de variáveis e a pré-visualização
- Data e hora
- Botão "Enviar agora"

Dentro de "Mais opções":
- Responsável, título interno, compromisso relacionado
- Canal (só WhatsApp hoje; fica oculto)

## Detalhes técnicos

- `appointment-form.tsx` e `message-form.tsx` trocam `Sheet` por `Dialog` centralizado (`sm:max-w-lg` para mensagem, `sm:max-w-2xl` para compromisso), com corpo rolável (`max-h-[85vh] overflow-y-auto`) e rodapé fixo.
- Campos secundários vão para um `Collapsible` "Mais opções", fechado por padrão; ao editar um item que já usa algum desses campos, a seção abre automaticamente.
- Nada muda no banco nem em `agenda.functions.ts`: os mesmos campos continuam sendo enviados, apenas mudam de lugar na tela.
- Lembrete vira botões de atalho que gravam o mesmo `lembrete_min_antes` (0 / 30 / 60 / 1440), com opção de digitar outro valor dentro de "Mais opções".
- Responsividade: no celular a janela ocupa quase toda a largura e rola normalmente.
