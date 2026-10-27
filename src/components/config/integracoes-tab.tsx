import { MetaCapiCard } from "./meta-capi-card";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listApiTokens, createApiToken, revokeApiToken } from "@/lib/integrations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Trash2, Code2 } from "lucide-react";

function Passos({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 text-xs mt-3">
      {itens.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold grid place-items-center mt-0.5">{i + 1}</span>
          <span className="min-w-0 leading-relaxed text-muted-foreground">{t}</span>
        </li>
      ))}
    </ol>
  );
}


type Token = { id: string; label: string; token: string; revogado: boolean; created_at: string };

export function IntegracoesTab() {
  const list = useServerFn(listApiTokens);
  const create = useServerFn(createApiToken);
  const revoke = useServerFn(revokeApiToken);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setTokens(((await list()) as Token[]) ?? []); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const activeToken = useMemo(() => tokens.find((t) => !t.revogado)?.token ?? "SEU_TOKEN", [tokens]);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://metrixcrm.com.br";
  const endpoint = `${origin}/api/public/lead-capture`;

  async function handleCreate() {
    if (!label.trim()) { toast.error("Dê um nome ao token"); return; }
    setSaving(true);
    try {
      await create({ data: { label: label.trim() } });
      setLabel("");
      toast.success("Token criado");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setSaving(false); }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revogar este token? Sites e integrações que o usam vão parar de funcionar.")) return;
    try { await revoke({ data: { id } }); toast.success("Token revogado"); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
  }

  const snippetHtml = `<!-- Capi Conversa — Captura de leads (cole antes de </body>) -->
<script>
(function(){
  var TOKEN = "${activeToken}";
  var ENDPOINT = "${endpoint}";
  var p = new URLSearchParams(location.search);
  var t = {
    utm_source: p.get("utm_source"), utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"), utm_term: p.get("utm_term"),
    utm_content: p.get("utm_content"),
    gclid: p.get("gclid"), fbclid: p.get("fbclid"),
    referrer: document.referrer, first_page: location.href
  };
  try { sessionStorage.setItem("metrix_track", JSON.stringify(t)); } catch(e){}

  // Marque seus formulários com data-metrix-form e inputs com name="numero" e name="nome"
  document.addEventListener("submit", function(ev){
    var f = ev.target;
    if (!f || !f.matches || !f.matches("[data-metrix-form]")) return;
    ev.preventDefault();
    var data = new FormData(f);
    var body = Object.assign({ company_token: TOKEN,
      numero: (data.get("numero")||"").toString(),
      nome: (data.get("nome")||"").toString(),
      mensagem: (data.get("mensagem")||"").toString()
    }, JSON.parse(sessionStorage.getItem("metrix_track")||"{}"));
    fetch(ENDPOINT, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) })
      .then(function(r){ if(r.ok){ f.reset(); (f.dataset.metrixRedirect ? location.href = f.dataset.metrixRedirect : alert("Recebemos seu contato!")); } else { alert("Erro ao enviar."); } });
  });
})();
</script>`;

  const snippetForm = `<form data-metrix-form data-metrix-redirect="/obrigado">
  <input name="nome" placeholder="Seu nome" required />
  <input name="numero" placeholder="Seu WhatsApp (com DDD)" required />
  <textarea name="mensagem" placeholder="Como podemos ajudar?"></textarea>
  <button type="submit">Enviar</button>
</form>`;

  const snippetCurl = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{
    "company_token": "${activeToken}",
    "numero": "5511999999999",
    "nome": "João",
    "utm_source": "google",
    "utm_campaign": "black-friday"
  }'`;

  const snippetWaLink = `https://wa.me/SEUNUMERO?text=${encodeURIComponent("Olá! [utm_source=instagram&utm_campaign=lancamento] Quero saber mais.")}`;

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid gap-4 xl:grid-cols-2 min-w-0">

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><KeyRound className="size-4" /> Tokens de API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0">
              <Label>Novo token</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Site principal" />
            </div>
            <Button onClick={handleCreate} disabled={saving} className="sm:self-end w-full sm:w-auto">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Criar"}
            </Button>
          </div>


          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : tokens.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum token criado ainda.</div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className={`rounded-lg border p-3 ${t.revogado ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{t.label} {t.revogado && <span className="text-xs text-red-600">(revogado)</span>}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{t.token}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => copy(t.token)} title="Copiar"><Copy className="size-4" /></Button>
                      {!t.revogado && (
                        <Button size="icon" variant="ghost" onClick={() => handleRevoke(t.id)} title="Revogar"><Trash2 className="size-4 text-red-600" /></Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Cada token identifica a origem dos leads. Guarde em segredo — quem tiver o token pode criar leads na sua conta.
          </p>
          <Passos itens={[
            <>Escreva um nome que identifique a origem (ex.: “Site principal”, “Make – Meta Ads”) e clique em <strong>Criar</strong>.</>,
            <>Copie o token gerado (começa com <code>azp_</code>) e guarde em local seguro — ele será usado nas integrações ao lado.</>,
            <>Se um token vazar, clique na lixeira para <strong>revogar</strong> e crie outro.</>,
          ]} />
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><Code2 className="size-4" /> Captura de leads no seu site</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <Tabs defaultValue="script" className="min-w-0">
            <TabsList className="w-full max-w-full justify-start overflow-x-auto no-scrollbar flex-nowrap">

              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="form">Formulário</TabsTrigger>
              <TabsTrigger value="meta">Meta Ads & CAPI</TabsTrigger>
              <TabsTrigger value="curl">API (cURL)</TabsTrigger>
              <TabsTrigger value="wa">Link WhatsApp</TabsTrigger>

            </TabsList>
            <TabsContent value="script" className="mt-3">
              <SnippetBox code={snippetHtml} onCopy={() => copy(snippetHtml)} />
              <p className="text-xs text-muted-foreground mt-2">Captura UTMs, gclid, fbclid, referrer e página de entrada automaticamente.</p>
              <Passos itens={[
                <>Copie o script acima e cole antes de <code>&lt;/body&gt;</code> em todas as páginas do site (no WordPress: plugin de scripts no rodapé ou editor de tema).</>,
                <>Marque seu formulário com <code>data-metrix-form</code> e use os campos <code>nome</code> e <code>numero</code> (opcional: <code>mensagem</code>).</>,
                <>Publique, envie um teste pelo próprio site e confira o lead no <strong>CRM → Kanban Comercial</strong>.</>,
              ]} />
            </TabsContent>
            <TabsContent value="form" className="mt-3">
              <SnippetBox code={snippetForm} onCopy={() => copy(snippetForm)} />
              <p className="text-xs text-muted-foreground mt-2">Marque com <code>data-metrix-form</code> e use os campos <code>nome</code>, <code>numero</code>, <code>mensagem</code>.</p>
              <Passos itens={[
                <>Garanta que o <strong>Script</strong> (aba anterior) já está instalado no site — é ele quem envia os dados.</>,
                <>Use o HTML de exemplo ou adapte o seu formulário mantendo o atributo <code>data-metrix-form</code> e os <code>name</code> dos campos.</>,
                <>Opcional: adicione <code>data-metrix-redirect="/obrigado"</code> para levar o visitante a uma página de agradecimento.</>,
                <>Envie um teste e veja o lead aparecer no <strong>CRM → Kanban Comercial</strong>.</>,
              ]} />
            </TabsContent>
            <TabsContent value="curl" className="mt-3">
              <SnippetBox code={snippetCurl} onCopy={() => copy(snippetCurl)} />
              <p className="text-xs text-muted-foreground mt-2">Use direto do seu backend ou integração (Zapier, Make, n8n).</p>
              <Passos itens={[
                <>Crie um <strong>Token de API</strong> no cartão ao lado e copie o valor.</>,
                <>Faça um <strong>POST</strong> para a URL com <code>company_token</code>, <code>numero</code> e <code>nome</code> (demais campos são opcionais).</>,
                <>Funciona no Zapier (<em>Webhooks → POST</em>), Make (<em>HTTP → Make a request</em>), n8n (<em>HTTP Request</em>) ou no seu backend.</>,
                <>Confirme o retorno <code>200</code> e veja o lead no <strong>CRM → Kanban Comercial</strong>.</>,
              ]} />
            </TabsContent>
            <TabsContent value="wa" className="mt-3">
              <SnippetBox code={snippetWaLink} onCopy={() => copy(snippetWaLink)} />
              <p className="text-xs text-muted-foreground mt-2">UTMs no texto (entre colchetes) são lidas quando o lead chega no WhatsApp.</p>
              <Passos itens={[
                <>Troque <code>SEUNUMERO</code> pelo número com DDI (ex.: 5511999999999).</>,
                <>Ajuste a mensagem e as UTMs entre colchetes (<code>utm_source</code>, <code>utm_campaign</code>).</>,
                <>Use o link no anúncio, na bio ou no botão do site — a origem fica registrada na ficha do lead no CRM.</>,
              ]} />
            </TabsContent>
            <TabsContent value="meta" className="mt-3">
              <SnippetBox code={origin + "/api/public/meta-leads-webhook"} onCopy={() => copy(origin + "/api/public/meta-leads-webhook")} />
              <p className="text-xs text-muted-foreground mt-2">Use esta URL como Webhook nas configurações do seu App na Meta (campo "leadgen"). O Token de Verificação padrão é <code>metrix_crm_leads_verify</code>.</p>
              <Passos itens={[
                <>Acesse <strong>developers.facebook.com</strong>, abra (ou crie) um App do tipo Empresa e adicione o produto <strong>Webhooks</strong> (objeto <em>Page</em>).</>,
                <>Em <strong>Callback URL</strong> cole a URL acima; em <strong>Verify Token</strong> informe <code>metrix_crm_leads_verify</code> e salve.</>,
                <>Assine o campo <code>leadgen</code> e solicite as permissões <code>leads_retrieval</code>, <code>pages_show_list</code> e <code>pages_manage_metadata</code>.</>,
                <>Conecte a página e teste pelo <strong>Lead Ads Testing Tool</strong> da Meta.</>,
              ]} />
              <p className="text-xs text-muted-foreground mt-3">
                Prefere sem código? Use a aba <strong>API (cURL)</strong> com o Make (<em>Facebook Lead Ads → Watch Leads</em> + <em>HTTP → Make a request</em> apontando para a URL de captura).
              </p>
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
      </div>
    </div>
  );

}

function SnippetBox({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="relative min-w-0">
      <pre className="text-[10px] sm:text-[11px] leading-relaxed bg-slate-900 text-slate-100 p-3 pt-10 sm:pt-3 rounded-lg overflow-x-auto max-w-full max-h-[320px] whitespace-pre">{code}</pre>
      <Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7" onClick={onCopy}>
        <Copy className="size-3 mr-1" /> Copiar
      </Button>
    </div>
  );
}
