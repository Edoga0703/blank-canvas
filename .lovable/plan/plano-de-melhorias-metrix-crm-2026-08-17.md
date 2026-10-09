---
name: crm-improvements
description: Implementação de Retenção de Dono, Popup de Perda e Gestão de Metas
type: feature
---

# Plano de Melhorias Metrix CRM

Este plano detalha a implementação de três melhorias principais solicitadas pelos clientes: persistência de dono do lead, automação de perda com registro de valor/retorno e gestão de metas (geral e individual).

## Mudanças no Banco de Dados (SQL)

- **crm_goals** (Nova Tabela):
  ```sql
  CREATE TABLE public.crm_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid REFERENCES public.company(id) ON DELETE CASCADE NOT NULL,
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL para meta geral da empresa
      valor_meta numeric(15,2) DEFAULT 0,
      mes integer NOT NULL,
      ano integer NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(company_id, user_id, mes, ano)
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_goals TO authenticated;
  GRANT ALL ON public.crm_goals TO service_role;
  ALTER TABLE public.crm_goals ENABLE ROW LEVEL SECURITY;
  
  CREATE POLICY "Admins can manage goals" ON public.crm_goals
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

  CREATE POLICY "Users can view their own goals" ON public.crm_goals
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  ```

## 1. Persistência de Dono do Lead (Lead Owner Retention)
- **Objetivo**: Garantir que se um lead retornar, ele seja atribuído ao mesmo dono que o atendeu anteriormente.
- **Implementação**:
  - Modificar `src/lib/crm-engine.server.ts` -> `upsertCard`: Alterar a lógica para preservar `owner_id` se o card já existir.
  - Modificar `src/routes/api/public/whatsapp-webhook.ts`: Ajustar a verificação de `pickLeadOwner` para só disparar se `currentCard.owner_id` for nulo.

## 2. Popup de Perda e Automação de Retorno
- **Objetivo**: Abrir um diálogo ao mover para "Perda" para registrar o valor perdido e agendar um retorno futuro.
- **Implementação**:
  - Modificar `src/routes/app/crm.tsx`:
    - Adicionar `LossDialog` ativado ao mover para etapa de tipo "perda".
    - Campos: Valor da Perda, Agendar Retorno (Data/Hora e Etapa).
    - Lógica: Salvar valor no card, criar evento de perda e agendamento de mensagem se solicitado.
  - Adicionar widget de "Valor Perdido" no Dashboard.

## 3. Gestão de Metas (Geral e Individual)
- **Objetivo**: Permitir que admins gerenciem metas da empresa e individuais. Atendentes veem apenas sua meta.
- **Implementação**:
  - Criar componente de gestão de metas em `src/routes/app/comercial.tsx` (ou similar).
  - Admin: Lista de usuários com inputs para meta mensal + input de meta geral da empresa.
  - Atendente: Visualização do progresso da própria meta (vendas realizadas vs meta).

## Verificação
- Testar entrada de lead repetido para validar `owner_id`.
- Testar movimentação para "Perda" e preenchimento do popup.
- Validar acesso e edição de metas por admin e bloqueio para atendente.