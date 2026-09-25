# Plano de Unificação e Reorganização: Usuários, Departamentos e Distribuição

Este plano detalha a unificação da gestão de usuários, departamentos e conexões, além da centralização da distribuição de leads, eliminando redundâncias.

## 1. Centralização no Cadastro de Usuários (Equipe)

### Backend e Lógica
- A tabela `company_user` será a fonte principal de vínculos.
- **Departamentos**: Utilizaremos a tabela `department_member` para gerenciar os vínculos, mas a interface de edição será centralizada na ficha do usuário.
- **Conexões**: Utilizaremos a tabela `company_user_instance` para definir quais instâncias de WhatsApp o usuário pode acessar.
- **Segurança**: Implementar validação para garantir que o usuário só visualize/interaja com leads de instâncias vinculadas a ele. Se não houver vínculo, o acesso às mensagens é bloqueado.

### Interface (`src/components/config/equipe-tab.tsx`)
- Adicionar seletores multiselect para **Departamentos** e **Conexões** no formulário de criação/edição de usuário.
- Garantir que a lista de instâncias disponíveis para seleção seja filtrada pela empresa atual.

## 2. Limpeza do Módulo de Departamentos (`src/components/config/departamentos-tab.tsx`)
- Remover o botão "Atendentes" e o diálogo de seleção de membros dentro da aba Departamentos.
- Manter apenas a visualização da contagem de membros (leitura).
- A gestão de quem pertence a qual departamento passa a ser feita exclusivamente na aba de **Usuários**.

## 3. Unificação da Distribuição de Leads
- **Remoção de Redundância**: Remover a seção de "Transferência" e "Ajustes Finos" do Agente de IA (`src/routes/app/agente.tsx`).
- **Fila Única**: O módulo de **Distribuição** (dentro de Equipe) passa a ser o único motor de regras.
- **IA Handoff**: Ajustar a lógica do Agente de IA para que, ao solicitar transferência, ele aponte para a fila padrão da empresa definida no módulo de Distribuição.

## 4. Implementação Técnica

### Arquivos a Modificar:
1.  `src/lib/team.functions.ts`: Garantir que `updateMember` e `inviteMember` processem corretamente os arrays `department_ids` e `instance_ids`.
2.  `src/components/config/equipe-tab.tsx`: Atualizar o formulário para incluir os novos seletores.
3.  `src/components/config/departamentos-tab.tsx`: Remover funções de edição de membros.
4.  `src/routes/app/agente.tsx`: Remover configurações de handoff manual.
5.  `src/lib/evolution.functions.ts`: (Se necessário) Ajustar a busca de atendente para usar a fila única.

## Cronograma de Execução
1.  **Fase 1**: Refatoração da UI de Usuários (Equipe) e inclusão de multiselects.
2.  **Fase 2**: Limpeza da UI de Departamentos e Agente IA.
3.  **Fase 3**: Ajuste nas Server Functions para garantir integridade dos vínculos.
4.  **Fase 4**: Validação final dos bloqueios de conexão por usuário.
