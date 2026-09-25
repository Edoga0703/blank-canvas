# Plan: Sistema Premium de Avatares (Modular + IA)

Melhorar a experiência de criação de avatares permitindo tanto a personalização modular (que o usuário elogiou no vídeo) quanto a geração de avatares únicos via inteligência artificial (conforme solicitado).

## Proposed Changes

### 1. Refinamento Visual (SVG)
- Atualizar as formas de rosto, cabelos e acessórios em `src/components/agente/avatar-layers/index.tsx` para um estilo mais "premium" e detalhado, aproximando-se da qualidade de ilustrações profissionais.
- Adicionar mais 4 variações de cabelo para cada gênero.

### 2. Integração de Geração por IA (DALL-E / Flux)
- **Interface**: Adicionar uma nova aba "Gerar com IA" no `AvatarBuilder.tsx`.
- **Funcionalidade**: Permitir que o usuário digite um breve prompt (ex: "Um robô amigável com gravata azul") ou use um botão "Gerar para mim" baseado na personalidade do agente.
- **Backend**: Implementar o fluxo real em `generateAgentAvatar` em `src/lib/agent-ai.functions.ts` usando o Lovable AI Gateway para gerar e salvar a imagem no bucket da empresa.

### 3. Melhoria no Componente AgentAvatar
- Modificar `AgentAvatar.tsx` para suportar tanto a renderização do SVG modular (baseado em `traits`) quanto a exibição de uma imagem remota (`avatar_url`).
- Adicionar animações suaves de transição ao trocar entre opções.

## Technical Details
- **Tabelas**: A tabela `agent_config` já possui `avatar_traits` (JSONB) e `avatar_url` (TEXT). O sistema passará a priorizar `avatar_url` se preenchido, caso contrário usa `avatar_traits`.
- **Geração de Imagem**: Utilizar o modelo mais adequado disponível no Gateway (como DALL-E 3 ou Stable Diffusion) para garantir alta fidelidade.
- **Performance**: Otimizar o carregamento das camadas SVG para evitar flickering durante a pré-visualização.

## User Review Required
- O usuário prefere que a geração por IA seja a opção principal ou apenas um complemento ao sistema modular?
- Há algum estilo específico de IA (ex: 3D Pixar, Desenho 2D, Realista) que deve ser o padrão?
