# Auditoria: os agentes realmente seguem o módulo de Treinamento?

## Diagnóstico (verificado no código)

**Sim, quase tudo é obedecido.** O motor (`src/lib/ai-engine.server.ts`) carrega o `agent_config` completo (`select("*")`) e o `buildSystemPrompt` (`src/lib/ai-prompt.ts`) injeta no prompt do sistema:

- Identidade, objetivo, mensagem inicial obrigatória
- Roteiro oficial (como vender) com prioridade sobre o método genérico
- Regras rígidas (instrução de prioridade máxima)
- FAQ, objeções, políticas, ofertas, cupom, formas de pagamento
- Personalidade (tom, formalidade, emojis, proatividade, gírias etc.)
- Catálogo real de produtos/serviços (com preços — a IA não inventa preço)
- Exemplos few-shot e correções/feedbacks da equipe ("Ensine aqui")
- Palavras proibidas, pode/não pode fazer, handoff para humano

**Uma falha real encontrada: os arquivos da Base de Conhecimento NÃO são lidos.**
Quando você anexa PDF/DOCX/TXT no treinamento, o sistema salva só o nome e a URL do arquivo (`agent-ai.functions.ts` linha 496) e coloca no prompt apenas uma lista de links. A IA não consegue abrir links — então ela **ignora o conteúdo desses arquivos**. Todo o resto (textos digitados) funciona; os anexos não.

## Correção proposta

1. **Extrair o texto dos arquivos no upload**: ao anexar um arquivo na base de conhecimento, extrair o conteúdo em texto (PDF, DOCX, TXT) e salvar em uma nova coluna `knowledge_text` (ou tabela filha) no `agent_config`.
2. **Injetar no prompt**: alterar `buildSystemPrompt` para incluir o texto extraído (limitado a ~15.000 caracteres por agente, com os trechos mais relevantes primeiro) no bloco "BASE DE CONHECIMENTO", em vez de só listar URLs.
3. **Reprocessar arquivos já anexados**: rotina que lê os arquivos existentes no bucket `agent-knowledge` e preenche o texto para os agentes atuais, sem precisar reenviar.
4. **Aviso na UI**: mostrar no Studio um indicador de "conhecimento indexado: X caracteres" por agente, e alerta se um arquivo não pôde ser lido (ex.: PDF escaneado/imagem).

## Detalhes técnicos

- Arquivos afetados: `src/lib/agent-ai.functions.ts` (upload/extração), `src/lib/ai-prompt.ts` (bloco de conhecimento), `src/lib/ai-engine.server.ts` (passar o texto ao prompt).
- Extração de texto no servidor: PDF via parsing leve compatível com o runtime edge (sem `sharp`/binários); DOCX/TXT via parsers JS puros. Fallback: se a extração falhar, marca o arquivo como "não legível" e avisa na UI.
- Sem mudança de comportamento para quem não usa anexos.
