import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
  );
}

export function AvatarUploadDialog({
  userId,
  onUploaded,
  trigger,
}: {
  userId: string;
  onUploaded: (url: string) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Máximo 5MB");
    const r = new FileReader();
    r.onload = () => {
      setSrc(r.result as string);
      setOpen(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    r.readAsDataURL(f);
  }

  const onCropComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function onSave() {
    if (!src || !area) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(src, area);
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) throw error;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signed.data?.signedUrl ?? "";
      const { error: e2 } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", userId);
      if (e2) throw e2;
      onUploaded(url);
      window.dispatchEvent(new CustomEvent("profile:updated", { detail: { avatar_url: url } }));
      setOpen(false);
      toast.success("Foto atualizada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <span onClick={() => inputRef.current?.click()}>{trigger}</span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajustar foto de perfil</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-72 bg-muted rounded-lg overflow-hidden">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Zoom</div>
            <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => inputRef.current?.click()}>
              <Upload className="size-4 mr-1.5" /> Trocar imagem
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
              Salvar foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
