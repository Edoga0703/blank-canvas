# Operação de triagem manual (SEVCON)

Objetivo: toda mensagem nova cai no funil **Gestão**, sem dono. Um responsável faz a triagem e envia manualmente para o setor, o funil e o atendente certos. Nada é distribuído automaticamente.

## O que hoje impede isso

Verificado no sistema:

1. **As mensagens novas não entram em nenhum funil.** A entrada de mensagens procura um funil marcado como "comercial" para escolher a primeira etapa. A SEVCON tem só os 6 funis novos (Gestão, Fiscal, Pessoal, Contábil, Legalização, Financeiro), nenhum marcado assim. Resultado: o contato é criado sem etapa e não aparece no quadro.
2. **Quando há etapa em modo manual, o sistema já escolhe um dono sozinho** (rodízio da fila). Isso conflita com a triagem 100% manual.
3. **Transferir para setor pelo chat também escolhe o atendente sozinho** pela fila do setor.

## Garantia: nenhum outro cliente é afetado

Tudo é opcional e ligado por empresa. Os novos campos nascem desligados/vazios, e sem eles o sistema segue exatamente como hoje: entrada pelo funil comercial, rodízio automático e transferência de setor como está. Só a SEVCON recebe as configurações ligadas.

## O que será feito

### 1. Porta de entrada fixa no funil Gestão
- Marcar o funil **Gestão** como funil de entrada da empresa; toda conversa nova nasce na primeira etapa dele ("Nova Demanda").
- Contatos já existentes sem etapa são levados para "Nova Demanda".

### 2. Sem distribuição automática
- Nova opção por empresa: **Distribuição manual**. Com ela ligada, nenhuma mensagem recebe dono automático — nem na criação, nem ao mudar de etapa, nem ao transferir para setor.
- A fila de rodízio continua existindo para quem usa distribuição automática; para a SEVCON fica desligada.

### 3. Ação única de triagem
Na conversa e no card do lead, um botão **Encaminhar** com três escolhas em uma só tela:
- Setor (Fiscal, Pessoal, Contábil, Legalização, Financeiro, Gestão)
- Funil e etapa de destino (por padrão a primeira etapa do funil daquele setor)
- Atendente responsável (lista filtrada pelos membros do setor)

Ao confirmar: o card muda de funil/etapa, recebe o setor e o dono escolhido, e fica registrado no histórico do contato ("Encaminhado para Fiscal / Antônio").

### 4. Vínculo setor → funil
- Cada setor passa a poder apontar o funil dele. Assim, escolher "Fiscal" já sugere o funil Fiscal e a etapa "Nova Demanda". Configuração feita por setor, opcional.
- Para a SEVCON deixo os 6 vínculos prontos.

### 5. Recortes de visão
- Admin/dono vê tudo, inclusive o funil Gestão completo.
- Atendente vê apenas as conversas e cards dos setores dele — comportamento que já existe, apenas confirmado com os novos setores.

## Detalhes técnicos
- `crm_pipeline`: coluna `entrada` (bool, default false); a busca de etapa inicial em `crm-engine.server.ts` (`getStagesBrief`, `upsertCard`) e `lead-intake.server.ts` passa a priorizar `entrada = true` e cair no comportamento atual (`tipo = 'comercial'`) quando não houver.
- `company`: flag `distribuicao_manual` (bool, default false). `pickLeadOwner` e `assignCardToSector` retornam sem dono quando ligada.
- `department`: coluna `pipeline_id` (uuid, nulo) para o vínculo setor → funil.
- Nova server fn `encaminharCard` (setor + etapa + dono em uma transação) usada pelo diálogo em `conversas.tsx` e `lead-drawer.tsx`, gravando `lead_evento`.
- Dados SEVCON: `entrada = true` no funil Gestão, `distribuicao_manual = true`, `pipeline_id` dos 6 setores, e cards órfãos movidos para "Nova Demanda".

## Ordem de execução
1. Porta de entrada no funil Gestão + correção dos contatos sem etapa.
2. Desligar a distribuição automática para a empresa.
3. Vínculo setor → funil.
4. Diálogo "Encaminhar" no chat e no card.
