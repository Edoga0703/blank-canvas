import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Download,
  Eye,
  ExternalLink,
  Folder,
  FolderPlus,
  Home,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Pencil,
  Send,
  Trash2,
  Upload,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  startDriveConnect,
  completeDriveConnect,
  disconnectDrive,
  listDriveFiles,
  createDriveFolder,
  uploadDriveFile,
  renameDriveItem,
  deleteDriveItem,
  getDriveFileContent,
  type DriveItem,
} from "@/lib/drive.functions";
import { sendWhatsappMedia } from "@/lib/whatsapp.functions";

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.data?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("A conexão com o Google não foi concluída."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela do Google foi fechada antes de concluir."));
    }, 500);
  });
}

function fmtTamanho(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function tipoWhatsapp(mime: string): "image" | "video" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function DrivePanel({
  numero,
  contatoNome,
  onEnviado,
}: {
  numero: string | null;
  contatoNome?: string | null;
  onEnviado?: () => void;
}) {
  const start = useServerFn(startDriveConnect);
  const complete = useServerFn(completeDriveConnect);
  const desconectarFn = useServerFn(disconnectDrive);
  const list = useServerFn(listDriveFiles);
  const mkdir = useServerFn(createDriveFolder);
  const upload = useServerFn(uploadDriveFile);
  const rename = useServerFn(renameDriveItem);
  const remove = useServerFn(deleteDriveItem);
  const conteudo = useServerFn(getDriveFileContent);
  const enviarMidia = useServerFn(sendWhatsappMedia);

  const [loading, setLoading] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [podeConectar, setPodeConectar] = useState(false);
  const [reconectar, setReconectar] = useState(false);
  const [itens, setItens] = useState<DriveItem[]>([]);
  const [trilha, setTrilha] = useState<{ id: string; nome: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DriveItem | null>(null);
  const [visao, setVisao] = useState<"lista" | "grade">(
    () => (localStorage.getItem("drive-visao") === "grade" ? "grade" : "lista"),
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const folderId = trilha.length ? trilha[trilha.length - 1].id : null;

  const carregar = useCallback(
    async (fid?: string | null) => {
      if (!numero) return;
      setLoading(true);
      try {
        const r: any = await list({ data: { numero, nome: contatoNome ?? null, folderId: fid ?? null } });
        setConectado(!!r?.conectado);
        setPodeConectar(!!r?.podeConectar);
        setReconectar(!!r?.reconectar);
        setItens(r?.itens ?? []);
        if (!fid && r?.folderId) {
          setTrilha((t) => (t.length === 0 ? [{ id: r.folderId, nome: contatoNome || numero }] : t));
        }
      } catch {
        setConectado(false);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numero, contatoNome],
  );

  useEffect(() => {
    setTrilha([]);
    void carregar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero]);

  async function conectar() {
    const popup = window.open("", "metrix-drive-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Libere os pop-ups do navegador e tente de novo.");
      return;
    }
    try {
      const { authorizationUrl }: any = await start();
      const espera = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await espera;
      if (code) await complete({ data: { code } });
      toast.success("Google Drive conectado!");
      setTrilha([]);
      await carregar(null);
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "Não foi possível conectar.");
    }
  }

  async function desconectar() {
    if (!window.confirm("Desconectar o Google Drive desta conta? Os arquivos continuam no seu Drive.")) return;
    setBusy(true);
    try {
      await desconectarFn();
      setConectado(false);
      setItens([]);
      setTrilha([]);
      toast.success("Google Drive desconectado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    if (!folderId) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await upload({
        data: { parentId: folderId, nome: file.name, mime: file.type, base64: btoa(bin) },
      });
      toast.success("Arquivo enviado.");
      await carregar(folderId);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function enviarNoChat(it: DriveItem) {
    if (!numero) return;
    setEnviandoId(it.id);
    try {
      const arq: any = await conteudo({ data: { id: it.id } });
      await enviarMidia({
        data: {
          numero,
          contatoNome: contatoNome ?? null,
          mediatype: tipoWhatsapp(arq.mime),
          media: arq.base64,
          mimetype: arq.mime,
          fileName: arq.nome,
        },
      });
      toast.success("Arquivo enviado na conversa.");
      onEnviado?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar no WhatsApp.");
    } finally {
      setEnviandoId(null);
    }
  }

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!conectado || reconectar) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div className="space-y-3">
          <Folder className="mx-auto size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {reconectar
              ? "O acesso ao Google Drive da empresa precisa ser renovado."
              : podeConectar
                ? "Conecte a conta do Google Drive da empresa. Ela será usada por toda a equipe."
                : "O Google Drive da empresa ainda não foi conectado. Peça ao administrador para conectar."}
          </p>
          {podeConectar && (
            <Button size="sm" onClick={() => void conectar()}>
              {reconectar ? "Reconectar Google Drive" : "Conectar Google Drive"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--hairline)] pb-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11.5px]"
          disabled={busy || !folderId}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" /> Enviar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11.5px]"
          disabled={busy || !folderId}
          onClick={async () => {
            const nome = window.prompt("Nome da nova pasta");
            if (!nome?.trim() || !folderId) return;
            setBusy(true);
            try {
              await mkdir({ data: { parentId: folderId, nome: nome.trim() } });
              await carregar(folderId);
            } catch (e: any) {
              toast.error(e?.message ?? "Falha ao criar pasta.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <FolderPlus className="size-3.5" /> Nova pasta
        </Button>
        <span className="ml-auto flex items-center gap-0.5">
          <Button
            size="icon"
            variant={visao === "grade" ? "secondary" : "ghost"}
            className="size-7"
            title="Visualização em grade (com miniaturas)"
            onClick={() => {
              setVisao("grade");
              localStorage.setItem("drive-visao", "grade");
            }}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={visao === "lista" ? "secondary" : "ghost"}
            className="size-7"
            title="Visualização em lista"
            onClick={() => {
              setVisao("lista");
              localStorage.setItem("drive-visao", "lista");
            }}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 h-7 gap-1 text-[11.5px] text-muted-foreground"
            disabled={busy}
            title="Sair / Desconectar o Google Drive"
            onClick={() => void desconectar()}
          >
            <LogOut className="size-3.5" /> Desconectar
          </Button>
        </span>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onUpload(f);
          }}
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto py-2 text-[11.5px] text-muted-foreground no-scrollbar">
        {trilha.length > 1 && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              title="Voltar"
              onClick={() => {
                const nova = trilha.slice(0, -1);
                setTrilha(nova);
                void carregar(nova[nova.length - 1]!.id);
              }}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              title="Voltar ao início"
              onClick={() => {
                const raiz = trilha.slice(0, 1);
                setTrilha(raiz);
                void carregar(raiz[0]!.id);
              }}
            >
              <Home className="size-3.5" />
            </Button>
          </>
        )}
        {trilha.map((t, i) => (
          <span key={t.id} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span>/</span>}
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => {
                const nova = trilha.slice(0, i + 1);
                setTrilha(nova);
                void carregar(t.id);
              }}
            >
              {t.nome}
            </button>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {itens.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
            Esta pasta está vazia.
          </div>
        ) : visao === "grade" ? (
          <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
            {itens.map((it) => (
              <div
                key={it.id}
                className="group overflow-hidden rounded-lg border border-[color:var(--hairline)]"
              >
                <button
                  type="button"
                  className="relative block h-24 w-full"
                  onClick={() => {
                    if (!it.pasta) {
                      setPreview(it);
                      return;
                    }
                    setTrilha((t) => [...t, { id: it.id, nome: it.nome }]);
                    void carregar(it.id);
                  }}
                >
                  {it.pasta ? (
                    <span className="grid h-full w-full place-items-center">
                      <Folder className="size-8 text-primary" />
                    </span>
                  ) : it.thumbnail ? (
                    <img
                      src={it.thumbnail}
                      alt={it.nome}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center">
                      <FileText className="size-8 text-muted-foreground" />
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    title={it.pasta ? "Abrir pasta" : "Pré-visualizar"}
                    onClick={() => {
                      if (!it.pasta) {
                        setPreview(it);
                        return;
                      }
                      setTrilha((t) => [...t, { id: it.id, nome: it.nome }]);
                      void carregar(it.id);
                    }}
                  >
                    <span className="block truncate text-[11.5px] hover:underline" title={it.nome}>
                      {it.nome}
                    </span>
                    {!it.pasta && it.tamanho ? (
                      <span className="block text-[10px] text-muted-foreground">{fmtTamanho(it.tamanho)}</span>
                    ) : null}
                  </button>
                  <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                    {!it.pasta && numero && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-primary"
                        title="Enviar na conversa"
                        disabled={enviandoId === it.id}
                        onClick={() => void enviarNoChat(it)}
                      >
                        {enviandoId === it.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Send className="size-3" />
                        )}
                      </Button>
                    )}
                    {!it.pasta && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="Pré-visualizar"
                        onClick={() => setPreview(it)}
                      >
                        <Eye className="size-3" />
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {itens.map((it) => (
              <li
                key={it.id}
                className="group flex items-center gap-2 rounded-lg border border-[color:var(--hairline)] px-2 py-1.5"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    if (!it.pasta) {
                      setPreview(it);
                      return;
                    }
                    setTrilha((t) => [...t, { id: it.id, nome: it.nome }]);
                    void carregar(it.id);
                  }}
                >
                  {it.pasta ? (
                    <Folder className="size-4 shrink-0 text-primary" />
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">{it.nome}</span>
                    {!it.pasta && it.tamanho ? (
                      <span className="block text-[10.5px] text-muted-foreground">{fmtTamanho(it.tamanho)}</span>
                    ) : null}
                  </span>
                </button>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                  {!it.pasta && numero && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-primary"
                      title="Enviar na conversa"
                      disabled={enviandoId === it.id}
                      onClick={() => void enviarNoChat(it)}
                    >
                      {enviandoId === it.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                    </Button>
                  )}
                  {!it.pasta && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="Pré-visualizar"
                      onClick={() => setPreview(it)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  )}
                  {!it.pasta && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="Baixar"
                      onClick={() =>
                        window.open(`https://drive.google.com/uc?export=download&id=${it.id}`, "_blank", "noreferrer")
                      }
                    >
                      <Download className="size-3.5" />
                    </Button>
                  )}
                  {it.link && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="Abrir no Drive"
                      onClick={() => window.open(it.link!, "_blank", "noreferrer")}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    title="Renomear"
                    onClick={async () => {
                      const nome = window.prompt("Novo nome", it.nome);
                      if (!nome?.trim()) return;
                      await rename({ data: { id: it.id, nome: nome.trim() } });
                      await carregar(folderId);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    title="Excluir"
                    onClick={async () => {
                      if (!window.confirm(`Excluir "${it.nome}"?`)) return;
                      await remove({ data: { id: it.id } });
                      await carregar(folderId);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">{preview?.nome}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <iframe
                title={preview.nome}
                src={`https://drive.google.com/file/d/${preview.id}/preview`}
                className="h-[60vh] w-full rounded-lg border border-[color:var(--hairline)]"
                allow="autoplay"
              />
              <div className="flex flex-wrap justify-end gap-2">
                {preview.link && (
                  <Button size="sm" variant="outline" onClick={() => window.open(preview.link!, "_blank", "noreferrer")}>
                    <ExternalLink className="mr-1 size-3.5" /> Abrir no Drive
                  </Button>
                )}
                {numero && (
                  <Button
                    size="sm"
                    disabled={enviandoId === preview.id}
                    onClick={async () => {
                      await enviarNoChat(preview);
                      setPreview(null);
                    }}
                  >
                    {enviandoId === preview.id ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1 size-3.5" />
                    )}
                    Enviar na conversa
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
