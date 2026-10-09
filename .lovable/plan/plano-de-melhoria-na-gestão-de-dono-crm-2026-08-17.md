# Plano de Melhoria na Gestão de Dono (CRM)

Este plano visa refinar a lógica de atribuição de "Dono" no CRM para garantir que o sistema respeite as ações manuais dos atendentes e as configurações de automação por IA.

## Mudanças propostas

### Gestão de Dono ao Excluir Conversas
- **Problema:** Ao excluir uma conversa, o "Dono" do lead permanecia vinculado. Se o lead retornasse, ele era direcionado diretamente ao atendente anterior, ignorando a IA.
- **Solução:** Implementar um "limpador" que remove o `owner_id` (dono) do card do CRM sempre que o histórico de mensagens de um contato for excluído.

### Controle de Dono ao Finalizar Atendimento
- **Problema:** Atendentes precisam de controle sobre se desejam ser os donos permanentes de um lead ou se o lead deve retornar para a triagem da IA/Fila em um próximo contato.
- **Solução:** 
    - Adicionar um diálogo de confirmação ao clicar em "Finalizar" no módulo de Conversas.
    - O atendente poderá escolher entre:
        1. **Finalizar e Manter como Dono:** O próximo contato vai direto para ele.
        2. **Finalizar e Remover Dono:** O próximo contato reinicia o fluxo da IA ou entra na fila de distribuição.

### Refinamento da Lógica de Recebimento de Mensagens
- **Problema:** A persistência de dono estava sendo aplicada de forma muito rígida no primeiro contato após a criação do card.
- **Solução:** Ajustar o `upsertCard` para que, se um card for recém-criado, o `owner_id` não seja forçado se a etapa estiver configurada para IA.

## Detalhes Técnicos

### 1. Banco de Dados / Funções
- Atualizar a função de servidor que lida com a exclusão de mensagens (`handleChatAction`) para também limpar o `owner_id` na tabela `crm_cards`.

### 2. Frontend (Conversas)
- Modificar o componente `ConversasPage` para abrir um `Dialog` ao finalizar o atendimento.
- Criar a função `finalizarComOpcoes(manterDono: boolean)` que chama a API de atualização do card.

### 3. Backend (CRM Engine)
- Ajustar `upsertCard` em `src/lib/crm-engine.server.ts` para não atribuir `owner_id` automaticamente no insert se houver intenção de usar IA.

### 4. Webhooks
- Garantir que a lógica de "Dono Permanente" só dispare se o lead realmente tiver um dono atribuído e se a etapa permitir.
