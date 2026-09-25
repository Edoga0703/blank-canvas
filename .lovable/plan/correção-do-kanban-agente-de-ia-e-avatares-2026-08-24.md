# Correção do Kanban, agente de IA e avatares

Corrigir o fluxo para que cada etapa tenha um comportamento único e previsível: mensagem fixa sem IA, IA sem disparos duplicados e identidade visual do lead preservada nas Conversas e no Kanban.

## Comportamento esperado

- **Modo manual / IA desligada:** nunca chamar o agente de IA; se houver régua com template fixo, enviar a mensagem configurada na primeira entrada do lead.
- **Modo automático:** executar primeiro a régua fixa; a IA só pode responder quando não existir mensagem fixa aplicável.
- **Modo IA:** somente o agente responde; a régua não envia mensagem concorrente.
- Cada mensagem recebida pode iniciar no máximo um processamento da IA e gerar uma única resposta de WhatsApp.
- A foto principal na lista, cabeçalho da conversa e card do CRM é sempre a foto do lead. O avatar do agente aparece apenas como indicador secundário de atendimento automatizado.

## Alterações

### 1. Unificar a decisão entre régua e IA
- Criar uma decisão central por etapa e usá-la nos webhooks Evolution e Uazapi.
- Inverter o fluxo atual que chama a IA antes da régua.
- Fazer o motor da régua retornar um resultado explícito (`enviado`, `aguardando`, `não aplicável`, `erro`) para o webhook decidir se a IA pode ou não atuar.
- Bloquear a IA também no modo automático enquanto houver template fixo válido, não apenas no modo manual.

### 2. Garantir o primeiro disparo do template fixo
- Considerar a régua já disparada somente quando `regua_ultimo_disparo_em` pertencer à entrada atual da etapa; um disparo antigo não bloqueará uma nova etapa.
- Tratar delay nulo ou zero como envio imediato.
- Não consumir o disparo quando o texto renderizado estiver vazio ou quando o envio falhar.
- Remover execuções soltas e erros silenciosos na troca de etapa; registrar o motivo real de cada bloqueio/falha.
- Selecionar uma conexão realmente ativa usando o despacho já centralizado do WhatsApp, evitando divergência entre provedores.

### 3. Eliminar respostas duplicadas da IA
- Propagar o identificador real da mensagem recebida até o motor da IA e criar uma trava idempotente no banco por empresa + mensagem recebida.
- Trocar o identificador aleatório de fallback do Uazapi por uma chave determinística baseada no evento recebido.
- Fazer webhooks repetidos reutilizarem o processamento já registrado, sem nova chamada ao modelo ou novo envio.
- Consolidar as partes retornadas pelo modelo em uma única mensagem, removendo o envio deliberado de 2–3 balões separados.
- Revalidar pausa e modo da etapa imediatamente antes do envio, impedindo que uma resposta já em processamento seja entregue após a IA ser desligada ou o lead mudar de etapa.

### 4. Melhorar aderência às instruções
- Respeitar primeiro a configuração do agente da empresa, sem o modelo/provedor global substituir silenciosamente a escolha local.
- Reforçar o prompt para resposta única e limpar todos os marcadores internos antes do envio.
- Aplicar retentativa limitada apenas para falhas transitórias do provedor; erros permanentes serão registrados e interrompidos.

### 5. Corrigir fotos nas Conversas e no CRM
- Na lista e no cabeçalho de Conversas, renderizar sempre `foto_url` do contato ou suas iniciais.
- Manter nome e foto do lead no topo mesmo quando a IA estiver ativa.
- Exibir o agente somente em selo/indicador separado.
- Remover do card Kanban qualquer leitura de campos de avatar do agente a partir do objeto do lead.

## Detalhes técnicos

- Adicionar uma tabela de controle de processamento com chave única, permissões restritas ao backend e limpeza segura de registros antigos.
- Atualizar os dois caminhos de webhook para passarem o ID da mensagem e seguirem a mesma ordem de decisão.
- Ajustar `kanban-engine.server.ts`, `ai-engine.server.ts`, `lovable-ai.server.ts`, o parser de saída e os componentes de Conversas/CRM.
- Manter compatibilidade com Evolution e Uazapi e não alterar configurações comerciais existentes das etapas.

## Validação

- Lead novo em etapa manual com template fixo: uma mensagem fixa e zero chamadas à IA.
- Lead novo em etapa automática com template: uma mensagem fixa e zero respostas concorrentes da IA.
- Etapa IA: uma única resposta consolidada.
- Repetir exatamente o mesmo webhook: nenhuma segunda resposta.
- Mover um card que já teve disparo para outra etapa: a nova régua executa normalmente.
- Desligar a IA durante uma geração: nada é enviado depois da desativação.
- Conferir lista, cabeçalho da conversa e Kanban com IA ligada/desligada: foto e nome do lead permanecem intactos.
- Executar testes direcionados, build e uma simulação real dos dois webhooks com inspeção dos registros persistidos.
