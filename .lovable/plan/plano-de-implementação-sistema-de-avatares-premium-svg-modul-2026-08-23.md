# Plano de Implementação: Sistema de Avatares Premium (SVG Modular)

Melhorar a qualidade visual e modularidade dos avatares do Agente IA, migrando de imagens estáticas para um sistema de camadas SVG de alta fidelidade, conforme a referência visual e especificações fornecidas.

## Alterações Propostas

### 1. Novo Componente de Renderização SVG
- Criar `src/components/agente/agent-avatar.tsx`: Componente central que recebe `presentation`, `skinTone`, `hairstyle`, `accessories` e `clothingColor`.
- Implementar a estrutura de camadas proposta (background, shoulders, neck, face, features, hair, etc).
- Utilizar `viewBox="0 0 400 400"` para garantir alinhamento perfeito entre as camadas.
- Adicionar suporte a sombras sutis, profundidade facial e detalhes premium (olhos expressivos, contornos limpos).

### 2. Biblioteca de Camadas (Paths)
- Criar `src/components/agente/avatar-layers/index.tsx`: Contendo as definições de paths SVG para:
  - **Bases**: Masculino e Feminino.
  - **Tons de Pele**: 5 variações (conforme `avatar-3.txt`).
  - **Cabelos**: Curto (estilo Rafa), Cacheado, Crespo, Ondulado e Careca.
  - **Acessórios**: Óculos redondos modernos, Barba aparada, Boné.
  - **Vestuário**: Camisa polo com cores dinâmicas (Azul, Verde, Laranja, Cinza).

### 3. Refatoração do Avatar Builder
- Atualizar `src/components/agente/avatar-builder.tsx` para:
  - Substituir `pickAvatar` pela renderização direta do `<AgentAvatar />`.
  - Atualizar o preview principal e as miniaturas de cabelo para usar o componente SVG.
  - Garantir que a seção "Sugestões prontas" renderize os 6 presets específicos descritos no documento.
  - Ajustar o estilo visual para corresponder exatamente à imagem de referência (bordas, sombras, layout).

### 4. Persistência e Integração
- Atualizar `src/components/agente/avatar-library.ts` para focar em configurações de traits em vez de URLs de imagem.
- Garantir que o componente `AgentAvatar` seja utilizado em:
  - Lista de agentes (`AgenteCard`).
  - Header do estúdio.
  - Janela de conversas (mensagens do agente).
- Ajustar a função `updateAgentAvatar` para persistir o objeto de configuração completo no banco de dados.

## Detalhes Técnicos
- **SVG Modular**: Cada parte do corpo será um subcomponente ou função que retorna paths, permitindo sobreposição perfeita.
- **Escalabilidade**: O componente suportará a prop `size` para renderização nítida de 32px a 140px.
- **Estilo Metrix**: Uso rigoroso da cor `#0B22FE` para estados selecionados e interativos.
