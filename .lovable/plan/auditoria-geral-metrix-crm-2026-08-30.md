# Auditoria Geral — Metrix CRM

Resultado da varredura de segurança, banco, backend, endpoints públicos, infraestrutura e escalabilidade. Abaixo, o que está bom, o que é risco real e o plano de correção priorizado.

## O que já está sólido

- Todas as tabelas do banco têm proteção por linha ativa e políticas definidas (nenhuma tabela aberta).
- Nenhum acesso público/anônimo concedido a nenhuma tabela.
- Nenhuma política permissiva do tipo "libera tudo" para usuários comuns (só para o serviço interno).
- Dependências (npm): nenhuma vulnerabilidade alta ou crítica.
- Webhooks de pagamento (Kiwify, Cakto, PerfectPay, AbacatePay), Meta, Telegram, Uazapi, WhatsApp, Google Calendar e API pública v1 validam token/assinatura antes de processar.
- Rotinas de cron (campanhas, réguas, filas, watchdog) já exigem credencial de cron.

## Riscos reais encontrados

### 1. Chaves de IA legíveis por qualquer membro da empresa (CRÍTICO)
A tabela de configuração dos agentes guarda chaves OpenAI/Anthropic em texto puro, e qualquer usuário ativo da empresa (não só dono/admin) consegue lê-las. Um atendente comum pode extrair a chave e gerar custo/uso indevido.

### 2. Endpoint de resumo de lead sem autenticação (ALTO)
A função de resumo de conversas é pública e usa credencial administrativa (ignora as regras de acesso). Basta chamar com IDs válidos para ler mensagens de qualquer empresa. Além disso, importa a credencial administrativa no topo do arquivo, o que é um padrão arriscado nesse tipo de módulo.

### 3. Foto do lead servida sem verificação (MÉDIO)
A rota de foto entrega qualquer avatar sabendo empresa + número, sem checar sessão. Vazamento limitado, mas permite enumerar quais números existem numa empresa.

### 4. Funções internas do banco executáveis por usuários logados (MÉDIO)
10 funções privilegiadas continuam chamáveis diretamente por qualquer usuário autenticado. Algumas são intencionais; outras (crédito, provisionamento, seeds) não deveriam ser.

### 5. Extensão instalada no schema público (BAIXO)
Ponto de higiene apontado pelo verificador do banco.

### 6. Inchaço de infraestrutura (MÉDIO — custo/performance)
O histórico de execuções do agendador ocupa 226 MB — maior objeto do banco inteiro, sem utilidade operacional. Tende a crescer indefinidamente e encarecer/atrasar backups.

### 7. Escala das conversas (MÉDIO — futuro)
A tabela de mensagens já é a maior tabela de negócio e sofre muitas leituras sem índice (118 mil varreduras completas). Com o crescimento de clientes isso vira lentidão no módulo Conversas.

### 8. Contingência
Não há verificação documentada de restauração de backup, nem limite de taxa nos endpoints públicos (webhooks e API v1 podem ser inundados), nem alerta automático quando um cron para de rodar.

## Plano de correção (por prioridade)

**Fase 1 — Segurança imediata**
1. Restringir a leitura das chaves de IA apenas a dono/admin, mascarando as colunas de chave para os demais; mover a chave para o cofre de segredos quando possível.
2. Exigir sessão autenticada no resumo de lead e trocar a credencial administrativa pelo cliente do usuário (respeitando as regras de acesso); remover a importação administrativa do topo do arquivo.
3. Proteger a rota de foto do lead com verificação de sessão/assinatura temporária.
4. Revogar execução das funções internas que não precisam ser chamadas pelo app; manter só as usadas pelas políticas.
5. Mover a extensão para fora do schema público.

**Fase 2 — Robustez e contingência**
6. Limpeza automática do histórico do agendador (manter 7 dias) e das tabelas de log/auditoria (retenção definida).
7. Limite de taxa por token/IP nos webhooks e na API pública v1, com bloqueio progressivo.
8. Painel/alerta no Master quando um cron não roda no período esperado ou quando webhook falha em série.
9. Teste documentado de restauração de backup e checklist de recuperação (WhatsApp desconectado, provedor fora, IA sem crédito).

**Fase 3 — Escala**
10. Índices e paginação por cursor no histórico de mensagens; arquivamento de conversas antigas.
11. Revisão das consultas de dashboard/comercial para leitura agregada em vez de varredura ampla.
12. Padronizar toda função de servidor nova com autenticação obrigatória, e criar uma verificação que aponte funções sem proteção.

## Detalhes técnicos

- Correções 1, 4 e 5 são migrações de banco (políticas, GRANT/REVOKE, movimentação de extensão).
- Correção 2 e 3 afetam `src/lib/lead-summary.functions.ts` e `src/routes/api/public/lead-photo.ts`.
- Correção 6 usa rotina agendada de limpeza em `cron.job_run_details`, `audit_log` e `auth_log`.
- Correção 7 aplica limitação por token no handler, antes de qualquer processamento.
- Correção 10 exige índice composto por conversa + data em `mensagens` e troca de "carregar tudo" por paginação no módulo Conversas.

## Sugestão de execução

Recomendo aprovar a Fase 1 agora (baixo risco, alto impacto) e tratar Fases 2 e 3 em seguida, para não mexer em desempenho e cron no mesmo lote das correções de acesso.
