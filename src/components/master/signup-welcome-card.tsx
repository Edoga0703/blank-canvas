import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { testSignupWelcome, listSignupWelcomeLogs } from "@/lib/signup-welcome.functions";

type Log = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
  erro: string | null;
  created_at: string;
};

/** Teste e histórico do disparo imediato de boas-vindas (config fica na régua acima). */
export function SignupWelcomeCard() {
  const test = useServerFn(testSignupWelcome);
  const getLogs = useServerFn(listSignupWelcomeLogs);

  const [testing, setTesting] = useState(false);
  const [testeFone, setTesteFone] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);

  async function refreshLogs() {
    try {
      const r = await getLogs();
      setLogs(((r as { logs?: Log[] }).logs ?? []) as Log[]);
    } catch {
      /* silencioso */
    }
  }

  useEffect(() => {
    void refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviarTeste() {
    setTesting(true);
    try {
      await test({ data: { telefone: testeFone } });
      toast.success("Mensagem de teste enviada");
      void refreshLogs();
    } catch (e) {
      toast.error((e as Error)?.message || "Falha no envio");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <MessageCircle className="size-4" /> Boas-vindas no cadastro
        </h2>
        <p className="text-sm text-muted-foreground">
          Usa a régua "Boas-vindas" acima: assim que alguém cria a conta, a mensagem sai na hora pelo
          WhatsApp do workspace interno. Ligar/desligar e o texto ficam na régua.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Número para teste</Label>
          <Input
            value={testeFone}
            onChange={(e) => setTesteFone(e.target.value)}
            placeholder="(11) 91234-5678"
            className="h-10 w-48"
          />
        </div>
        <Button variant="outline" onClick={enviarTeste} disabled={testing || !testeFone}>
          {testing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Send className="size-4 mr-1.5" />}
          Enviar teste
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Últimos disparos de cadastro</div>
          <Button size="sm" variant="ghost" onClick={refreshLogs}>
            Atualizar
          </Button>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum disparo ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {logs.map((l) => (
              <li key={l.id} className="p-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.nome || l.email || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l.telefone} · {new Date(l.created_at).toLocaleString("pt-BR")}
                    {l.erro ? ` · ${l.erro}` : ""}
                  </div>
                </div>
                <Badge variant={l.status === "enviado" ? "default" : "secondary"}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
