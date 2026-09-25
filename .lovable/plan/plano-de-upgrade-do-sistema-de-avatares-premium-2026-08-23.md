# Plano de Upgrade do Sistema de Avatares Premium

Melhorar a qualidade visual dos avatares do Agente IA para um estilo de ilustração 2D premium, seguindo a identidade visual da Metrix CRM e as referências fornecidas.

## Mudanças Visuais

### 1. Reconstrução do Componente AvatarArt
*   **Novos Traços Faciais**: Substituir círculos básicos por formas vetoriais mais expressivas (olhos com brilho, pálpebras, narizes definidos e sorrisos amigáveis).
*   **Estilos de Cabelo Detalhados**: Redesenhar os estilos "curto", "cacheado", "crespo" e "ondulado" usando múltiplas camadas de SVG para criar profundidade e textura.
*   **Vestuário Profissional**: Implementar uma camisa polo detalhada com gola, botões e sombras internas.
*   **Sombreamento Premium**: Adicionar sombras suaves no pescoço, contorno do rosto e cabelos para evitar o visual "flat" genérico.
*   **Padronização**: Garantir que todos os avatares sigam a mesma proporção de enquadramento (busto) e fundo circular azul claro.

### 2. Atualização do Construtor de Avatares
*   **Refinamento da UI**: Ajustar o layout do modal para destacar a prévia do avatar.
*   **Sugestões Atualizadas**: Atualizar a lista de sugestões prontas para refletir o novo padrão de qualidade premium.

## Detalhes Técnicos

*   **Tecnologia**: SVG nativo manipulado via React para garantir carregamento instantâneo e escalabilidade sem perda de qualidade.
*   **Persistência**: Manutenção da função `avatarToDataUri` para salvar a versão serializada do SVG no banco de dados.
*   **Compatibilidade**: Preservar a interface `AvatarTraits` existente para não quebrar integrações atuais.

## Arquivos Afetados

*   `src/components/agente/avatar-art.tsx`: Onde reside a lógica de desenho SVG.
*   `src/components/agente/avatar-builder.tsx`: Onde os parâmetros são selecionados.
