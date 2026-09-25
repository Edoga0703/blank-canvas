/** Server-only: conexão Google para Analytics (GA4) e Google Ads. */
import { signState } from "@/lib/google.server";

export type ServicoGoogle = "google-analytics" | "google-ads";

export const ESCOPOS: Record<ServicoGoogle, string> = {
  "google-analytics":
    "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email",
  "google-ads": "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email",
};

export function googleClient() {
  const id = process.env["GOOGLE_OAUTH_CLIENT_ID"] || process.env["GOOGLE_CLIENT_ID"];
  const secret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"] || process.env["GOOGLE_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("Login com Google não configurado no servidor.");
  return { id, secret };
}

export function stateMarketing(companyId: string, servico: ServicoGoogle) {
  const payload = Buffer.from(JSON.stringify({ companyId, servico, t: Date.now() })).toString("base64url");
  return signState(payload);
}

export function lerStateMarketing(state: string): { companyId: string; servico: ServicoGoogle } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  if (stateMarketingSig(payload) !== sig) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!obj?.companyId || !obj?.servico) return null;
    return { companyId: String(obj.companyId), servico: obj.servico as ServicoGoogle };
  } catch {
    return null;
  }
}

function stateMarketingSig(payload: string) {
  return signState(payload).split(".")[1]!;
}

type Conta = {
  refresh_token?: string;
  access_token?: string;
  expiry?: string;
  email?: string;
  property_id?: string;
  property_nome?: string;
  customer_id?: string;
  customer_nome?: string;
  login_customer_id?: string;
};

export async function lerConta(supabase: any, companyId: string, servico: ServicoGoogle) {
  const { data } = await supabase
    .from("integracao_chave")
    .select("extra, conectado, credencial")
    .eq("company_id", companyId)
    .eq("servico", servico)
    .maybeSingle();
  if (!data?.conectado) return null;
  return (data.extra ?? {}) as Conta;
}

async function salvarConta(supabase: any, companyId: string, servico: ServicoGoogle, extra: Conta) {
  await supabase.from("integracao_chave").upsert(
    {
      company_id: companyId,
      servico,
      credencial: extra.email ?? "google",
      extra,
      conectado: true,
    },
    { onConflict: "company_id,servico" },
  );
}

/** Token válido (renova com o refresh token quando necessário). */
export async function tokenValido(supabase: any, companyId: string, servico: ServicoGoogle) {
  const conta = await lerConta(supabase, companyId, servico);
  if (!conta?.refresh_token && !conta?.access_token) return null;

  const vencido = !conta.expiry || new Date(conta.expiry).getTime() < Date.now() + 60_000;
  if (!vencido && conta.access_token) return { token: conta.access_token, conta };

  if (!conta.refresh_token) return null;
  const { id, secret } = googleClient();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: conta.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tok = await r.json();
  if (!tok?.access_token) return null;
  const novo: Conta = {
    ...conta,
    access_token: tok.access_token,
    expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
  };
  await salvarConta(supabase, companyId, servico, novo);
  return { token: tok.access_token as string, conta: novo };
}

export async function trocarCodigo(code: string, redirectUri: string) {
  const { id, secret } = googleClient();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tok = await r.json();
  if (!tok?.access_token) throw new Error(`Falha na autorização: ${JSON.stringify(tok).slice(0, 200)}`);

  let email: string | null = null;
  try {
    const info = await (
      await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { authorization: `Bearer ${tok.access_token}` },
      })
    ).json();
    email = info?.email ?? null;
  } catch {}

  return {
    access_token: tok.access_token as string,
    refresh_token: (tok.refresh_token ?? null) as string | null,
    expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    email,
  };
}

export async function conectarConta(
  supabase: any,
  companyId: string,
  servico: ServicoGoogle,
  dados: { access_token: string; refresh_token: string | null; expiry: string; email: string | null },
) {
  const anterior = (await lerConta(supabase, companyId, servico)) ?? {};
  await salvarConta(supabase, companyId, servico, {
    ...anterior,
    access_token: dados.access_token,
    refresh_token: dados.refresh_token ?? anterior.refresh_token,
    expiry: dados.expiry,
    email: dados.email ?? anterior.email,
  });
}

export async function atualizarSelecao(
  supabase: any,
  companyId: string,
  servico: ServicoGoogle,
  patch: Partial<Conta>,
) {
  const conta = (await lerConta(supabase, companyId, servico)) ?? {};
  await salvarConta(supabase, companyId, servico, { ...conta, ...patch });
}

// ---------------- Google Analytics (GA4) ----------------

export async function ga4Propriedades(token: string) {
  const r = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? "Não foi possível listar as propriedades.");
  const out: { id: string; nome: string }[] = [];
  for (const conta of j?.accountSummaries ?? []) {
    for (const p of conta?.propertySummaries ?? []) {
      out.push({ id: String(p.property ?? "").replace("properties/", ""), nome: p.displayName ?? "Propriedade" });
    }
  }
  return out;
}

export async function ga4Relatorio(token: string, propertyId: string, dias: number) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${dias}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "conversions" },
      ],
      limit: 10,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? "Não foi possível ler os dados do Analytics.");

  const linhas = (j?.rows ?? []).map((row: any) => ({
    canal: row?.dimensionValues?.[0]?.value ?? "—",
    sessoes: Number(row?.metricValues?.[0]?.value ?? 0),
    usuarios: Number(row?.metricValues?.[1]?.value ?? 0),
    conversoes: Number(row?.metricValues?.[2]?.value ?? 0),
  }));
  const totais = linhas.reduce(
    (a: any, l: any) => ({
      sessoes: a.sessoes + l.sessoes,
      usuarios: a.usuarios + l.usuarios,
      conversoes: a.conversoes + l.conversoes,
    }),
    { sessoes: 0, usuarios: 0, conversoes: 0 },
  );
  return { linhas, totais };
}

// ---------------- Google Ads ----------------

const ADS_API = "https://googleads.googleapis.com/v18";

export function adsDevToken() {
  const t = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];
  if (!t) {
    throw new Error(
      "Falta o token de desenvolvedor do Google Ads. Peça o token na sua conta de administrador do Google Ads e cadastre-o no Metrix.",
    );
  }
  return t;
}

function adsHeaders(token: string, loginCustomerId?: string) {
  const h: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": adsDevToken(),
    "content-type": "application/json",
  };
  if (loginCustomerId) h["login-customer-id"] = loginCustomerId.replace(/\D/g, "");
  return h;
}

export async function adsContas(token: string) {
  const r = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, { headers: adsHeaders(token) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? "Não foi possível listar as contas do Google Ads.");
  return ((j?.resourceNames ?? []) as string[]).map((n) => {
    const id = n.replace("customers/", "");
    return { id, nome: id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") };
  });
}

export async function adsResumo(token: string, customerId: string, dias: number, loginCustomerId?: string) {
  const cid = customerId.replace(/\D/g, "");
  const query = `
    SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks,
           metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date DURING ${dias <= 7 ? "LAST_7_DAYS" : dias <= 14 ? "LAST_14_DAYS" : "LAST_30_DAYS"}
    ORDER BY metrics.cost_micros DESC
    LIMIT 15`;

  const r = await fetch(`${ADS_API}/customers/${cid}/googleAds:search`, {
    method: "POST",
    headers: adsHeaders(token, loginCustomerId),
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) {
    const msg = j?.error?.message ?? j?.[0]?.error?.message ?? "Não foi possível ler os dados do Google Ads.";
    throw new Error(msg);
  }

  const linhas = (j?.results ?? []).map((x: any) => ({
    campanha: x?.campaign?.name ?? "—",
    status: x?.campaign?.status ?? "",
    impressoes: Number(x?.metrics?.impressions ?? 0),
    cliques: Number(x?.metrics?.clicks ?? 0),
    custoCents: Math.round(Number(x?.metrics?.costMicros ?? 0) / 10_000),
    conversoes: Number(x?.metrics?.conversions ?? 0),
  }));
  const totais = linhas.reduce(
    (a: any, l: any) => ({
      impressoes: a.impressoes + l.impressoes,
      cliques: a.cliques + l.cliques,
      custoCents: a.custoCents + l.custoCents,
      conversoes: a.conversoes + l.conversoes,
    }),
    { impressoes: 0, cliques: 0, custoCents: 0, conversoes: 0 },
  );
  return { linhas, totais };
}
