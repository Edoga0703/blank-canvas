/**
 * Cliente Abacate Pay (server-only). Sem SDK Node — apenas fetch.
 * Docs: https://docs.abacatepay.com
 */

const BASE = "https://api.abacatepay.com/v1";

function apiKey(): string {
  const k = process.env.ABACATEPAY_API_KEY ?? "";
  if (!k) throw new Error("ABACATEPAY_API_KEY não configurada");
  return k;
}

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok || json?.error) {
    throw new Error(
      typeof json?.error === "string" ? json.error : json?.message || `Abacate Pay HTTP ${res.status}`,
    );
  }
  return (json?.data ?? json) as T;
}

export type AbacateCustomer = {
  name?: string | null;
  email?: string | null;
  cellphone?: string | null;
  taxId?: string | null;
};

export type AbacateProduct = {
  externalId: string;
  name: string;
  quantity: number;
  price: number; // centavos
  description?: string;
};

/** PIX direto: retorna QR Code para exibir dentro do sistema. */
export async function createPixQrCode(params: {
  amountCents: number;
  description: string;
  expiresInSeconds?: number;
  customer?: AbacateCustomer;
  metadata?: Record<string, any>;
}) {
  const body: any = {
    amount: params.amountCents,
    expiresIn: params.expiresInSeconds ?? 60 * 60 * 24 * 3,
    description: params.description.slice(0, 140),
  };
  if (params.customer?.email) {
    body.customer = {
      name: params.customer.name || undefined,
      email: params.customer.email,
      cellphone: params.customer.cellphone || undefined,
      taxId: params.customer.taxId || undefined,
    };
  }
  if (params.metadata) body.metadata = params.metadata;

  const data = await call<any>("/pixQrCode/create", { method: "POST", body: JSON.stringify(body) });
  return {
    id: String(data?.id ?? ""),
    brCode: (data?.brCode ?? data?.br_code ?? null) as string | null,
    brCodeBase64: (data?.brCodeBase64 ?? data?.br_code_base64 ?? null) as string | null,
    status: (data?.status ?? "PENDING") as string,
    expiresAt: (data?.expiresAt ?? null) as string | null,
  };
}

export async function checkPixQrCode(id: string) {
  const data = await call<any>(`/pixQrCode/check?id=${encodeURIComponent(id)}`, { method: "GET" });
  return { status: String(data?.status ?? "PENDING"), expiresAt: data?.expiresAt ?? null };
}

/** Checkout hospedado (usado quando o cliente escolhe cartão). */
export async function createBilling(params: {
  products: AbacateProduct[];
  returnUrl: string;
  completionUrl: string;
  customer?: AbacateCustomer;
  methods?: string[];
  frequency?: "ONE_TIME" | "MULTIPLE_PAYMENTS";
  externalId?: string;
}) {
  const attempt = async (methods: string[]) => {
    const body: any = {
      frequency: params.frequency ?? "ONE_TIME",
      methods,
      products: params.products.map((p) => ({
        externalId: p.externalId,
        name: p.name.slice(0, 120),
        quantity: Math.max(1, p.quantity),
        price: p.price,
        ...(p.description ? { description: p.description.slice(0, 140) } : {}),
      })),
      returnUrl: params.returnUrl,
      completionUrl: params.completionUrl,
    };
    if (params.customer?.email) {
      body.customer = {
        name: params.customer.name || undefined,
        email: params.customer.email,
        cellphone: params.customer.cellphone || undefined,
        taxId: params.customer.taxId || undefined,
      };
    }
    if (params.externalId) body.metadata = { externalId: params.externalId };
    return call<any>("/billing/create", { method: "POST", body: JSON.stringify(body) });
  };

  let data: any;
  const methods = params.methods ?? ["PIX"];
  try {
    data = await attempt(methods);
  } catch (e) {
    // Conta sem cartão liberado: cai para PIX para não travar a cobrança.
    if (methods.some((m) => m.toUpperCase() === "CARD")) data = await attempt(["PIX"]);
    else throw e;
  }
  return {
    id: String(data?.id ?? ""),
    url: (data?.url ?? null) as string | null,
    status: (data?.status ?? "PENDING") as string,
  };
}

export async function getBilling(id: string) {
  const data = await call<any>("/billing/list", { method: "GET" });
  const list: any[] = Array.isArray(data) ? data : (data?.billings ?? []);
  const found = list.find((b) => String(b?.id) === id);
  return found ? { id, status: String(found.status ?? "PENDING") } : null;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "PAID" || s === "COMPLETED" || s === "APPROVED";
}
