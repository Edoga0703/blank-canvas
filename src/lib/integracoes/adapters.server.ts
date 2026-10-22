import { normalizePhone } from "../br-phone";
/**
 * Server-only: adaptadores das integrações por chave.
 * Cada serviço expõe apenas o que sabe fazer; o resto do sistema é genérico.
 */

export type Campos = Record<string, string>;

export type ContatoExterno = { nome: string | null; numero: string | null; email: string | null };
export type PedidoExterno = {
  id: string;
  nome: string;
  numero: string | null;
  valorCents: number;
  situacao: string;
  data: string;
};
export type VendaResumo = {
  contato_nome: string | null;
  contato_numero: string | null;
  descricao: string | null;
  item_nome?: string | null;
  valor_cents: number;
};
export type ContatoFunil = {
  nome: string | null;
  numero: string | null;
  email: string | null;
  etapa: string | null;
};

export type Adapter = {
  validar: (c: Campos) => Promise<void>;
  importarClientes?: (c: Campos, pagina: number) => Promise<ContatoExterno[]>;
  importarPedidos?: (c: Campos, pagina: number) => Promise<PedidoExterno[]>;
  criarVenda?: (c: Campos, v: VendaResumo) => Promise<{ referencia: string; link?: string }>;
  enviarContato?: (c: Campos, ct: ContatoFunil) => Promise<void>;
  notificar?: (c: Campos, texto: string, payload: any) => Promise<void>;
};

// ---------------- helpers ----------------

async function req(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`O serviço respondeu ${res.status}: ${txt.slice(0, 220)}`);
  }
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function json(body: any): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function form(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  };
}

export function normalizaNumero(raw: unknown): string | null {
  const n = normalizePhone(raw);
  if (!n || n.length < 9) return null;
  return n;
}

function reais(cents: number) {
  return Math.max(0, Number(cents) || 0) / 100;
}

function hoje(dias = 3) {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function notificador(monta: (texto: string, payload: any) => any): Adapter {
  return {
    validar: async (c) => {
      const url = String(c["url"] ?? "").trim();
      if (!/^https:\/\/\S+$/.test(url)) throw new Error("Informe uma URL https válida do webhook.");
    },
    notificar: async (c, texto, payload) => {
      await req(String(c["url"]), json(monta(texto, payload)));
    },
  };
}

// ---------------- avisos para a equipe ----------------

const slack = notificador((texto) => ({ text: texto }));
const teams = notificador((texto) => ({
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  summary: "Metrix CRM",
  themeColor: "0B22FE",
  title: "Metrix CRM",
  text: texto,
}));
const automacao = notificador((texto, payload) => ({
  origem: "Metrix CRM",
  mensagem: texto,
  ...payload,
}));

// ---------------- Bling ----------------

const bling: Adapter = {
  validar: async (c) => {
    await req("https://api.bling.com.br/Api/v3/contatos?pagina=1&limite=1", {
      headers: { authorization: `Bearer ${c["token"]}`, accept: "application/json" },
    });
  },
  importarClientes: async (c, pagina) => {
    const r = await req(`https://api.bling.com.br/Api/v3/contatos?pagina=${pagina}&limite=100`, {
      headers: { authorization: `Bearer ${c["token"]}`, accept: "application/json" },
    });
    return (r?.data ?? []).map((x: any) => ({
      nome: x?.nome ?? null,
      numero: normalizaNumero(x?.celular || x?.telefone),
      email: x?.email ?? null,
    }));
  },
  criarVenda: async (c, v) => {
    const r = await req("https://api.bling.com.br/Api/v3/pedidos/vendas", {
      ...json({
        contato: { nome: v.contato_nome || "Cliente Metrix" },
        itens: [
          {
            descricao: (v.item_nome || v.descricao || "Venda Metrix CRM").slice(0, 120),
            quantidade: 1,
            valor: reais(v.valor_cents),
          },
        ],
        observacoes: "Pedido gerado pelo Metrix CRM",
      }),
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${c["token"]}`,
      },
    });
    return { referencia: String(r?.data?.id ?? r?.data?.numero ?? "") };
  },
};

// ---------------- Omie ----------------

async function omieCall(c: Campos, rota: string, call: string, param: any) {
  return await req(`https://app.omie.com.br/api/v1/${rota}/`, {
    ...json({ call, app_key: c["app_key"], app_secret: c["app_secret"], param: [param] }),
  });
}

const omie: Adapter = {
  validar: async (c) => {
    await omieCall(c, "geral/clientes", "ListarClientes", {
      pagina: 1,
      registros_por_pagina: 1,
      apenas_importado_api: "N",
    });
  },
  importarClientes: async (c, pagina) => {
    const r = await omieCall(c, "geral/clientes", "ListarClientes", {
      pagina,
      registros_por_pagina: 50,
      apenas_importado_api: "N",
    });
    return (r?.clientes_cadastro ?? []).map((x: any) => ({
      nome: x?.razao_social ?? x?.nome_fantasia ?? null,
      numero: normalizaNumero(`${x?.telefone1_ddd ?? ""}${x?.telefone1_numero ?? ""}`),
      email: x?.email ?? null,
    }));
  },
};

// ---------------- Conta Azul ----------------

const contaAzul: Adapter = {
  validar: async (c) => {
    await req("https://api.contaazul.com/v1/customers?size=1", {
      headers: { authorization: `Bearer ${c["token"]}` },
    });
  },
  importarClientes: async (c, pagina) => {
    const r = await req(`https://api.contaazul.com/v1/customers?page=${pagina}&size=100`, {
      headers: { authorization: `Bearer ${c["token"]}` },
    });
    const lista = Array.isArray(r) ? r : (r?.content ?? []);
    return lista.map((x: any) => ({
      nome: x?.name ?? null,
      numero: normalizaNumero(x?.mobile_phone || x?.business_phone),
      email: x?.email ?? null,
    }));
  },
};

// ---------------- Asaas (também usado pelo Pix) ----------------

const ASAAS = "https://api.asaas.com/v3";

function asaasHeaders(key: string) {
  return { access_token: key, accept: "application/json" };
}

async function asaasClienteId(c: Campos, nome: string, numero: string | null) {
  if (numero) {
    const busca = await req(`${ASAAS}/customers?mobilePhone=${encodeURIComponent(numero.slice(2))}`, {
      headers: asaasHeaders(c["api_key"]!),
    });
    const achado = busca?.data?.[0]?.id;
    if (achado) return String(achado);
  }
  const novo = await req(`${ASAAS}/customers`, {
    ...json({ name: nome || "Cliente Metrix", mobilePhone: numero ? numero.slice(2) : undefined }),
    headers: { ...asaasHeaders(c["api_key"]!), "content-type": "application/json" },
  });
  return String(novo?.id ?? "");
}

function asaasAdapter(billingType: "UNDEFINED" | "PIX"): Adapter {
  return {
    validar: async (c) => {
      await req(`${ASAAS}/customers?limit=1`, { headers: asaasHeaders(c["api_key"]!) });
    },
    importarClientes: async (c, pagina) => {
      const r = await req(`${ASAAS}/customers?limit=100&offset=${(pagina - 1) * 100}`, {
        headers: asaasHeaders(c["api_key"]!),
      });
      return (r?.data ?? []).map((x: any) => ({
        nome: x?.name ?? null,
        numero: normalizaNumero(x?.mobilePhone || x?.phone),
        email: x?.email ?? null,
      }));
    },
    criarVenda: async (c, v) => {
      const cliente = await asaasClienteId(c, v.contato_nome ?? "", v.contato_numero ?? null);
      const cobranca = await req(`${ASAAS}/payments`, {
        ...json({
          customer: cliente,
          billingType,
          value: reais(v.valor_cents),
          dueDate: hoje(3),
          description: (v.item_nome || v.descricao || "Venda Metrix CRM").slice(0, 120),
        }),
        headers: { ...asaasHeaders(c["api_key"]!), "content-type": "application/json" },
      });
      return { referencia: String(cobranca?.id ?? ""), link: cobranca?.invoiceUrl ?? undefined };
    },
  };
}

// ---------------- Mercado Pago ----------------

const mercadoPago: Adapter = {
  validar: async (c) => {
    await req("https://api.mercadopago.com/users/me", {
      headers: { authorization: `Bearer ${c["token"]}` },
    });
  },
  criarVenda: async (c, v) => {
    const r = await req("https://api.mercadopago.com/checkout/preferences", {
      ...json({
        items: [
          {
            title: (v.item_nome || v.descricao || "Venda Metrix CRM").slice(0, 120),
            quantity: 1,
            currency_id: "BRL",
            unit_price: reais(v.valor_cents),
          },
        ],
      }),
      headers: { authorization: `Bearer ${c["token"]}`, "content-type": "application/json" },
    });
    return { referencia: String(r?.id ?? ""), link: r?.init_point ?? undefined };
  },
};

// ---------------- Stripe ----------------

const STRIPE = "https://api.stripe.com/v1";

function stripeHeaders(key: string) {
  return { authorization: `Bearer ${key}` };
}

const stripe: Adapter = {
  validar: async (c) => {
    await req(`${STRIPE}/account`, { headers: stripeHeaders(c["api_key"]!) });
  },
  importarClientes: async (c, pagina) => {
    const r = await req(`${STRIPE}/customers?limit=${Math.min(100, pagina * 100)}`, {
      headers: stripeHeaders(c["api_key"]!),
    });
    return (r?.data ?? []).map((x: any) => ({
      nome: x?.name ?? null,
      numero: normalizaNumero(x?.phone),
      email: x?.email ?? null,
    }));
  },
  criarVenda: async (c, v) => {
    const h = { ...stripeHeaders(c["api_key"]!) };
    const cliente = await req(`${STRIPE}/customers`, {
      ...form({ name: v.contato_nome || "Cliente Metrix", phone: v.contato_numero ?? "" }),
      headers: { ...h, "content-type": "application/x-www-form-urlencoded" },
    });
    await req(`${STRIPE}/invoiceitems`, {
      ...form({
        customer: String(cliente?.id ?? ""),
        amount: String(Math.max(0, Math.round(v.valor_cents))),
        currency: "brl",
        description: (v.item_nome || v.descricao || "Venda Metrix CRM").slice(0, 120),
      }),
      headers: { ...h, "content-type": "application/x-www-form-urlencoded" },
    });
    const fatura = await req(`${STRIPE}/invoices`, {
      ...form({ customer: String(cliente?.id ?? ""), collection_method: "send_invoice", days_until_due: "3" }),
      headers: { ...h, "content-type": "application/x-www-form-urlencoded" },
    });
    const final = await req(`${STRIPE}/invoices/${fatura?.id}/finalize`, {
      ...form({}),
      headers: { ...h, "content-type": "application/x-www-form-urlencoded" },
    });
    return { referencia: String(final?.id ?? ""), link: final?.hosted_invoice_url ?? undefined };
  },
};

// ---------------- Nuvemshop ----------------

function nuvemHeaders(c: Campos) {
  return {
    authentication: `bearer ${c["token"]}`,
    "user-agent": "Metrix CRM (contato@metrixcrm.com.br)",
    "content-type": "application/json",
  };
}

const nuvemshop: Adapter = {
  validar: async (c) => {
    await req(`https://api.tiendanube.com/v1/${c["store_id"]}/store`, { headers: nuvemHeaders(c) });
  },
  importarClientes: async (c, pagina) => {
    const r = await req(
      `https://api.tiendanube.com/v1/${c["store_id"]}/customers?page=${pagina}&per_page=50`,
      { headers: nuvemHeaders(c) },
    );
    return (r ?? []).map((x: any) => ({
      nome: x?.name ?? null,
      numero: normalizaNumero(x?.phone),
      email: x?.email ?? null,
    }));
  },
  importarPedidos: async (c, pagina) => {
    const r = await req(
      `https://api.tiendanube.com/v1/${c["store_id"]}/orders?page=${pagina}&per_page=50`,
      { headers: nuvemHeaders(c) },
    );
    return (r ?? []).map((o: any) => ({
      id: String(o?.id ?? ""),
      nome: o?.customer?.name ?? "Cliente Nuvemshop",
      numero: normalizaNumero(o?.customer?.phone),
      valorCents: Math.round((Number(o?.total ?? 0) || 0) * 100),
      situacao: String(o?.status ?? ""),
      data: String(o?.created_at ?? "").slice(0, 10),
    }));
  },
};

// ---------------- Yampi ----------------

function yampiHeaders(c: Campos) {
  return {
    "User-Token": c["user_token"] ?? "",
    "User-Secret-Key": c["secret_key"] ?? "",
    accept: "application/json",
  };
}

const yampi: Adapter = {
  validar: async (c) => {
    await req(`https://api.dooki.com.br/v2/${c["alias"]}/catalog/products?limit=1`, {
      headers: yampiHeaders(c),
    });
  },
  importarClientes: async (c, pagina) => {
    const r = await req(`https://api.dooki.com.br/v2/${c["alias"]}/customers?page=${pagina}&limit=50`, {
      headers: yampiHeaders(c),
    });
    return (r?.data ?? []).map((x: any) => ({
      nome: x?.name ?? null,
      numero: normalizaNumero(x?.phone?.full_number || x?.phone?.number),
      email: x?.email ?? null,
    }));
  },
  importarPedidos: async (c, pagina) => {
    const r = await req(
      `https://api.dooki.com.br/v2/${c["alias"]}/orders?page=${pagina}&limit=50&include=customer`,
      { headers: yampiHeaders(c) },
    );
    return (r?.data ?? []).map((o: any) => ({
      id: String(o?.id ?? ""),
      nome: o?.customer?.data?.name ?? "Cliente Yampi",
      numero: normalizaNumero(o?.customer?.data?.phone?.full_number),
      valorCents: Math.round((Number(o?.value_total ?? 0) || 0) * 100),
      situacao: String(o?.status?.data?.name ?? o?.status_id ?? ""),
      data: String(o?.created_at?.date ?? "").slice(0, 10),
    }));
  },
};

// ---------------- WooCommerce ----------------

function wooUrl(c: Campos, rota: string, extra = "") {
  const base = String(c["url"] ?? "").replace(/\/+$/, "");
  const auth = `consumer_key=${encodeURIComponent(c["ck"] ?? "")}&consumer_secret=${encodeURIComponent(c["cs"] ?? "")}`;
  return `${base}/wp-json/wc/v3/${rota}?${auth}${extra}`;
}

const woocommerce: Adapter = {
  validar: async (c) => {
    if (!/^https?:\/\//.test(String(c["url"] ?? ""))) throw new Error("Informe o endereço completo da loja.");
    await req(wooUrl(c, "system_status"));
  },
  importarClientes: async (c, pagina) => {
    const r = await req(wooUrl(c, "customers", `&per_page=50&page=${pagina}`));
    return (r ?? []).map((x: any) => ({
      nome: [x?.first_name, x?.last_name].filter(Boolean).join(" ") || x?.username || null,
      numero: normalizaNumero(x?.billing?.phone),
      email: x?.email ?? null,
    }));
  },
  importarPedidos: async (c, pagina) => {
    const r = await req(wooUrl(c, "orders", `&per_page=50&page=${pagina}`));
    return (r ?? []).map((o: any) => ({
      id: String(o?.id ?? ""),
      nome: [o?.billing?.first_name, o?.billing?.last_name].filter(Boolean).join(" ") || "Cliente WooCommerce",
      numero: normalizaNumero(o?.billing?.phone),
      valorCents: Math.round((Number(o?.total ?? 0) || 0) * 100),
      situacao: String(o?.status ?? ""),
      data: String(o?.date_created ?? "").slice(0, 10),
    }));
  },
};

// ---------------- RD Station ----------------

const rdStation: Adapter = {
  validar: async (c) => {
    await req("https://api.rd.services/marketing/account_info", {
      headers: { authorization: `Bearer ${c["token"]}` },
    });
  },
  enviarContato: async (c, ct) => {
    if (!ct.email) throw new Error("O RD Station exige e-mail no contato.");
    await req("https://api.rd.services/platform/conversions", {
      ...json({
        event_type: "CONVERSION",
        event_family: "CDP",
        payload: {
          conversion_identifier: "Metrix CRM",
          email: ct.email,
          name: ct.nome ?? undefined,
          mobile_phone: ct.numero ?? undefined,
          cf_etapa_metrix: ct.etapa ?? undefined,
        },
      }),
      headers: { authorization: `Bearer ${c["token"]}`, "content-type": "application/json" },
    });
  },
};

// ---------------- Mailchimp ----------------

function mailchimpBase(key: string) {
  const dc = key.split("-")[1];
  if (!dc) throw new Error("Chave do Mailchimp inválida (falta o sufixo, ex.: -us21).");
  return `https://${dc}.api.mailchimp.com/3.0`;
}

function mailchimpAuth(key: string) {
  return { authorization: `Basic ${btoa(`metrix:${key}`)}`, "content-type": "application/json" };
}

const mailchimp: Adapter = {
  validar: async (c) => {
    await req(`${mailchimpBase(c["api_key"]!)}/ping`, { headers: mailchimpAuth(c["api_key"]!) });
  },
  enviarContato: async (c, ct) => {
    if (!ct.email) throw new Error("O Mailchimp exige e-mail no contato.");
    await req(`${mailchimpBase(c["api_key"]!)}/lists/${c["list_id"]}/members`, {
      ...json({
        email_address: ct.email,
        status: "subscribed",
        merge_fields: { FNAME: ct.nome ?? "", PHONE: ct.numero ?? "" },
      }),
      headers: mailchimpAuth(c["api_key"]!),
    });
  },
};

// ---------------- Notion ----------------

function notionHeaders(c: Campos) {
  return {
    authorization: `Bearer ${c["token"]}`,
    "Notion-Version": "2022-06-28",
    "content-type": "application/json",
  };
}

const notion: Adapter = {
  validar: async (c) => {
    await req("https://api.notion.com/v1/users/me", { headers: notionHeaders(c) });
    await req(`https://api.notion.com/v1/databases/${c["database_id"]}`, { headers: notionHeaders(c) });
  },
  enviarContato: async (c, ct) => {
    const titulo = [ct.nome || "Lead", ct.numero ? `(${ct.numero})` : ""].join(" ").trim();
    await req("https://api.notion.com/v1/pages", {
      ...json({
        parent: { database_id: c["database_id"] },
        properties: { title: { title: [{ text: { content: titulo.slice(0, 180) } }] } },
      }),
      headers: notionHeaders(c),
    });
  },
};

// ---------------- Trello ----------------

const trello: Adapter = {
  validar: async (c) => {
    await req(`https://api.trello.com/1/members/me?key=${c["key"]}&token=${c["token"]}`);
    await req(`https://api.trello.com/1/lists/${c["list_id"]}?key=${c["key"]}&token=${c["token"]}`);
  },
  enviarContato: async (c, ct) => {
    const desc = [ct.numero ? `Telefone: ${ct.numero}` : "", ct.email ? `E-mail: ${ct.email}` : "", ct.etapa ? `Etapa: ${ct.etapa}` : ""]
      .filter(Boolean)
      .join("\n");
    const q = new URLSearchParams({
      key: c["key"] ?? "",
      token: c["token"] ?? "",
      idList: c["list_id"] ?? "",
      name: (ct.nome || ct.numero || "Lead Metrix").slice(0, 180),
      desc,
    });
    await req(`https://api.trello.com/1/cards?${q.toString()}`, { method: "POST" });
  },
};

// ---------------- registro ----------------

export const ADAPTERS: Record<string, Adapter> = {
  slack,
  "microsoft-teams": teams,
  zapier: automacao,
  make: automacao,
  n8n: automacao,
  bling,
  omie,
  "conta-azul": contaAzul,
  asaas: asaasAdapter("UNDEFINED"),
  "pix-efi": asaasAdapter("PIX"),
  "mercado-pago": mercadoPago,
  stripe,
  nuvemshop,
  yampi,
  woocommerce,
  "rd-station": rdStation,
  mailchimp,
  notion,
  trello,
};

export function getAdapter(servico: string): Adapter {
  const a = ADAPTERS[servico];
  if (!a) throw new Error("Integração não disponível.");
  return a;
}
