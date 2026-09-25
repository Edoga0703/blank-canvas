/** Helpers server-only da integração Olist ERP (Tiny). */

const API = "https://api.tiny.com.br/api2";

export async function olistCall(
  endpoint: string,
  token: string,
  params: Record<string, string>,
) {
  const body = new URLSearchParams({ token, formato: "json", ...params });
  const res = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Olist respondeu ${res.status}.`);
  const json: any = await res.json().catch(() => null);
  const retorno = json?.retorno;
  if (!retorno) throw new Error("Resposta inválida da Olist.");
  if (retorno.status === "Erro") {
    const msg =
      retorno.erros?.[0]?.erro ??
      retorno.registros?.[0]?.registro?.erros?.[0]?.erro ??
      retorno.codigo_erro ??
      "Erro na Olist";
    throw new Error(String(msg));
  }
  return retorno;
}

export function normalizaNumero(raw: string): string | null {
  let n = String(raw ?? "").replace(/\D/g, "").slice(0, 15);
  if (n.length === 10 || n.length === 11) n = "55" + n;
  if (n.length < 12) return null;
  return n;
}

/** Lê token + preferências da empresa. Retorna null se não conectado. */
export async function getOlistConfig(supabase: any, cid: string) {
  const { data } = await supabase
    .from("olist_integration")
    .select("token, conectado, auto_pedido")
    .eq("company_id", cid)
    .maybeSingle();
  if (!data?.token || !data.conectado) return null;
  return {
    token: String(data.token),
    autoPedido: data.auto_pedido !== false,
  };
}

/** Cria o pedido de venda na Olist a partir de uma venda registrada na Metrix. */
export async function criarPedidoOlist(
  token: string,
  venda: {
    contato_nome: string;
    contato_numero: string;
    descricao?: string | null;
    valor_cents: number;
    item_nome?: string | null;
    sku?: string | null;
  },
) {
  const valor = Math.max(0, Number(venda.valor_cents) || 0) / 100;
  const descricao =
    (venda.item_nome || venda.descricao || "Venda Metrix CRM").slice(0, 120);

  const pedido = {
    pedido: {
      cliente: {
        nome: venda.contato_nome?.slice(0, 120) || "Cliente Metrix",
        tipo_pessoa: "F",
        fone: venda.contato_numero ?? "",
      },
      itens: [
        {
          item: {
            codigo: venda.sku || "METRIX",
            descricao,
            unidade: "UN",
            quantidade: 1,
            valor_unitario: valor,
          },
        },
      ],
      obs: "Pedido gerado automaticamente pelo Metrix CRM",
    },
  };

  const retorno = await olistCall("pedido.incluir.php", token, {
    pedido: JSON.stringify(pedido),
  });
  const reg = retorno?.registros?.registro ?? retorno?.registros?.[0]?.registro;
  return {
    id: String(reg?.id ?? ""),
    numero: String(reg?.numero ?? ""),
  };
}

/** Busca os pedidos de um cliente na Olist pelo nome. */
export async function buscarPedidosPorCliente(token: string, nome: string) {
  const retorno = await olistCall("pedidos.pesquisa.php", token, {
    nomeCliente: nome,
  });
  const lista: any[] = retorno?.pedidos ?? [];
  return lista.map((p) => p?.pedido ?? p);
}

/** Detalhe de um pedido (inclui rastreamento quando disponível). */
export async function obterPedido(token: string, id: string) {
  const retorno = await olistCall("pedido.obter.php", token, { id });
  return retorno?.pedido ?? null;
}
