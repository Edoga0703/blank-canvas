# Remodelagem do CRM Admin (Master)

## Objetivo
Transformar a tela atual (uma pilha de cartões soltos) em um módulo organizado, e deixar claro e funcional o uso de **um único WhatsApp comercial** que serve tanto para o seu trabalho de prospecção dentro do CRM quanto para as automações administrativas do Master.

## Como fica o WhatsApp (ponto central)
Hoje já existe um "espaço interno" — uma conta de CRM igual à de um cliente, visível só para você. Ela é a chave da solução:

- Você conecta **um número** dentro desse espaço, em Conexões, como qualquer cliente faz.
- Você usa esse espaço no dia a dia: Conversas, Kanban, etiquetas, agendamentos, agente de IA — tudo igual a um cliente da Metrix.
- O Master **reutiliza essa mesma conexão** para as automações administrativas (boas-vindas, fim de teste, cobrança, inatividade) e para disparos à base.
- Resultado: uma conexão só, um histórico só. O que você dispara pelo Master aparece na mesma conversa que você atende manualmente.

O que falta e entra no plano:
1. Um cartão de conexão claro no topo, com estado (conectado / desconectado / sem número), nome do número e botão que leva direto às Conexões do espaço interno.
2. Um atalho "Abrir meu CRM comercial" que troca para o espaço interno com um clique (hoje não existe caminho óbvio).
3. Aviso explícito quando não há conexão: automações e disparos ficam desabilitados com a razão visível, em vez de falharem silenciosamente.
4. Registro dos envios administrativos como mensagens na conversa do contato, para não haver "envio invisível".

## Nova organização da tela
Cabeçalho fixo: título, estado da conexão, botão de abrir o CRM comercial.

Abas (uma coisa por aba, em vez da pilha atual):

1. **Visão geral** — números da base (clientes, em teste, inadimplentes, inativos), últimos envios e alertas (sem conexão, automação desligada, falhas recentes).
2. **Base de clientes** — lista dos clientes da plataforma como contatos: nome, telefone, plano, situação, último contato, e botão "abrir conversa". Botão de sincronizar deixa de ser manual/óbvio: passa a rodar sozinho e fica só como ação secundária.
3. **Automações** — cada régua (boas-vindas, fim de teste, atraso, inatividade) em linha limpa: ligar/desligar, prazo em dias, mensagem com variáveis, e contador de quantos clientes se encaixam hoje. Boas-vindas de cadastro entra aqui, junto das outras.
4. **Disparos** — segmento, mensagem, pré-visualização com quantidade e exemplos, agendamento opcional, e proteção contra reenvio no mesmo dia.
5. **Histórico** — envios com filtro por tipo, situação e período, e motivo do erro legível.

## Detalhes técnicos
- `src/routes/master/crm-admin.tsx` reescrito com `Tabs`, dividido em componentes em `src/components/master/crm-admin/` (`overview-tab`, `base-tab`, `automacoes-tab`, `disparos-tab`, `historico-tab`, `connection-header`).
- Novas funções em `src/lib/admin-crm.functions.ts`: `listAdminBase` (paginada, com filtros), `getAdminOverview` (contadores + alertas), `listAdminLogs` (filtros). `getAdminCrmStatus` fica enxuto.
- Conexão continua resolvida por `getActiveInstance(internalCompanyId)` em `admin-crm.server.ts`; nada de instância separada para o Master.
- Envio administrativo passa a gravar em `mensagens` vinculado ao card do cliente, além de `admin_automation_log`.
- Sincronização de contatos passa a rodar no tick de automações, sem depender de clique.
- `SignupWelcomeCard` é absorvido pela aba Automações.

## Fora do escopo
Nenhuma mudança no CRM dos clientes, nas conexões deles ou na cobrança.
