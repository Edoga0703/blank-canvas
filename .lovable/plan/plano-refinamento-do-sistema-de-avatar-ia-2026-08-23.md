# Plano: Refinamento do Sistema de Avatar IA

O usuário solicitou uma mudança no fluxo de criação de avatares para os agentes de IA. Em vez de um prompt livre e aleatório, o objetivo é permitir que o administrador defina predefinições (background, estilo, etc.) e o cliente (usuário do sistema) preencha características específicas (gênero, tom de pele, acessórios, cor da camisa) e um nome para o avatar.

## Alterações Propostas

### 1. Banco de Dados
- Nenhuma alteração de schema necessária (já temos `avatar_url`, `avatar_traits` e `avatar_prompt`). Usaremos `avatar_traits` para armazenar as preferências de estilo predefinidas pelo sistema.

### 2. Backend (`src/lib/agent-ai.functions.ts`)
- Atualizar a função `generateAgentAvatar` para aceitar um objeto de características (`traits`) estruturado.
- Implementar a construção do prompt final combinando:
  - **Predefinições Fixas**: Estilo "pixel 3D", background "clean/white tone".
  - **Características do Usuário**: Gênero, tom de pele, acessórios, cor da camisa.
  - **Nome do Avatar**: Incluir o nome no contexto da imagem.
  - **Prompt Extra**: Um pequeno texto adicional que o usuário pode digitar.

### 3. Frontend (`src/components/agente/avatar-builder.tsx`)
- Redesenhar a interface do construtor de avatar:
  - Campo para **Nome do Avatar**.
  - Seletores visuais para:
    - **Gênero** (Masculino / Feminino).
    - **Tom de Pele** (Paleta de cores).
    - **Acessórios** (Óculos, Boné, etc.).
    - **Cor da Camisa** (Paleta de cores).
  - Campo opcional para **Prompt Extra** (instruções adicionais).
- Remover campos de prompt livre total que permitam desviar do estilo pixel 3D.
- Atualizar o estado para gerenciar essas novas propriedades.

### 4. Prompt de IA (`src/lib/ai-prompt.ts`)
- (Opcional) Garantir que, se o avatar tiver um nome, o sistema de IA possa referenciá-lo, embora o foco aqui seja a geração da imagem.

## Detalhes Técnicos

### Estrutura do Prompt Gerado
O prompt final enviado para o DALL-E 3 (ou Gemini Image) será algo como:
`3D pixel art style avatar, [GÊNERO], [TOM DE PELE], wearing a [COR DA CAMISA] shirt, [ACESSÓRIOS], high quality digital illustration, professional lighting, clean minimal [BACKGROUND] background, named [NOME]. [PROMPT EXTRA]`

### Mapeamento de Traits
Usaremos a interface `AvatarTraits` (que já existe mas estava sendo limpa) para armazenar os campos:
```typescript
{
  name: string;
  gender: 'masculino' | 'feminino';
  skinTone: string;
  clothingColor: string;
  accessories: string[];
  extraPrompt?: string;
}
```

## Por que essa abordagem?
Esta solução atende ao pedido de "controle" sobre o que a IA gera, garantindo consistência visual (pixel 3D + fundo limpo) enquanto permite personalização granular pelo usuário final, evitando gerações aleatórias que não combinam com a marca Metrix CRM.
