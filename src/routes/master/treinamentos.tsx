import { createFileRoute as createRoute, Link, useSearch } from "@tanstack/react-router";

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
  PlayCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getMasterTrainingData } from "@/lib/master-training.functions";

export const Route = createRoute("/master/treinamentos")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Gestão de Academia` },
      { name: "description", content: "Administre o portal de treinamentos Metrix." }
    ]
  }),
  component: MasterTrainingPage,
});

function MasterTrainingPage() {
  const search = useSearch({ from: "/master/treinamentos" }) as any;
  const view = search?.v || "cursos";
  const fetchData = useServerFn(getMasterTrainingData);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchData();
        setData(res);
      } catch (err) {
        toast.error("Erro ao carregar dados de treinamento");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchData]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando portal...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">Academia: {view}</h1>
          <p className="text-sm text-muted-foreground">Gerencie o conteúdo e organização dos treinamentos.</p>
        </div>
        <Button className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">
          <Plus className="size-4 mr-2" /> Novo {view === 'cursos' ? 'Curso' : view === 'categorias' ? 'Categoria' : 'Item'}
        </Button>
      </div>

      {view === "cursos" && <MasterCoursesList courses={data?.courses || []} />}
      {view === "categorias" && <MasterCategoriesList categories={data?.categories || []} />}
      {view === "banners" && <MasterBannersList banners={data?.banners || []} />}
      {view === "conteudo" && <div className="p-12 text-center border-2 border-dashed rounded-xl">Selecione um curso para gerenciar módulos e aulas.</div>}
      {view === "ajustes" && <MasterTrainingSettings />}
    </div>
  );
}

function MasterCoursesList({ courses }: { courses: any[] }) {
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
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs">
              <Edit2 className="size-3 mr-1.5" /> Editar
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive"><Trash2 className="size-3" /></Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function MasterCategoriesList({ categories }: { categories: any[] }) {
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
                <Button variant="ghost" size="icon" className="size-8"><Edit2 className="size-3" /></Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MasterBannersList({ banners }: { banners: any[] }) {
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
              <Button variant="ghost" size="icon" className="size-8"><Edit2 className="size-3" /></Button>
              <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-3" /></Button>
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function MasterTrainingSettings() {
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
            <Input type="color" className="h-10 w-full" defaultValue="#0B22FE" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Modo Imersivo (Auto-hide UI)</label>
            <div className="flex items-center gap-2 pt-2">
              <Input type="checkbox" className="size-4 w-fit" defaultChecked />
              <span className="text-sm">Ativar por padrão</span>
            </div>
          </div>
        </div>
        <Button className="bg-[#0B22FE] hover:bg-[#0B22FE]/90">Salvar Preferências</Button>
      </CardContent>
    </Card>
  );
}