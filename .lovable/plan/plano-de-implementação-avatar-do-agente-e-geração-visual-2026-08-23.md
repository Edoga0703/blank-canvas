# Plano de Implementação: Avatar do Agente e Geração Visual

O objetivo é permitir que o cliente crie ou escolha um avatar para seu agente de IA, integrando isso ao processo de configuração e identidade visual no Agent Studio.

## Alterações Propostas

### 1. Banco de Dados (Supabase)
- Adicionar coluna `avatar_url` (TEXT) na tabela `public.agent_config` para armazenar o link da imagem do agente.
- Adicionar coluna `avatar_prompt` (TEXT) para persistir o comando usado na geração (útil para refinamento).

### 2. Backend (Server Functions)
- Criar a função `generateAgentAvatar` em `src/lib/agent-ai.functions.ts` que utiliza o `lovableAiChat` (ou uma nova integração com DALL-E/Imagen via Lovable AI Gateway) para gerar uma imagem baseada na descrição do negócio e personalidade do agente.
- Atualizar `GeneratedAgentConfig` para incluir sugestões de aparência/avatar durante o setup inicial.

### 3. Frontend (Agent Studio)
- **Componente de Avatar**: No `AgentePage`, substituir o `InitialsAvatar` por um componente que suporte imagens.
- **Interface de Edição**: Adicionar um botão "Trocar Avatar" no cabeçalho do Studio ou na aba "Visão Geral".
- **Fluxo de Geração**: Implementar um modal/seção onde o usuário pode:
    - Descrever a aparência desejada.
    - Gerar via IA (usando os créditos do sistema).
    - Escolher de uma galeria de presets (humano, robô, mascote).
    - Upload manual (via Supabase Storage).

## Detalhes Técnicos
- **Geração de Imagem**: Utilizar o Lovable AI Gateway para chamadas de `text-to-image`.
- **Storage**: As imagens geradas ou enviadas serão armazenadas em um novo bucket `agent-avatars` no Supabase Storage.
- **Prompting**: O sistema sugerirá prompts automáticos baseados no `nome_agente` e `estilo_comunicacao` (ex: "Avatar de uma consultora de vendas amigável chamada Lia, estilo 3D minimalista").

## Considerações de Design
- Manter o padrão visual do **Metrix CRM** (bordas arredondadas 2xl, sombras suaves).
- O avatar deve ser exibido tanto no painel de configuração quanto na visualização do Playground (simulando a foto do perfil do WhatsApp).
