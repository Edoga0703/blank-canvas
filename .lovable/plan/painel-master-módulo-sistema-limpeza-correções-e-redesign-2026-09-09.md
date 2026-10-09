# Painel Master — módulo Sistema (limpeza, correções e redesign)

## 1. Menu duplicado
O módulo Sistema mostra duas barras de abas: a do topo (padrão do Master) e outra repetida dentro da própria tela. Fica só a de cima; a barra interna é removida (a navegação continua funcionando por ela).

## 2. Visão geral (fusão com Operação › Visão geral)
A aba "Visão geral" do Sistema sai. O que ela tem e a Visão geral de Operação não tem passa para lá:
- Saúde geral (status: saudável / atenção / crítico) com hora da última atualização
- Cartões de saúde: WhatsApp, IA e créditos, Cobrança, Filas
- Bloco recolhível "Detalhes técnicos" (latência de ingestão, volume, armazenamento, capacidade)

O que já existe nos dois (MRR, empresas, mensagens 24h, conexões) não é duplicado.

## 3. Inteligência Artificial
Fica onde está. Melhorias:
- Mostrar se a chave está salva, sem exibir o valor
- Teste de resposta com latência e mensagem de erro clara
- Indicação do provedor/modelo ativo em destaque

## 4. Popups e Avisos — correção real
Hoje o aviso "some" na tela mas volta, e a data de expiração é ignorada. Causa: as funções de avisos usam a conexão pública do sistema, sem permissão de escrita — a exclusão não altera nada e mesmo assim devolve sucesso.

Correções:
- Passar criar/editar/excluir avisos pela conexão autenticada, validando super admin
- Erro real na tela quando nada for alterado (nada de "removido" falso)
- Respeitar a data de expiração também na exibição para o cliente
- Botão para desativar sem excluir, e confirmação de exclusão
- Remover o aviso antigo "versão mobile lançada"

## 5. Monitoramento WhatsApp
- Remover Evolution do painel (cartões, testes e alertas)
- Remover "WhatsApp API oficial" do painel
- Fica somente Uazapi como provedor oficial, com o painel reorganizado para uma coluna só de conteúdo útil

## 6. Webhooks de cobrança
- Manter apenas AbacatePay e Kiwify; remover Cakto e PerfectPay do painel e das opções oferecidas
- "Últimos eventos recebidos" vira uma lista com rolagem própria e altura fixa, com busca e filtro por status
- Tela passa a usar toda a largura disponível (hoje está limitada e desalinhada)

## 7. Boas-vindas no cadastro
O cartão sai de Sistema e vai para **CRM Admin**, junto com os demais disparos e comunicações para clientes. Mesma funcionalidade (mensagem, teste, histórico), sem perder configuração.

## 8. Dados fiscais do emissor
Sai do painel Sistema (não é usado na operação atual). Os dados continuam guardados; se voltar a ser necessário, é só reexibir.

## 9. Feature flags
Auditoria da lista para garantir sincronia com o sistema real:
- Conferir os módulos existentes hoje e cadastrar os que faltam (inclui Academy/Treinamentos, Formulários, Comercial, Rota de retorno, Setores etc.)
- Corrigir os que estão com o estado errado (ex.: Treinamentos aparece como Público, mas é interno)
- Ligar de fato a visibilidade dos módulos da barra lateral a essas flags, para que ligar/desligar tenha efeito imediato
- Aviso na tela quando existir módulo no sistema sem flag cadastrada

## 10. Sugestões
Sai das abas de Sistema e vira item próprio na barra lateral do Master (seção Plataforma).

## 11. Notificações
Continua onde está, com opções extras de personalização (título, texto, público-alvo e canal), mantendo o comportamento atual.

## 12. Redesign
Padrão visual único para todas as telas do Sistema:
- Cabeçalho compacto com título, descrição e ações à direita
- Cartões com cantos arredondados, hierarquia clara e espaçamento consistente
- Largura total aproveitada, grades responsivas (1 / 2 / 4 colunas)
- Listas longas sempre com rolagem própria
- Estados de carregando, vazio e erro padronizados

## Detalhes técnicos
- `src/components/master-subtabs.tsx`: grupo `sistema` reduzido a IA, Popups, Monitoramento, Webhooks, Feature flags, Notificações; Sugestões vira item de menu em `src/routes/master.tsx`
- `src/routes/master/sistema.tsx`: remove barra interna de abas e a aba "visao"; blocos de saúde migram para `src/routes/master/painel.tsx`
- `src/lib/announcements.functions.ts`: trocar cliente anônimo por `requireSupabaseAuth` + checagem `is_super_admin`; retornar contagem afetada e lançar erro quando zero
- `src/lib/provider-monitor.server.ts` e `src/routes/master/diagnostico.tsx`: remover `evolution` e `wablast`
- `src/routes/master/configuracoes.tsx`: provedores limitados a `kiwify` e `abacatepay`; lista de eventos com contêiner de rolagem; remover cartão fiscal e mover `SignupWelcomeCard` para `src/routes/master/crm-admin.tsx`
- Feature flags: migração para inserir as chaves faltantes e ajustar `rollout`; leitura via `useFeatureEnabled` na barra lateral do app
