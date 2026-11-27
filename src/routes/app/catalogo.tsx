import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProdutos, saveProduto, deleteProduto, type Produto } from "@/lib/produtos.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search, Loader2, ImageIcon, Images } from "lucide-react";
import { HelpTip } from "@/components/help-tip";
import { ProdutoEditDialog } from "@/components/catalogo/produto-edit-dialog";
import { brand } from "@/config/brand";
import { useLanguage } from "@/lib/i18n/context";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute("/app/catalogo")({
  beforeLoad: ({ context }) => requirePermission(context, "catalogo.manage"),
  head: () => ({ meta: [{ title: `${brand.name} — Catálogo` }] }),
  component: Page,
});

function Page() {
  const { t, formatCurrency } = useLanguage();
  const ctx = Route.useRouteContext() as any;
  const companyId = ctx?.company?.id as string | undefined;
  const list = useServerFn(listProdutos);
  const save = useServerFn(saveProduto);
  const del = useServerFn(deleteProduto);

  const [rows, setRows] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "produto" | "servico">("todos");
  const [editing, setEditing] = useState<Partial<Produto> | null>(null);


  async function reload() {
    setLoading(true);
    try { setRows(await list()); } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = rows.filter((r) =>
      (tipoFiltro === "todos" || (r.tipo ?? "produto") === tipoFiltro) &&
      (!q ||
        r.nome.toLowerCase().includes(q) ||
        (r.descricao || "").toLowerCase().includes(q) ||
        (r.sku || "").toLowerCase().includes(q) ||
        (r.categoria || "").toLowerCase().includes(q))
    );
    const map = new Map<string, Produto[]>();
    for (const r of filtered) {
      const cat = r.categoria || ((r.tipo ?? "produto") === "servico" ? "Serviços" : "Sem categoria");
      const arr = map.get(cat) || [];
      arr.push(r);
      map.set(cat, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, search, tipoFiltro]);


  async function handleDelete(id: string) {
    if (!confirm("Excluir este produto do catálogo?")) return;
    try { await del({ data: { id } }); toast.success("Excluído"); void reload(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight flex items-center gap-2">
            {t("catalog.title", undefined, "Catálogo")} <HelpTip text="Cadastre produtos e serviços com foto, preço e duração. É a fonte única usada pela IA, pelo Comercial e pelos Agendamentos." />
          </h1>
          <p className="text-sm text-muted-foreground">{t("catalog.subtitle", undefined, "Produtos e serviços em um só lugar — usados pela IA, pelo Comercial e pelos Agendamentos.")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ ativo: true, tipo: "servico", agendavel: true, duracao_min: 30 })} className="gap-2">
            <Plus className="size-4" /> {t("catalog.new_service", undefined, "Novo serviço")}
          </Button>
          <Button onClick={() => setEditing({ ativo: true, tipo: "produto" })} className="gap-2">
            <Plus className="size-4" /> {t("catalog.new_product", undefined, "Novo produto")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("catalog.search_placeholder", undefined, "Buscar por nome, SKU, categoria...")} className="pl-9" />
        </div>
        <div className="inline-flex rounded-xl border border-[color:var(--hairline)] p-1 bg-[color:var(--panel)]">
          {([["todos", t("catalog.filter_all", undefined, "Todos")], ["produto", t("catalog.filter_products", undefined, "Produtos")], ["servico", t("catalog.filter_services", undefined, "Serviços")]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTipoFiltro(v)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${tipoFiltro === v ? "bg-[#0B22FE] text-white" : "text-muted-foreground hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>


      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="size-4 animate-spin" /> Carregando...</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-12 text-center text-muted-foreground text-sm">
          {t("catalog.no_products", undefined, "Nenhum produto ainda. Clique em Novo produto para começar.")}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[color:var(--hairline)] bg-[color:var(--panel-2)]">
                <span className="size-2 rounded-full bg-[var(--brand)]" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{cat} · {items.length}</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">

                {items.map((p) => (
                  <Card key={p.id} className={`overflow-hidden group hover:shadow-md transition ${!p.ativo ? "opacity-60" : ""}`}>
                    <div className="aspect-square bg-muted relative">
                      {p.foto_url ? (
                        <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground">
                          <ImageIcon className="size-10" />
                        </div>
                      )}
                      {Array.isArray((p as any).fotos) && (p as any).fotos.length > 1 && (
                        <span className="absolute bottom-2 left-2 text-[10px] font-bold bg-black/75 text-white px-1.5 py-0.5 rounded flex items-center gap-1 shadow backdrop-blur-xs">
                          <Images className="size-3" /> {(p as any).fotos.length}
                        </span>
                      )}
                      {!p.ativo && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase bg-black/70 text-white px-2 py-0.5 rounded">{t("catalog.inactive", undefined, "Inativo")}</span>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <Button size="icon" variant="secondary" className="size-7" onClick={() => setEditing(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="secondary" className="size-7" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="size-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="font-semibold text-sm truncate">{p.nome}</div>
                      <div className="text-[color:var(--brand)] font-bold">{formatCurrency(Number(p.preco) || 0)}</div>
                      {p.descricao && <div className="text-[12px] text-muted-foreground line-clamp-2">{p.descricao}</div>}
                      {p.sku && <div className="text-[10px] text-muted-foreground uppercase tracking-wider">SKU: {p.sku}</div>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProdutoEditDialog
          initial={editing}
          companyId={companyId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
          onSave={save}
        />
      )}
    </div>
  );
}
