import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { toast } from "sonner";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function MicDictateButton({ onTranscript, disabled }: Props) {
  const transcribe = useServerFn(transcribeAudio);
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = handleStop;
      rec.start();
      setState("recording");
    } catch (e: any) {
      toast.error("Não consegui acessar o microfone. Verifique as permissões.");
    }
  }

  async function handleStop() {
    setState("processing");
    try {
      const stream = streamRef.current;
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const type = recorderRef.current?.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size < 2048) {
        toast.error("Gravação muito curta. Fale por mais tempo.");
        setState("idle");
        return;
      }
      const buf = await blob.arrayBuffer();
      // base64 without atob loop
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const base64 = btoa(bin);
      const res: any = await transcribe({ data: { base64, mime: type } });
      const text = String(res?.text || "").trim();
      if (!text) {
        toast.error("Não consegui entender o áudio. Tente novamente.");
      } else {
        onTranscript(text);
        toast.success("Transcrição adicionada.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao transcrever áudio.");
    } finally {
      setState("idle");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  if (state === "processing") {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Loader2 className="size-4 mr-2 animate-spin" /> Transcrevendo…
      </Button>
    );
  }
  if (state === "recording") {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={stop}>
        <Square className="size-4 mr-2" /> Parar e transcrever
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled}>
      <Mic className="size-4 mr-2" /> Ditar por voz
    </Button>
  );
}
