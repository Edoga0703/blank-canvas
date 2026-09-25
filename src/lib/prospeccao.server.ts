// Motores de rastreamento de empresas do módulo de Prospecção (uso interno).
const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type EmpresaEncontrada = {
  fonte: string;
  nome: string;
  telefone: string | null;
  site: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  categoria: string | null;
  rating: number | null;
  avaliacoes: number | null;
  place_id: string | null;
  cnpj?: string | null;
  email?: string | null;
  dados: Record<string, unknown>;
};

function somenteDigitos(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Normaliza telefone brasileiro para DDI 55 + DDD + número. */
export function telefoneBr(raw: unknown): string | null {
  let n = somenteDigitos(raw);
  if (!n) return null;
  if (n.startsWith("0")) n = n.replace(/^0+/, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  if (n.length < 12 || n.length > 13) return null;
  return n;
}

function cidadeUf(endereco: string | null): { cidade: string | null; uf: string | null } {
  if (!endereco) return { cidade: null, uf: null };
  const m = endereco.match(/,\s*([^,\-]+)\s*-\s*([A-Z]{2})\b/);
  if (!m) return { cidade: null, uf: null };
  return { cidade: (m[1] ?? "").trim() || null, uf: m[2] ?? null };
}

async function chamarPlaces(path: string, body: unknown, fieldMask: string) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !conn) throw new Error("Conexão com o Google Maps não está configurada.");

  const r = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": conn,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 403) throw new Error("O Google recusou a busca (403). Verifique as permissões da chave.");
    throw new Error(`Busca no Google falhou [${r.status}]: ${txt.slice(0, 300)}`);
  }
  return (await r.json()) as any;
}

const MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

/** Converte um endereço/bairro/cidade em coordenadas (Geocoding via gateway). */
export async function geocodificar(local: string): Promise<{ lat: number; lng: number } | null> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !conn) throw new Error("Conexão com o Google Maps não está configurada.");

  const r = await fetch(
    `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(local)}&region=br&language=pt-BR`,
    { headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as any;
  const loc = j?.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: Number(loc.lat), lng: Number(loc.lng) };
}

/** Busca empresas no Google Maps (Places API New) — até 3 páginas (60 resultados). */
export async function buscarGoogle(
  termo: string,
  paginas = 2,
  centro?: { lat: number; lng: number; raioKm: number } | null,
): Promise<EmpresaEncontrada[]> {
  const out: EmpresaEncontrada[] = [];
  let token: string | undefined;
  const max = Math.min(Math.max(paginas, 1), 3);

  for (let i = 0; i < max; i++) {
    const body: Record<string, unknown> = {
      textQuery: termo,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
    };
    if (centro) {
      body["locationBias"] = {
        circle: {
          center: { latitude: centro.lat, longitude: centro.lng },
          radius: Math.min(Math.max(centro.raioKm, 1), 50) * 1000,
        },
      };
    }
    if (token) body["pageToken"] = token;

    const json = await chamarPlaces("/places/v1/places:searchText", body, MASK);
    const places: any[] = json?.places ?? [];
    for (const p of places) {
      const endereco = p?.formattedAddress ?? null;
      const { cidade, uf } = cidadeUf(endereco);
      out.push({
        fonte: "google",
        nome: p?.displayName?.text ?? "Sem nome",
        telefone: telefoneBr(p?.internationalPhoneNumber ?? p?.nationalPhoneNumber),
        site: p?.websiteUri ?? null,
        endereco,
        cidade,
        uf,
        categoria: p?.primaryTypeDisplayName?.text ?? null,
        rating: typeof p?.rating === "number" ? p.rating : null,
        avaliacoes: typeof p?.userRatingCount === "number" ? p.userRatingCount : null,
        place_id: p?.id ?? null,
        dados: { status: p?.businessStatus ?? null, telefone_exibicao: p?.nationalPhoneNumber ?? null },
      });
    }
    token = json?.nextPageToken;
    if (!token) break;
  }
  return out;
}

/** Consulta pública da Receita Federal (BrasilAPI) por CNPJ. */
export async function consultarCnpj(cnpjRaw: string): Promise<EmpresaEncontrada> {
  const cnpj = somenteDigitos(cnpjRaw);
  if (cnpj.length !== 14) throw new Error(`CNPJ inválido: ${cnpjRaw}`);

  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!r.ok) throw new Error(`CNPJ ${cnpj} não encontrado na base pública.`);
  const d = (await r.json()) as any;

  const ddd = somenteDigitos(d?.ddd_telefone_1) || somenteDigitos(d?.ddd_telefone_2);
  const endereco = [
    [d?.descricao_tipo_de_logradouro, d?.logradouro].filter(Boolean).join(" "),
    d?.numero,
    d?.bairro,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    fonte: "cnpj",
    nome: d?.nome_fantasia || d?.razao_social || cnpj,
    telefone: telefoneBr(ddd),
    site: null,
    email: d?.email ?? null,
    endereco: endereco || null,
    cidade: d?.municipio ?? null,
    uf: d?.uf ?? null,
    categoria: d?.cnae_fiscal_descricao ?? null,
    rating: null,
    avaliacoes: null,
    place_id: null,
    cnpj,
    dados: {
      razao_social: d?.razao_social ?? null,
      porte: d?.porte ?? null,
      abertura: d?.data_inicio_atividade ?? null,
      situacao: d?.descricao_situacao_cadastral ?? null,
      capital_social: d?.capital_social ?? null,
      socios: (d?.qsa ?? []).map((s: any) => s?.nome_socio).filter(Boolean).slice(0, 5),
    },
  };
}

// ===================== Análise de site (Fábrica de Site / Metrix) =====================

export type AnaliseSite = {
  /** ativo | lento | problema | desatualizado | offline | sem_site */
  status: string;
  /** 0 a 10 — qualidade geral do site */
  nota: number;
  diagnostico: string;
  oportunidades: string;
  dados: Record<string, unknown>;
};

function normalizaUrl(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const u = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

/** Baixa o site e extrai sinais técnicos objetivos. */
async function coletarSite(url: string) {
  const inicio = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MetrixBot/1.0)" },
    });
    const html = (await r.text()).slice(0, 120000);
    const ms = Date.now() - inicio;
    const baixo = html.toLowerCase();
    const anos = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}(20\d{2})/gi)].map((m) =>
      Number(m[1]),
    );
    return {
      alcancavel: true,
      http: r.status,
      url_final: r.url,
      https: r.url.startsWith("https://"),
      tempo_ms: ms,
      tamanho: html.length,
      titulo: (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? "").trim(),
      descricao: (
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]{0,300}?)["']/i)?.[1] ??
        ""
      ).trim(),
      gerador: (
        html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{0,120})["']/i)?.[1] ?? ""
      ).trim(),
      responsivo: /name=["']viewport["']/i.test(html),
      tem_flash: /\.swf\b|shockwave-flash/i.test(baixo),
      jquery_antigo: /jquery[-.](1|2)\.\d+/i.test(baixo),
      tem_whatsapp: /wa\.me|api\.whatsapp\.com/i.test(baixo),
      ano_rodape: anos.length ? Math.max(...anos) : null,
      em_construcao: /em\s*constru[cç][aã]o|coming\s*soon|under\s*construction|site\s*suspenso|account\s*suspended|domain\s*(is\s*)?for\s*sale/i.test(
        baixo,
      ),
      trecho: html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 2500),
    };
  } catch (e) {
    return {
      alcancavel: false,
      erro: (e as Error).name === "AbortError" ? "tempo esgotado (15s)" : (e as Error).message,
      tempo_ms: Date.now() - inicio,
    } as Record<string, unknown>;
  } finally {
    clearTimeout(t);
  }
}

/** Analisa o site de uma empresa: acessa a URL e classifica com IA. */
export async function analisarSite(
  siteRaw: string | null | undefined,
  nomeEmpresa: string,
): Promise<AnaliseSite> {
  const url = normalizaUrl(siteRaw);
  if (!url) {
    return {
      status: "sem_site",
      nota: 0,
      diagnostico: "Empresa sem site informado no Google.",
      oportunidades: "Oportunidade quente para a Fábrica de Site: criar o primeiro site da empresa.",
      dados: {},
    };
  }

  const sinais = await coletarSite(url);

  if (!sinais["alcancavel"]) {
    return {
      status: "offline",
      nota: 0,
      diagnostico: `O site ${url} não abriu (${sinais["erro"]}).`,
      oportunidades: "Site fora do ar — abordagem direta para refazer ou hospedar o site.",
      dados: { url, ...sinais },
    };
  }

  const { lovableAiChat } = await import("@/lib/lovable-ai.server");
  const prompt = `Você é um especialista em sites. Analise os sinais técnicos coletados do site da empresa "${nomeEmpresa}" (${url}) e classifique.

SINAIS:
${JSON.stringify(sinais, null, 1)}

Responda SOMENTE um JSON:
{"status":"ativo|lento|problema|desatualizado","nota":0-10,"diagnostico":"até 300 caracteres em PT-BR","oportunidades":"até 300 caracteres em PT-BR com o argumento de venda de um site novo"}

Regras: "problema" para erro HTTP (4xx/5xx), página em construção/suspensa ou conteúdo quebrado; "desatualizado" para site sem responsividade, Flash, jQuery antigo, visual/rodapé antigo (2 anos ou mais); "lento" quando o carregamento passa de 6000ms; "ativo" quando está saudável e moderno. Nota alta = site bom.`;

  try {
    const resp = await lovableAiChat(
      [{ role: "user", content: prompt }],
      "google/gemini-3.8-flash",
    );
    const json = JSON.parse(resp.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const status = ["ativo", "lento", "problema", "desatualizado"].includes(json.status)
      ? json.status
      : "ativo";
    return {
      status,
      nota: Math.min(Math.max(Number(json.nota ?? 5), 0), 10),
      diagnostico: String(json.diagnostico ?? "").slice(0, 400),
      oportunidades: String(json.oportunidades ?? "").slice(0, 400),
      dados: { url, ...sinais },
    };
  } catch (e) {
    // Sem IA disponível, cai para uma classificação por regras.
    const http = Number(sinais["http"] ?? 0);
    const status =
      http >= 400 || sinais["em_construcao"]
        ? "problema"
        : !sinais["responsivo"] || sinais["tem_flash"] || sinais["jquery_antigo"]
          ? "desatualizado"
          : Number(sinais["tempo_ms"] ?? 0) > 6000
            ? "lento"
            : "ativo";
    return {
      status,
      nota: status === "ativo" ? 7 : status === "lento" ? 5 : 3,
      diagnostico: `Análise automática sem IA (${(e as Error).message.slice(0, 80)}).`,
      oportunidades: status === "ativo" ? "" : "Site com pontos fracos — bom alvo para um site novo.",
      dados: { url, ...sinais },
    };
  }
}

/** Coleta o conteúdo do site e as redes sociais divulgadas nele. */
export async function coletarPerfilOnline(siteRaw: string | null | undefined): Promise<{
  url: string | null;
  alcancavel: boolean;
  titulo: string;
  descricao: string;
  trecho: string;
  redes: string[];
}> {
  const url = normalizaUrl(siteRaw);
  if (!url) return { url: null, alcancavel: false, titulo: "", descricao: "", trecho: "", redes: [] };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MetrixBot/1.0)" },
    });
    const html = (await r.text()).slice(0, 150000);
    const redes = [
      ...new Set(
        [...html.matchAll(/https?:\/\/(?:www\.)?(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com)\/[^\s"'<>)]{2,60}/gi)].map(
          (m) => m[0].replace(/[),.]+$/, ""),
        ),
      ),
    ].slice(0, 8);
    return {
      url: r.url,
      alcancavel: r.ok,
      titulo: (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? "").trim(),
      descricao: (
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]{0,300}?)["']/i)?.[1] ?? ""
      ).trim(),
      trecho: html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 3000),
      redes,
    };
  } catch {
    return { url, alcancavel: false, titulo: "", descricao: "", trecho: "", redes: [] };
  } finally {
    clearTimeout(t);
  }
}
