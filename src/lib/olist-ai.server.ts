/**
 * Ferramentas da Olist (Tiny) para o Agente de IA:
 * - busca de produtos no catálogo real
 * - saldo de estoque
 * - criação do pedido de venda ao fechar
 *
 * Tudo best-effort: qualquer falha aqui NUNCA pode derrubar a resposta da IA.
 */
import { olistCall, getOlistConfig } from "@/lib/olist.server";

export interface OlistItemBrief {
  id: string;
  nome: string;
  codigo: string;
  preco: number;
  saldo: number | null;
}

const STOP = new Set([
  "para", "pra", "com", "sem", "uma", "uns", "umas", "dos", "das", "que",
  "tem", "voces", "vocês", "quero", "preciso", "qual", "quanto", "custa",
  "valor", "preco", "preço", "boa", "bom", "dia", "tarde", "noite", "por",
  "favor", "sobre", "the", "and", "olá", "ola", "oi",
]);

/** Extrai os termos mais úteis da mensagem do cliente para buscar no catálogo. */
export function termosDeBusca(texto: string): string[] {
  const limpo = String(texto ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const palavras = limpo
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4 && !STOP.has(p));
  return Array.from(new Set(palavras)).slice(0, 3);
}

/** Busca produtos na Olist por um termo livre. */
export async function buscarProdutosOlist(
  token: string,
  termo: string,
  limite = 8,
): Promise<OlistItemBrief[]> {
  const retorno = await olistCall("produtos.pesquisa.php", token, {
    pesquisa: termo.slice(0, 60),
  });
  const lista: any[] = retorno?.produtos ?? [];
  return lista
    .map((row) => row?.produto ?? row)
    .filter(Boolean)
    .slice(0, limite)
    .map((p: any) => ({
      id: String(p.id ?? ""),
      nome: String(p.nome ?? "").slice(0, 120),
      codigo: String(p.codigo ?? ""),
      preco: Number(p.preco ?? 0) || 0,
      saldo:
        p.saldo === undefined || p.saldo === null ? null : Number(p.saldo) || 0,
    }));
}

/** Saldo em estoque de um produto (retorna null quando a Olist não informa). */
export async function estoqueOlist(
  token: string,
  produtoId: string,
): Promise<number | null> {
  try {
    const retorno = await olistCall("produto.obter.estoque.php", token, {
      id: produtoId,
    });
    const saldo = retorno?.produto?.saldo;
    return saldo === undefined || saldo === null ? null : Number(saldo) || 0;
  } catch {
    return null;
  }
}

/**
 * Monta o bloco de catálogo ao vivo da Olist para o prompt do agente,
 * a partir da última mensagem do cliente. Retorna "" quando não há nada.
 */
export async function blocoCatalogoOlist(
  supabase: any,
  companyId: string,
  mensagemCliente: string,
): Promise<string> {
  try {
    const cfg = await getOlistConfig(supabase, companyId);
    if (!cfg?.token) return "";

    const termos = termosDeBusca(mensagemCliente);
    if (!termos.length) return "";

    const achados = new Map<string, OlistItemBrief>();
    for (const termo of termos) {
      try {
        const itens = await buscarProdutosOlist(cfg.token, termo);
        for (const item of itens) {
          if (item.nome && !achados.has(item.id || item.nome)) {
            achados.set(item.id || item.nome, item);
          }
        }
      } catch {
        /* termo sem resultado: segue */
      }
      if (achados.size >= 10) break;
    }
    if (!achados.size) return "";

    const itens = Array.from(achados.values()).slice(0, 10);

    // Completa o saldo de quem veio sem estoque na busca.
    await Promise.all(
      itens.map(async (item) => {
        if (item.saldo === null && item.id) {
          item.saldo = await estoqueOlist(cfg.token, item.id);
        }
      }),
    );

    const linhas = itens.map((i) => {
      const preco = i.preco > 0 ? ` — R$ ${i.preco.toFixed(2)}` : "";
      const estoque =
        i.saldo === null
          ? ""
          : i.saldo > 0
            ? ` — ${i.saldo} em estoque`
            : " — SEM ESTOQUE";
      const cod = i.codigo ? ` [cod:${i.codigo}]` : "";
      return `• ${i.nome}${preco}${estoque}${cod}`;
    });

    return (
      "CATÁLOGO AO VIVO DO ERP OLIST (preços e estoque reais, consultados agora):\n" +
      linhas.join("\n") +
      "\nUse SOMENTE estes preços e este estoque ao falar destes itens. " +
      "Nunca invente preço, desconto ou disponibilidade. " +
      "Se estiver SEM ESTOQUE, avise o cliente e ofereça alternativa da lista."
    );
  } catch (e: any) {
    console.warn("[olist-ai] falha ao montar catálogo:", e?.message);
    return "";
  }
}

export interface PedidoIaItem {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  codigo?: string | null;
}

/** Cria o pedido de venda na Olist com vários itens. */
export async function criarPedidoIaOlist(
  token: string,
  dados: {
    clienteNome: string;
    clienteFone: string;
    itens: PedidoIaItem[];
    entrega: string;
    pagamento: string;
  },
) {
  const pedido = {
    pedido: {
      cliente: {
        nome: dados.clienteNome.slice(0, 120) || "Cliente Metrix",
        tipo_pessoa: "F",
        fone: dados.clienteFone ?? "",
      },
      itens: dados.itens.map((i) => ({
        item: {
          codigo: i.codigo || "METRIX",
          descricao: i.descricao.slice(0, 120),
          unidade: "UN",
          quantidade: Math.max(1, Number(i.quantidade) || 1),
          valor_unitario: Math.max(0, Number(i.valorUnitario) || 0),
        },
      })),
      obs: `Pedido fechado pelo Agente de IA do Metrix CRM. Entrega: ${dados.entrega}. Pagamento: ${dados.pagamento}.`,
    },
  };

  const retorno = await olistCall("pedido.incluir.php", token, {
    pedido: JSON.stringify(pedido),
  });
  const reg = retorno?.registros?.registro ?? retorno?.registros?.[0]?.registro;
  return { id: String(reg?.id ?? ""), numero: String(reg?.numero ?? "") };
}
