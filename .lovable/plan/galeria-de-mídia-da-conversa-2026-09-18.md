# Galeria de Mídia da Conversa

## Objetivo
Dar ao cliente um lugar para ver todos os arquivos (fotos, vídeos, áudios, documentos) de uma conversa específica, sem rolar o chat inteiro.

## Impacto de longo prazo (contexto, sem mudança de código)
- Arquivos ficam no armazenamento do Lovable Cloud (bucket chat-media): hoje ~10.260 arquivos, ~3 GB.
- Não há política de limpeza automática — o uso cresce conforme o volume de conversas. Nenhuma ação neste plano; se quiser, um plano futuro pode definir retenção (ex.: apagar mídia com mais de X meses).

## O que será feito

### 1. Função de servidor — `getConversationMedia` (src/lib/chat-media.functions.ts)
- Recebe o número da conversa; filtra `mensagens` por `company_id` + `numero` com mídia (midia_tipo não nulo).
- Reassina as URLs (1 ano) usando o caminho real no storage, igual ao fluxo atual de renovação.
- Retorna lista: id, tipo, mime, nome, data, direção (enviada/recebida), URL assinada.
- Acesso autenticado via requireSupabaseAuth (RLS por empresa).

### 2. Painel "Mídia" na conversa (src/routes/app/conversas.tsx)
- Botão no cabeçalho da conversa (ícone de imagem) ao lado das ações existentes.
- Abre um painel lateral com galeria em grade:
  - Abas/filtros: Tudo | Fotos | Vídeos | Áudios | Documentos.
  - Cada item mostra miniatura (imagem/vídeo) ou ícone (áudio/documento), data e direção.
  - Clique abre no visualizador já existente (MediaLightbox); documentos/áudios com botão de download.
- Ordenado do mais recente para o mais antigo; se a conversa não tiver mídia, mostra estado vazio.

## Fora do escopo
- Não cria bucket novo, não muda onde os arquivos são salvos, não adiciona política de limpeza.

## Validação
- Typecheck e build OK; teste via Playwright abrindo uma conversa com mídia e conferindo a galeria.
