# Plano de Reorganização do Fluxo de Automação nos Funis

O objetivo é tornar o pop-up de automação mais intuitivo e poderoso, permitindo lidar com contingências comerciais (ex: lead que responde "não tenho interesse") e gargalos, além de organizar melhor as funcionalidades existentes.

## Alterações Sugeridas

### 1. Interface do Pop-up de Automação
- **Organização em Tabs**: Dividir a automação em três seções claras:
    - **Atendimento**: Quem responde (IA/Manual) e Fila de Distribuição.
    - **Mensagem (Régua)**: Configuração de disparo de mensagem automática.
    - **Ações e Regras**: Onde o lead vai se responder ou se não responder.
- **Melhoria Visual**: Uso de ícones e espaçamento para reduzir a confusão cognitiva.

### 2. Novas Funcionalidades de Fluxo
- **Mover para "Perdido" Automaticamente**: Adicionar uma opção rápida para mover o lead para a etapa de perda caso a automação identifique que ele não deve prosseguir.
- **Ações por Resposta**: Permitir definir comportamentos diferentes no fluxo caso o lead responda.
- **Encaminhamento Inteligente**: Facilitar a ponte entre funis (ex: Reengajamento -> Pós-venda) com lógica de consistência.

## Detalhes Técnicos

### Backend (Supabase)
- A tabela `crm_stage` já possui campos como `move_se_respondeu_para` e `move_se_sem_resposta_para`.
- A lógica de "não interesse" citada pelo usuário será implementada via melhoria na interface para permitir que o usuário configure o destino "Perdido" na regra de resposta.

### Frontend (React/TanStack)
- Refatoração do componente `AutomacaoDialog` em `src/routes/app/crm.tsx`.
- Implementação de `Tabs` do Shadcn UI para organizar os campos.
- Inclusão de presets de "Ações Comuns" (ex: "Se responder, marcar como Ganho/Perdido").

## Mapeamento de Fluxo Comercial
```text
[ Lead entra na Etapa ]
       |
       v
[ Atribuição / Distribuição ]
       |
       v
[ Disparo de Mensagem (Régua) ]
       |
       +--> [ Lead Responde ] --> [ Mover para Etapa X / Ganho / Perdido ]
       |
       +--> [ Lead Não Responde ] --> [ Mover para Etapa Y após N dias ]
```
