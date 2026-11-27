export interface KnowledgeChunkInput {
  path?: string;
  name?: string;
  type?: string;
  textStatus?: string;
  text?: string;
  validUntil?: string | null;
}

export interface RetrievedKnowledgeChunk {
  id: string;
  source_name: string;
  source_path: string;
  chunk_index: number;
  content: string;
  score: number;
}

/**
 * Divide texto de conocimiento en fragmentos limpios con solapamiento,
 * priorizando cortes por párrafos o frases y descartando fragmentos < 25 caracteres.
 */
export function chunkKnowledgeText(text: string, maxChars = 900, overlap = 120): string[] {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length < 25) return [];
  if (normalized.length <= maxChars) return [normalized];

  const safeMax = Math.max(200, maxChars);
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(safeMax / 3)));

  // Primero separa en unidades naturales (párrafos y luego oraciones si un párrafo excede maxChars)
  const units: string[] = [];
  for (const para of normalized.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= safeMax) {
      units.push(p);
    } else {
      const sentences = p.split(/(?<=[.!?])\s+|\n/);
      for (const s of sentences) {
        const clean = s.trim();
        if (!clean) continue;
        if (clean.length <= safeMax) {
          units.push(clean);
        } else {
          // Corte seguro para líneas gigantes sin puntuación
          let start = 0;
          while (start < clean.length) {
            const end = Math.min(clean.length, start + safeMax);
            units.push(clean.slice(start, end).trim());
            if (end >= clean.length) break;
            start = Math.max(start + 1, end - safeOverlap);
          }
        }
      }
    }
  }

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    const candidate = `${current}\n\n${unit}`;
    if (candidate.length <= safeMax) {
      current = candidate;
    } else {
      if (current.trim().length >= 25) chunks.push(current.trim());
      if (safeOverlap > 0) {
        const tail = current.slice(Math.max(0, current.length - safeOverlap)).trim();
        const withOverlap = tail ? `${tail}\n${unit}` : unit;
        current = withOverlap.length <= safeMax ? withOverlap : unit;
      } else {
        current = unit;
      }
    }
  }

  if (current.trim().length >= 25) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Desactiva chunks previos del agente e inserta los fragmentos actualizados
 * de todos los archivos indexados (textStatus === "ok").
 */
export async function syncAgentKnowledgeChunks(
  admin: any,
  params: {
    companyId: string;
    agentId: string;
    files: KnowledgeChunkInput[];
  },
): Promise<{ chunksCount: number }> {
  const { companyId, agentId, files } = params;
  if (!companyId || !agentId) return { chunksCount: 0 };

  const { error: deactErr } = await (admin as any)
    .from("agent_knowledge_chunks")
    .update({ active: false })
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .eq("active", true);

  if (deactErr) {
    throw new Error(`Falha ao desativar chunks antigos: ${deactErr.message}`);
  }

  const validFiles = (Array.isArray(files) ? files : []).filter(
    (f) => f?.textStatus === "ok" && typeof f?.text === "string" && f.text.trim().length >= 25,
  );

  if (!validFiles.length) return { chunksCount: 0 };

  const rows: Array<Record<string, any>> = [];
  for (const file of validFiles) {
    const sourcePath = String(file.path || file.name || "unknown");
    const sourceName = String(file.name || file.path || "documento");
    const pieces = chunkKnowledgeText(String(file.text || ""), 900, 120);
    pieces.forEach((content, idx) => {
      rows.push({
        company_id: companyId,
        agent_id: agentId,
        source_path: sourcePath,
        source_name: sourceName,
        chunk_index: idx,
        content,
        active: true,
        valid_until: file.validUntil || null,
      });
    });
  }

  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: insErr } = await (admin as any)
      .from("agent_knowledge_chunks")
      .insert(batch);
    if (insErr) {
      throw new Error(`Falha ao inserir chunks RAG: ${insErr.message}`);
    }
  }

  return { chunksCount: rows.length };
}

/**
 * Busca fragmentos relevantes para la consulta actual usando RAG Nivel 1 (tsvector + pg_trgm),
 * con fallback seguro acotado por palabras clave dentro del mismo company_id y agent_id.
 */
export async function retrieveKnowledgeChunks(
  admin: any,
  params: {
    companyId: string;
    agentId: string;
    query: string;
    limit?: number;
  },
): Promise<RetrievedKnowledgeChunk[]> {
  const { companyId, agentId, query } = params;
  const limit = Math.max(1, Math.min(20, Number(params.limit ?? 5)));
  const cleanQuery = String(query || "").trim().slice(0, 500);
  if (!companyId || !agentId || !cleanQuery) return [];

  try {
    const { data, error } = await (admin as any).rpc("search_agent_knowledge_chunks", {
      _company_id: companyId,
      _agent_id: agentId,
      _query: cleanQuery,
      _limit: limit,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r: any) => ({
        id: String(r.id),
        source_name: String(r.source_name || "documento"),
        source_path: String(r.source_path || ""),
        chunk_index: Number(r.chunk_index ?? 0),
        content: String(r.content || ""),
        score: Number(r.score ?? 0),
      }));
    }
  } catch (rpcErr: any) {
    console.warn("[knowledge-rag] RPC search fallback:", rpcErr?.message);
  }

  // Fallback seguro acotado por palabras clave dentro del mismo company_id + agent_id
  try {
    const keywords = cleanQuery
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 5);

    if (!keywords.length) return [];

    const nowIso = new Date().toISOString();
    const orIlike = keywords.map((kw) => `content.ilike.%${kw.replace(/[%_]/g, "")}%`).join(",");

    const { data: fallbackRows } = await (admin as any)
      .from("agent_knowledge_chunks")
      .select("id, source_name, source_path, chunk_index, content")
      .eq("company_id", companyId)
      .eq("agent_id", agentId)
      .eq("active", true)
      .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
      .or(orIlike)
      .limit(limit);

    if (!Array.isArray(fallbackRows) || !fallbackRows.length) return [];
    return fallbackRows.map((r: any) => ({
      id: String(r.id),
      source_name: String(r.source_name || "documento"),
      source_path: String(r.source_path || ""),
      chunk_index: Number(r.chunk_index ?? 0),
      content: String(r.content || ""),
      score: 0.1,
    }));
  } catch {
    return [];
  }
}
