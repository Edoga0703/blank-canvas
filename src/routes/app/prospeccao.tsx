import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Building2,
  Search,
  Send,
  Trash2,
  Archive,
  RotateCcw,
  Globe,
  Sparkles,
  MessageCircle,
  CheckCircle2,
  UserCheck,
  Mic,
  Square,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarProspectos,
  rastrearGoogle,
  rastrearCnpj,
  opcoesImportacao,
  importarProspectos,
  atualizarProspectos,
  analisarSitesProspectos,
  gerarAbordagem,
  salvarAbordagem,
  registrarDisparo,
  FOCOS_ABORDAGEM,
  type ProspectoRow,
} from "@/lib/prospeccao.functions";
import { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio } from "@/lib/whatsapp.functions";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { supabase } from "@/integrations/supabase/client";


const SITE_BADGE: Record<string, { label: string; cls: string }> = {
  ativo: { label: "Site saudável", cls: "bg-prospect-success text-prospect-success-foreground" },
  lento: { label: "Site lento", cls: "bg-prospect-warning text-prospect-warning-foreground" },
  desatualizado: { label: "Site antigo", cls: "bg-prospect-warning text-prospect-warning-foreground" },
  problema: { label: "Com problema", cls: "bg-prospect-danger text-prospect-danger-foreground" },
  offline: { label: "Fora do ar", cls: "bg-prospect-danger text-prospect-danger-foreground" },
  sem_site: { label: "Sem site", cls: "bg-prospect-info text-prospect-info-foreground" },
};

export const Route = createFileRoute("/app/prospeccao")({
  head: () => ({
    meta: [
      { title: "Radar de Prospecção | Capi Conversa" },
      {
        name: "description",
        content: "Rastreie empresas no Google Maps e na base pública de CNPJ e envie para o CRM.",
      },
      { property: "og:title", content: "Radar de Prospecção | Capi Conversa" },
      {
        property: "og:description",
        content: "Rastreie empresas no Google Maps e na base pública de CNPJ e envie para o CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProspeccaoPage,
});

function ProspeccaoPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarProspectos);
  const google = useServerFn(rastrearGoogle);
  const cnpj = useServerFn(rastrearCnpj);
  const opcoes = useServerFn(opcoesImportacao);
  const importar = useServerFn(importarProspectos);
  const atualizar = useServerFn(atualizarProspectos);
  const analisarSites = useServerFn(analisarSitesProspectos);

  const [termo, setTermo] = useState("");
  const [limite, setLimite] = useState("20");
  const [local, setLocal] = useState("");
  const [raioKm, setRaioKm] = useState("10");
  const [disparar, setDisparar] = useState(false);
  const [listaCnpj, setListaCnpj] = useState("");
  const [status, setStatus] = useState("novo");
  const [sel, setSel] = useState<string[]>([]);
  const [stageId, setStageId] = useState<string>("");
  const [filtroSite, setFiltroSite] = useState("todos");
  const [visao, setVisao] = useState<"atual" | "historico">("historico");
  const [loteAtual, setLoteAtual] = useState<string | null>(null);
  const [contato, setContato] = useState("todos");
  const [abordar, setAbordar] = useState<ProspectoRow | null>(null);

  const loteFiltro = visao === "atual" ? loteAtual : null;

  const prospectos = useQuery({
    queryKey: ["prospeccao", status, filtroSite, contato, loteFiltro ?? "todos"],
    queryFn: () =>
      listar({ data: { status, site: filtroSite, contato, loteId: loteFiltro } }),
  });
  const destinos = useQuery({ queryKey: ["prospeccao-destinos"], queryFn: () => opcoes({}) });

  const rows = prospectos.data ?? [];

  useEffect(() => {
    setSel([]);
  }, [visao, loteAtual, status, filtroSite, contato]);

  const invalidar = () => {
    setSel([]);
    qc.invalidateQueries({ queryKey: ["prospeccao"] });
  };

  const mGoogle = useMutation({
    mutationFn: () =>
      google({ data: { termo, limite: Number(limite), local, raioKm: Number(raioKm) } }),
    onSuccess: (r) => {
      toast.success(`${r.encontrados} empresas encontradas · ${r.novos} novas`);
      setLoteAtual(r.loteId);
      setVisao("atual");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mCnpj = useMutation({
    mutationFn: () => cnpj({ data: { lista: listaCnpj } }),
    onSuccess: (r) => {
      toast.success(`${r.consultados} consultados · ${r.novos} novos`);
      if (r.erros.length) toast.warning(r.erros[0]);
      setLoteAtual(r.loteId);
      setVisao("atual");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const mImportar = useMutation({
    mutationFn: () => importar({ data: { ids: sel, stageId: stageId || null, disparar } }),
    onSuccess: (r) => {
      toast.success(
        `${r.importados} enviados para o CRM${r.semTelefone ? ` · ${r.semTelefone} sem telefone` : ""}`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mAcao = useMutation({
    mutationFn: (acao: "descartar" | "reabrir" | "apagar") => atualizar({ data: { ids: sel, acao } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const mSites = useMutation({
    mutationFn: () => analisarSites({ data: { ids: sel } }),
    onSuccess: (r) => {
      toast.success(
        `${r.analisados} sites analisados · ${r.oportunidades} oportunidades para a Fábrica de Site`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todasEtapas = (destinos.data?.funis ?? []).flatMap((f) =>
    f.etapas.map((e) => ({ id: e.id, nome: `${f.nome} › ${e.nome}` })),
  );

  return (
    <div className="font-prospect-body">
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <header className="space-y-5 border-b px-5 py-5 lg:px-6">
          <div>
            <h1 className="font-prospect-display text-2xl font-bold text-foreground">Radar de Prospecção</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Encontre empresas, avalie oportunidades e envie contatos qualificados para o CRM.
            </p>
          </div>

          <Tabs defaultValue="google">
            <TabsList className="h-9">
          <TabsTrigger value="google">
            <MapPin className="mr-2 h-4 w-4" /> Google Maps
          </TabsTrigger>
          <TabsTrigger value="cnpj">
            <Building2 className="mr-2 h-4 w-4" /> CNPJ / Receita
          </TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="mt-4">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <div className="relative min-w-0 flex-[1.2]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 bg-background pl-9"
                    placeholder="Segmento"
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && mGoogle.mutate()}
                  />
                </div>
                <div className="relative min-w-0 flex-1">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 bg-background pl-9"
                    placeholder="Localização"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && mGoogle.mutate()}
                  />
                </div>
                <div className="flex h-9 w-44 shrink-0 items-center gap-2 rounded-md border bg-background px-3">
                  <span className="shrink-0 text-xs text-muted-foreground">Raio</span>
                  <Slider
                    value={[Number(raioKm)]}
                    min={1}
                    max={50}
                    step={1}
                    onValueChange={(v) => setRaioKm(String(v[0]))}
                  />
                  <span className="w-11 shrink-0 text-right text-xs font-semibold">{raioKm} km</span>
                </div>
                <div className="flex h-9 w-44 shrink-0 items-center gap-2 rounded-md border bg-background px-3">
                  <span className="shrink-0 text-xs text-muted-foreground">Qtd.</span>
                  <Slider
                    value={[Number(limite)]}
                    min={1}
                    max={50}
                    step={1}
                    onValueChange={(v) => setLimite(String(v[0]))}
                  />
                  <span className="w-6 shrink-0 text-right text-xs font-semibold">{limite}</span>
                </div>
                <Button className="h-9 shrink-0 px-5" onClick={() => mGoogle.mutate()} disabled={mGoogle.isPending}>
                  {mGoogle.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="cnpj" className="mt-4">
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <Textarea
                rows={4}
                  className="bg-background"
                placeholder="Cole os CNPJs (um por linha ou separados por vírgula). Até 30 por vez."
                value={listaCnpj}
                onChange={(e) => setListaCnpj(e.target.value)}
              />
              <Button onClick={() => mCnpj.mutate()} disabled={mCnpj.isPending}>
                {mCnpj.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Consultar
              </Button>
              </div>
            </TabsContent>
          </Tabs>
        </header>

        <section className="border-b bg-muted/20 px-5 py-3 lg:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setVisao("atual")}
                disabled={!loteAtual}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  visao === "atual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Busca atual
              </button>
              <button
                type="button"
                onClick={() => setVisao("historico")}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  visao === "historico" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Histórico geral
              </button>
            </div>
            {visao === "atual" && !loteAtual ? (
              <span className="text-xs text-muted-foreground">
                Faça uma busca para ver só os resultados novos.
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 flex items-baseline gap-2">
              <h2 className="font-prospect-display text-sm font-semibold">Empresas rastreadas</h2>
              <span className="text-xs font-semibold text-muted-foreground">{rows.length}</span>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-36 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="novo">Novos</SelectItem>
                <SelectItem value="importado">Importados</SelectItem>
                <SelectItem value="descartado">Descartados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contato} onValueChange={setContato}>
              <SelectTrigger className="h-9 w-48 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Abordados e não abordados</SelectItem>
                <SelectItem value="nao_abordados">Só os não abordados</SelectItem>
                <SelectItem value="abordados">Só os já abordados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroSite} onValueChange={setFiltroSite}>
              <SelectTrigger className="h-9 w-48 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os sites</SelectItem>
                <SelectItem value="oportunidade">Oportunidade Fábrica de Site</SelectItem>
                <SelectItem value="sem_site">Sem site</SelectItem>
                <SelectItem value="ativo">Site saudável</SelectItem>
                <SelectItem value="nao_analisado">Ainda não analisados</SelectItem>
              </SelectContent>
            </Select>

            <div className="hidden h-6 w-px bg-border lg:block" />
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger className="h-9 w-56 bg-background">
                <SelectValue placeholder="Etapa de destino (padrão)" />
              </SelectTrigger>
              <SelectContent>
                {todasEtapas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
              <Checkbox checked={disparar} onCheckedChange={(v) => setDisparar(!!v)} />
              Disparar automação da etapa
            </label>
          </div>
        </section>

        {sel.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-primary/5 px-5 py-2.5 lg:px-6">
            <span className="text-sm font-semibold text-primary">{sel.length} selecionada{sel.length > 1 ? "s" : ""}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" disabled={mSites.isPending} onClick={() => mSites.mutate()}>
                {mSites.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                Analisar sites
              </Button>
              <Button size="sm" onClick={() => mImportar.mutate()} disabled={mImportar.isPending}>
                {mImportar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar ao CRM
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mAcao.mutate("descartar")}>
                <Archive className="mr-2 h-4 w-4" /> Descartar
              </Button>
              <Button size="icon" variant="ghost" onClick={() => mAcao.mutate("reabrir")} title="Reabrir selecionadas">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => mAcao.mutate("apagar")} title="Apagar selecionadas">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        <div>
          {prospectos.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma empresa rastreada ainda. Faça uma busca acima.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-muted/30 text-[10px] font-bold uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="w-12 px-5 py-3">
                      <Checkbox
                        checked={sel.length === rows.length && rows.length > 0}
                        onCheckedChange={(v) => setSel(v ? rows.map((r) => r.id) : [])}
                      />
                    </th>
                    <th className="w-[23%] px-3 py-3">Empresa</th>
                    <th className="w-[13%] px-3 py-3">WhatsApp</th>
                    <th className="w-[24%] px-3 py-3">Saúde do site</th>
                    <th className="w-[11%] px-3 py-3">Local</th>
                    <th className="w-[10%] px-3 py-3">Segmento</th>
                    <th className="w-[8%] px-3 py-3">Origem</th>
                    <th className="w-[11%] px-3 py-3">Abordagem</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Linha
                      key={r.id}
                      row={r}
                      checked={sel.includes(r.id)}
                      onToggle={(v) =>
                        setSel((s) => (v ? [...s, r.id] : s.filter((i) => i !== r.id)))
                      }
                      onAbordar={() => setAbordar(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AbordagemDialog
        row={abordar}
        onClose={() => setAbordar(null)}
        onEnviado={() => qc.invalidateQueries({ queryKey: ["prospeccao"] })}
      />
    </div>
  );
}


function Linha({
  row,
  checked,
  onToggle,
  onAbordar,
}: {
  row: ProspectoRow;
  checked: boolean;
  onToggle: (v: boolean) => void;
  onAbordar: () => void;
}) {

  const tel = row.telefone;
  const celular = !!tel && tel.length === 13;
  return (
    <tr className="group border-b align-top transition-colors last:border-0 hover:bg-muted/20">
      <td className="px-5 py-4">
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
      </td>
      <td className="px-3 py-4">
        <div className="font-semibold leading-snug text-foreground">{row.nome}</div>
        {row.site ? (
          <a
            href={row.site}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-primary hover:underline"
          >
            {row.site.replace(/^https?:\/\//, "").slice(0, 40)}
          </a>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {row.status !== "novo" ? (
            <Badge variant="outline" className="text-[10px]">
              {row.status}
            </Badge>
          ) : null}
          {row.disparo_em ? (
            <Badge className="bg-prospect-info text-prospect-info-foreground text-[10px]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Já abordado
            </Badge>
          ) : row.jaNoCrm ? (
            <Badge className="bg-prospect-warning text-prospect-warning-foreground text-[10px]">
              <UserCheck className="mr-1 h-3 w-3" /> Já na sua base
            </Badge>
          ) : (
            <Badge className="bg-prospect-success text-prospect-success-foreground text-[10px]">
              Novo
            </Badge>
          )}
        </div>
      </td>

      <td className="px-3 py-4 text-xs">
        {tel ? (
          <span className={celular ? "" : "text-muted-foreground"}>
            {tel} {celular ? "" : "(fixo)"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-4">
        {row.site_status ? (
          <>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                SITE_BADGE[row.site_status]?.cls ?? "bg-muted text-muted-foreground"
              }`}
              title={row.site_diagnostico ?? ""}
            >
              {SITE_BADGE[row.site_status]?.label ?? row.site_status}
              {row.site_nota != null ? ` · ${row.site_nota}/10` : ""}
            </span>
            {row.site_diagnostico ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{row.site_diagnostico}</p> : null}
            {row.site_oportunidades ? (
              <details className="mt-1 text-xs text-primary">
                <summary className="cursor-pointer font-semibold">Ver oportunidade</summary>
                <p className="mt-1 leading-relaxed text-muted-foreground">{row.site_oportunidades}</p>
              </details>
            ) : null}
          </>
        ) : row.site ? (
          <span className="text-xs text-muted-foreground">não analisado</span>
        ) : (
          <span className="text-xs text-muted-foreground">sem site</span>
        )}
      </td>
      <td className="px-3 py-4 text-xs text-muted-foreground">{[row.cidade, row.uf].filter(Boolean).join(" / ") || "—"}</td>
      <td className="px-3 py-4 text-xs text-muted-foreground">{row.categoria ?? "—"}</td>
      <td className="px-3 py-4">
        <Badge variant="secondary" className="text-[10px]">
          {row.fonte === "google" ? "Google Maps" : "Receita Federal"}
        </Badge>
        {row.rating ? (
          <span className="ml-2 text-xs text-muted-foreground">
            ⭐ {row.rating} ({row.avaliacoes ?? 0})
          </span>
        ) : null}
      </td>
      <td className="px-3 py-4">
        <Button
          size="sm"
          variant={row.abordagem_texto ? "secondary" : "outline"}
          className="h-8 w-full text-xs"
          onClick={onAbordar}
          disabled={!tel}
          title={tel ? "" : "Empresa sem telefone"}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {row.abordagem_texto ? "Ver mensagem" : "Gerar com IA"}
        </Button>
      </td>
    </tr>

  );
}

function AbordagemDialog({
  row,
  onClose,
  onEnviado,
}: {
  row: ProspectoRow | null;
  onClose: () => void;
  onEnviado: () => void;
}) {
  const gerar = useServerFn(gerarAbordagem);
  const salvar = useServerFn(salvarAbordagem);
  const registrar = useServerFn(registrarDisparo);
  const enviarWhats = useServerFn(sendWhatsappText);
  const enviarMidia = useServerFn(sendWhatsappMedia);
  const enviarAudio = useServerFn(sendWhatsappAudio);
  const transcrever = useServerFn(transcribeAudio);

  const [foco, setFoco] = useState("geral");
  const [observacao, setObservacao] = useState("");
  const [texto, setTexto] = useState("");
  const [analise, setAnalise] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFoco(row?.abordagem_foco ?? "geral");
    setTexto(row?.abordagem_texto ?? "");
    setAnalise(row?.abordagem_analise ?? "");
    setObservacao("");
    setAnexos([]);
  }, [row?.id]);

  async function toggleGravacao() {
    if (gravando) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setTranscrevendo(true);
        try {
          const base64 = await blobToBase64(blob);
          const r = await transcrever({ data: { base64, mime: blob.type } });
          if (r.text) setObservacao((o) => (o ? `${o}\n${r.text}` : r.text));
        } catch (e: any) {
          toast.error(e?.message ?? "Falha ao transcrever.");
        } finally {
          setTranscrevendo(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      toast.error("Não consegui acessar o microfone.");
    }
  }

  const mGerar = useMutation({
    mutationFn: () => gerar({ data: { id: row!.id, foco, observacao } }),
    onSuccess: (r) => {
      setTexto(r.mensagem);
      setAnalise(r.analise);
      toast.success("Abordagem gerada pela IA.");
      onEnviado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mEnviar = useMutation({
    mutationFn: async () => {
      const numero = row!.telefone!;
      const companyId = (row as any).company_id as string;
      if (texto.trim()) await salvar({ data: { id: row!.id, texto } });
      for (const f of anexos) {
        const ext = f.name.split(".").pop() || "bin";
        const path = `${companyId}/${numero}/prosp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage
          .from("chat-media")
          .upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error("Falha no upload: " + error.message);
        const { data: s } = await supabase.storage
          .from("chat-media")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        const url = s?.signedUrl;
        if (!url) throw new Error("Falha ao preparar o arquivo.");
        const mime = f.type || "application/octet-stream";
        if (mime.startsWith("audio/")) {
          await enviarAudio({ data: { numero, contatoNome: row!.nome, audio: url, midiaUrl: url, mimetype: mime } });
        } else {
          const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "document";
          await enviarMidia({
            data: { numero, contatoNome: row!.nome, mediatype, media: url, midiaUrl: url, mimetype: mime, fileName: f.name },
          });
        }
      }
      if (texto.trim()) await enviarWhats({ data: { numero, texto, contatoNome: row!.nome } });
      await registrar({ data: { ids: [row!.id] } });
    },
    onSuccess: () => {
      toast.success("Mensagem enviada no WhatsApp.");
      onEnviado();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Abordagem para {row?.nome}
          </DialogTitle>
          <DialogDescription>
            Escreva ou fale suas instruções à esquerda. A IA analisa o site, as redes e o Google e
            escreve a mensagem à direita. Revise antes de enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Instruções */}
          <div className="flex flex-col gap-3">
            <Select value={foco} onValueChange={setFoco}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Foco da abordagem" />
              </SelectTrigger>
              <SelectContent>
                {FOCOS_ABORDAGEM.map((f) => (
                  <SelectItem key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Instruções para a IA</span>
              <Button
                type="button"
                size="sm"
                variant={gravando ? "destructive" : "outline"}
                onClick={toggleGravacao}
                disabled={transcrevendo}
              >
                {transcrevendo ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : gravando ? (
                  <Square className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Mic className="mr-1.5 h-3.5 w-3.5" />
                )}
                {transcrevendo ? "Transcrevendo…" : gravando ? "Parar" : "Falar"}
              </Button>
            </div>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={10}
              placeholder="Ex.: somos agência de marketing, quero oferecer site + Google; tom descontraído; citar que vi as avaliações; oferecer diagnóstico gratuito..."
              className="text-sm min-h-[220px]"
            />
            <Button onClick={() => mGerar.mutate()} disabled={mGerar.isPending}>
              {mGerar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {texto ? "Gerar de novo" : "Analisar e gerar"}
            </Button>
            {analise ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">Gargalos e oportunidades</p>
                {analise}
              </div>
            ) : null}
          </div>

          {/* Mensagem */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Mensagem gerada</span>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={12}
              placeholder="A mensagem gerada aparece aqui para você revisar e editar."
              className="text-sm min-h-[260px]"
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                setAnexos((a) => [...a, ...fs].slice(0, 5));
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Anexar imagem, vídeo, áudio ou arquivo
            </Button>
            {anexos.length ? (
              <ul className="space-y-1">
                {anexos.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {row?.disparo_em ? (
              <p className="text-xs text-prospect-info-foreground">
                Esta empresa já recebeu um disparo em{" "}
                {new Date(row.disparo_em).toLocaleString("pt-BR")}.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => mEnviar.mutate()}
            disabled={(!texto.trim() && !anexos.length) || mEnviar.isPending || !row?.telefone}
          >
            {mEnviar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" />
            )}
            Enviar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}
