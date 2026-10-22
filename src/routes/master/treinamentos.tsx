import { createFileRoute as createRoute, Link, useSearch, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brand } from "@/config/brand";
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Video, 
  Layout, 
  Settings, 
  Image as ImageIcon, 
  FolderTree, 
  PlayCircle,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  getMasterTrainingData, 
  saveTrainingCourse, 
  deleteTrainingCourse, 
  saveTrainingCategory, 
  deleteTrainingCategory, 
  saveTrainingBanner, 
  deleteTrainingBanner,
  saveTrainingSettings 
} from "@/lib/master-training.functions";

export const Route = createRoute("/master/treinamentos")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Gestão de Academia` },
      { name: "description", content: "Administre o portal de treinamentos Capi Conversa." }
    ]
  }),
  component: MasterTrainingPage,
});

function MasterTrainingPage() {
  const search = useSearch({ from: "/master/treinamentos" }) as any;
  const view = search?.v || "cursos";
  const fetchData = useServerFn(getMasterTrainingData);
  const saveCourseFn = useServerFn(saveTrainingCourse);
  const deleteCourseFn = useServerFn(deleteTrainingCourse);
  const saveCategoryFn = useServerFn(saveTrainingCategory);
  const deleteCategoryFn = useServerFn(deleteTrainingCategory);
  const saveBannerFn = useServerFn(saveTrainingBanner);
  const deleteBannerFn = useServerFn(deleteTrainingBanner);
  const saveSettingsFn = useServerFn(saveTrainingSettings);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [courseModal, setCourseModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [bannerModal, setBannerModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [savingAction, setSavingAction] = useState(false);

  const reload = async () => {
    try {
      const res = await fetchData();
      setData(res);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, []);

  const handleOpenNew = () => {
    if (view === "cursos") setCourseModal({ open: true, data: { is_published: true } });
    else if (view === "categorias") setCategoryModal({ open: true, data: { order: 0 } });
    else if (view === "banners") setBannerModal({ open: true, data: { is_active: true, sort_order: 0 } });
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este curso?")) return;
    try {
      await deleteCourseFn({ data: { id } });
      toast.success("Curso excluído com sucesso");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir curso");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;
    try {
      await deleteCategoryFn({ data: { id } });
      toast.success("Categoria excluída com sucesso");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir categoria");
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este banner?")) return;
    try {
      await deleteBannerFn({ data: { id } });
      toast.success("Banner excluído com sucesso");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir banner");
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando portal...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">Academia: {view}</h1>
          <p className="text-sm text-muted-foreground">Gerencie o conteúdo e organização dos treinamentos.</p>
        </div>
        {view !== "ajustes" && view !== "conteudo" && (
          <Button onClick={handleOpenNew} className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">
            <Plus className="size-4 mr-2" /> Novo {view === 'cursos' ? 'Curso' : view === 'categorias' ? 'Categoria' : 'Banner'}
          </Button>
        )}
      </div>

      {view === "cursos" && (
        <MasterCoursesList 
          courses={data?.courses || []} 
          onEdit={(c) => setCourseModal({ open: true, data: c })}
          onDelete={handleDeleteCourse}
        />
      )}
      {view === "categorias" && (
        <MasterCategoriesList 
          categories={data?.categories || []} 
          onEdit={(cat) => setCategoryModal({ open: true, data: cat })}
          onDelete={handleDeleteCategory}
        />
      )}
      {view === "banners" && (
        <MasterBannersList 
          banners={data?.banners || []} 
          onEdit={(b) => setBannerModal({ open: true, data: b })}
          onDelete={handleDeleteBanner}
        />
      )}
      {view === "conteudo" && <div className="p-12 text-center border-2 border-dashed rounded-xl">Selecione um curso para gerenciar módulos e aulas.</div>}
      {view === "ajustes" && <MasterTrainingSettings onSave={saveSettingsFn} />}

      {/* Dialog Curso */}
      <Dialog open={courseModal.open} onOpenChange={(o) => setCourseModal({ open: o })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{courseModal.data?.id ? "Editar Curso" : "Novo Curso"}</DialogTitle>
            <DialogDescription>Preencha os detalhes do treinamento para seus usuários.</DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setSavingAction(true);
            try {
              await saveCourseFn({
                data: {
                  id: courseModal.data?.id,
                  title: String(form.get("title") || ""),
                  description: String(form.get("description") || ""),
                  instructor: String(form.get("instructor") || "Capi Conversa"),
                  thumbnail: String(form.get("thumbnail") || ""),
                  category_id: String(form.get("category_id") || "") || undefined,
                  is_published: form.get("is_published") === "on",
                }
              });
              toast.success("Curso salvo com sucesso!");
              setCourseModal({ open: false });
              await reload();
            } catch (err: any) {
              toast.error(err?.message || "Erro ao salvar curso");
            } finally {
              setSavingAction(false);
            }
          }} className="space-y-4 pt-2">
            <div>
              <Label>Título do Curso</Label>
              <Input name="title" defaultValue={courseModal.data?.title || ""} required />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea name="description" defaultValue={courseModal.data?.description || ""} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Instrutor</Label>
                <Input name="instructor" defaultValue={courseModal.data?.instructor || "Capi Conversa"} />
              </div>
              <div>
                <Label>Categoria</Label>
                <select name="category_id" defaultValue={courseModal.data?.category_id || ""} className="w-full border rounded-md h-9 px-3 text-sm">
                  <option value="">Sem Categoria</option>
                  {(data?.categories || []).map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>URL da Capa (Thumbnail)</Label>
              <Input name="thumbnail" defaultValue={courseModal.data?.thumbnail || ""} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" name="is_published" id="is_published" defaultChecked={courseModal.data?.is_published ?? true} />
              <Label htmlFor="is_published" className="cursor-pointer">Publicado na Academia</Label>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setCourseModal({ open: false })}>Cancelar</Button>
              <Button type="submit" disabled={savingAction} className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">
                {savingAction && <Loader2 className="size-4 animate-spin mr-2" />} Salvar Curso
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Categoria */}
      <Dialog open={categoryModal.open} onOpenChange={(o) => setCategoryModal({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{categoryModal.data?.id ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setSavingAction(true);
            try {
              await saveCategoryFn({
                data: {
                  id: categoryModal.data?.id,
                  name: String(form.get("name") || ""),
                  order: Number(form.get("order") || 0),
                }
              });
              toast.success("Categoria salva!");
              setCategoryModal({ open: false });
              await reload();
            } catch (err: any) {
              toast.error(err?.message || "Erro ao salvar categoria");
            } finally {
              setSavingAction(false);
            }
          }} className="space-y-4 pt-2">
            <div>
              <Label>Nome da Categoria</Label>
              <Input name="name" defaultValue={categoryModal.data?.name || ""} required />
            </div>
            <div>
              <Label>Ordem de Exibição</Label>
              <Input type="number" name="order" defaultValue={categoryModal.data?.order ?? 0} />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setCategoryModal({ open: false })}>Cancelar</Button>
              <Button type="submit" disabled={savingAction} className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">
                Salvar Categoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Banner */}
      <Dialog open={bannerModal.open} onOpenChange={(o) => setBannerModal({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bannerModal.data?.id ? "Editar Banner" : "Novo Banner"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setSavingAction(true);
            try {
              await saveBannerFn({
                data: {
                  id: bannerModal.data?.id,
                  image_url: String(form.get("image_url") || ""),
                  link_url: String(form.get("link_url") || "") || undefined,
                  sort_order: Number(form.get("sort_order") || 0),
                  is_active: form.get("is_active") === "on",
                }
              });
              toast.success("Banner salvo!");
              setBannerModal({ open: false });
              await reload();
            } catch (err: any) {
              toast.error(err?.message || "Erro ao salvar banner");
            } finally {
              setSavingAction(false);
            }
          }} className="space-y-4 pt-2">
            <div>
              <Label>URL da Imagem</Label>
              <Input name="image_url" defaultValue={bannerModal.data?.image_url || ""} required placeholder="https://..." />
            </div>
            <div>
              <Label>Link de Destino</Label>
              <Input name="link_url" defaultValue={bannerModal.data?.link_url || ""} placeholder="https://..." />
            </div>
            <div>
              <Label>Ordem de Exibição</Label>
              <Input type="number" name="sort_order" defaultValue={bannerModal.data?.sort_order ?? 0} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" name="is_active" id="is_active" defaultChecked={bannerModal.data?.is_active ?? true} />
              <Label htmlFor="is_active" className="cursor-pointer">Banner Ativo</Label>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setBannerModal({ open: false })}>Cancelar</Button>
              <Button type="submit" disabled={savingAction} className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">
                Salvar Banner
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MasterCoursesList({ courses, onEdit, onDelete }: { courses: any[]; onEdit: (c: any) => void; onDelete: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {courses.map((course) => (
        <Card key={course.id} className="overflow-hidden border-[color:var(--hairline)]">
          <div className="aspect-video relative group bg-muted">
            {course.thumbnail && <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <PlayCircle className="size-10 text-white" />
            </div>
            {!course.is_published && (
              <Badge className="absolute top-2 left-2 bg-yellow-500 text-white border-none">Rascunho</Badge>
            )}
          </div>
          <CardHeader className="p-4 pb-2">
            <Badge variant="outline" className="w-fit text-[10px] mb-1">{course.category?.name || 'Sem Categoria'}</Badge>
            <CardTitle className="text-lg">{course.title}</CardTitle>
            <CardDescription className="text-xs line-clamp-1">{course.instructor || 'Capi Conversa'}</CardDescription>
          </CardHeader>
          <CardFooter className="p-4 pt-2 flex gap-2">
            <Button onClick={() => onEdit(course)} variant="outline" size="sm" className="flex-1 h-8 text-xs cursor-pointer">
              <Edit2 className="size-3 mr-1.5" /> Editar
            </Button>
            <Button onClick={() => onDelete(course.id)} variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive cursor-pointer hover:bg-red-50">
              <Trash2 className="size-3" />
            </Button>
          </CardFooter>
        </Card>
      ))}
      {courses.length === 0 && (
        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
          Nenhum curso cadastrado ainda. Clique em "Novo Curso" para começar.
        </div>
      )}
    </div>
  );
}

function MasterCategoriesList({ categories, onEdit, onDelete }: { categories: any[]; onEdit: (cat: any) => void; onDelete: (id: string) => void }) {
  return (
    <Card className="border-[color:var(--hairline)]">
      <CardContent className="p-0">
        <div className="divide-y border-[color:var(--hairline)]">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <FolderTree className="size-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-sm">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.courses?.length || 0} Cursos vinculados</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => onEdit(cat)} variant="ghost" size="icon" className="size-8 cursor-pointer"><Edit2 className="size-3" /></Button>
                <Button onClick={() => onDelete(cat.id)} variant="ghost" size="icon" className="size-8 text-destructive cursor-pointer hover:bg-red-50"><Trash2 className="size-3" /></Button>
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">Nenhuma categoria encontrada.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MasterBannersList({ banners, onEdit, onDelete }: { banners: any[]; onEdit: (b: any) => void; onDelete: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {banners.map((banner) => (
        <Card key={banner.id} className="overflow-hidden border-[color:var(--hairline)]">
          <div className="aspect-[21/9] bg-muted relative">
            <img src={banner.image_url} className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2">
              <Badge className={banner.is_active ? "bg-emerald-500" : "bg-red-500"}>
                {banner.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>
          <CardFooter className="p-3 flex justify-between items-center bg-muted/30">
            <span className="text-xs text-muted-foreground">Ordem: {banner.sort_order}</span>
            <div className="flex gap-2">
              <Button onClick={() => onEdit(banner)} variant="ghost" size="icon" className="size-8 cursor-pointer"><Edit2 className="size-3" /></Button>
              <Button onClick={() => onDelete(banner.id)} variant="ghost" size="icon" className="size-8 text-destructive cursor-pointer hover:bg-red-50"><Trash2 className="size-3" /></Button>
            </div>
          </CardFooter>
        </Card>
      ))}
      {banners.length === 0 && (
        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
          Nenhum banner cadastrado.
        </div>
      )}
    </div>
  );
}

function MasterTrainingSettings({ onSave }: { onSave: (arg: any) => Promise<any> }) {
  const [color, setColor] = useState("#0B22FE");
  const [immersive, setImmersive] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ data: { accent_color: color, immersive_mode: immersive } });
      toast.success("Preferências da Academia salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-[color:var(--hairline)]">
      <CardHeader>
        <CardTitle>Ajustes da Academia</CardTitle>
        <CardDescription>Configurações visuais e de comportamento do portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cor de Destaque (Neon)</label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full cursor-pointer" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Modo Imersivo (Auto-hide UI)</label>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={immersive} onChange={(e) => setImmersive(e.target.checked)} className="size-4 cursor-pointer" id="immersive" />
              <label htmlFor="immersive" className="text-sm cursor-pointer">Ativar por padrão</label>
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#0B22FE] hover:bg-[#0B22FE]/90 cursor-pointer">
          {saving && <Loader2 className="size-4 animate-spin mr-2" />} Salvar Preferências
        </Button>
      </CardContent>
    </Card>
  );
}
