import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Copy, BookOpen, Globe, Zap, Webhook, KeyRound, Facebook, Link2, Calendar, MessageCircle } from "lucide-react";

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
}

function Code({ children }: { children: string }) {
  return (
    <div className="relative min-w-0">
      <pre className="text-[10px] sm:text-[11px] leading-relaxed bg-slate-900 text-slate-100 p-3 pt-9 sm:pt-3 rounded-lg overflow-x-auto max-w-full whitespace-pre">{children}</pre>
      <Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7" onClick={() => copy(children)}>
        <Copy className="size-3 mr-1" /> Copiar
      </Button>
    </div>
  );
}

function Passos({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {itens.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold grid place-items-center mt-0.5">{i + 1}</span>
          <span className="min-w-0 leading-relaxed">{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Guia({
  value, icon, titulo, resumo, nivel, children,
}: { value: string; icon: any; titulo: string; resumo: string; nivel: string; children: React.ReactNode }) {
  const Icon = icon;
  return (
    <AccordionItem value={value} className="border rounded-xl px-4 bg-card">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-start gap-3 text-left min-w-0">
          <span className="shrink-0 size-9 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon className="size-4" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{titulo}</span>
              <Badge variant="secondary" className="text-[10px]">{nivel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{resumo}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-5 space-y-3">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function IntegracaoGuias() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://metrixcrm.com.br";
  const leadCapture = `${origin}/api/public/lead-capture`;
  const metaWebhook = `${origin}/api/public/meta-leads-webhook`;

  const bodyMake = useMemo(() => `{
  "company_token": "COLE_AQUI_SEU_TOKEN",
  "nome": "{{1.full_name}}",
  "numero": "{{1.phone_number}}",
  "email": "{{1.email}}",
  "mensagem": "Lead vindo do Meta Lead Ads",
  "utm_source": "meta-ads",
  "utm_campaign": "{{1.campaign_name}}"
}`, []);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start gap-3">
        <BookOpen className="size-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">Central de integrações — passo a passo</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Escolha abaixo o tipo de integração que você quer fazer. Cada guia é completo, do zero ao teste final.
            Todos os leads recebidos entram automaticamente no <strong>CRM → Kanban Comercial</strong>, na primeira etapa do funil,
            já com um responsável definido pela fila de distribuição.
          </p>
        </div>
      </Card>

      <Accordion type="single" collapsible className="space-y-3">
        {/* 1. Token */}
        <Guia value="token" icon={KeyRound} nivel="Comece por aqui" titulo="1. Criar o Token de API"
          resumo="Obrigatório para qualquer integração externa (site, Make, Zapier, n8n).">
          <Passos itens={[
            <>Abra <strong>Configurações → Integrações</strong> (ou o módulo <strong>Integrações</strong> no menu lateral).</>,
            <>No cartão <strong>Tokens de API</strong>, escreva um nome que identifique a origem (ex.: “Site principal”, “Make – Meta Ads”).</>,
            <>Clique em <strong>Criar</strong>. O token aparece na lista logo abaixo, começando com <code>azp_</code>.</>,
            <>Clique no ícone de copiar e guarde em local seguro. Ele será colado nas próximas etapas.</>,
            <>Se um token vazar, clique na lixeira para <strong>revogar</strong> e crie outro — quem tem o token pode criar leads na sua conta.</>,
          ]} />
        </Guia>

        {/* 2. Site */}
        <Guia value="site" icon={Globe} nivel="Fácil" titulo="2. Captura de leads no seu site"
          resumo="Formulário do site enviando direto para o CRM, com UTMs e origem do anúncio.">
          <Passos itens={[
            <>Copie o <strong>Script</strong> na aba “Captura de leads no seu site” e cole antes do <code>&lt;/body&gt;</code> de todas as páginas (no WordPress: Aparência → Editor de tema, ou um plugin de scripts no rodapé).</>,
            <>No seu formulário, adicione o atributo <code>data-metrix-form</code> na tag <code>&lt;form&gt;</code>.</>,
            <>Renomeie os campos para <code>nome</code>, <code>numero</code> e (opcional) <code>mensagem</code>.</>,
            <>Opcional: adicione <code>data-metrix-redirect="/obrigado"</code> para levar o visitante a uma página de agradecimento.</>,
            <>Publique, preencha o formulário no próprio site e confira o lead no <strong>CRM → Kanban Comercial</strong>.</>,
          ]} />
          <p className="text-xs text-muted-foreground">O script captura sozinho utm_source, utm_medium, utm_campaign, gclid, fbclid, página de entrada e site de origem.</p>
        </Guia>

        {/* 3. Make */}
        <Guia value="make" icon={Zap} nivel="Intermediário" titulo="3. Make.com (inclusive Meta Lead Ads)"
          resumo="Formulários do Facebook/Instagram, Typeform, Google Sheets e afins enviando leads ao CRM.">
          <Passos itens={[
            <>No Make, crie um cenário e adicione o módulo de origem (ex.: <strong>Facebook Lead Ads → Watch Leads</strong>) conectando a página e o formulário.</>,
            <>Adicione o segundo módulo: <strong>HTTP → Make a request</strong>. (Não use “Webhook response” — ele só responde, não envia.)</>,
            <>Em <strong>URL</strong>, cole: <code className="break-all">{leadCapture}</code></>,
            <>Em <strong>Method</strong>, escolha <strong>POST</strong>.</>,
            <>Marque <strong>Body type: Raw</strong> e <strong>Content type: JSON (application/json)</strong>.</>,
            <>Em <strong>Request content</strong>, cole o JSON abaixo trocando o token e mapeando os campos do módulo anterior.</>,
            <>Clique em <strong>Run once</strong> e envie um lead de teste pela ferramenta de teste do Meta (Lead Ads Testing Tool).</>,
            <>Ative o cenário (Scheduling = ON) e confira o lead no Kanban.</>,
          ]} />
          <Code>{bodyMake}</Code>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Erros comuns:</strong></p>
            <p>• “is not valid JSON”: algum valor ficou sem aspas duplas ou faltou vírgula. Todo valor, inclusive <code>{"{{...}}"}</code>, vai entre aspas.</p>
            <p>• “Object with ID … does not exist / missing permissions”: reconecte a conta do Facebook no Make e libere o <em>Lead Access</em> no Meta Business Suite (Configurações → Acessos de leads).</p>
            <p>• “numero inválido”: envie o telefone com DDD. O sistema completa o DDI 55 automaticamente.</p>
          </div>
        </Guia>

        {/* 4. Zapier / n8n */}
        <Guia value="zapier" icon={Zap} nivel="Intermediário" titulo="4. Zapier, n8n ou qualquer sistema (API)"
          resumo="Mesma lógica do Make: uma requisição POST com JSON.">
          <Passos itens={[
            <>No Zapier use a ação <strong>Webhooks by Zapier → POST</strong>; no n8n use o nó <strong>HTTP Request</strong>.</>,
            <>URL: <code className="break-all">{leadCapture}</code> — Método: <strong>POST</strong> — Header: <code>Content-Type: application/json</code>.</>,
            <>Envie o corpo em JSON com <code>company_token</code>, <code>numero</code> e <code>nome</code> (os demais campos são opcionais).</>,
            <>Rode um teste e confirme o retorno <code>200</code>; depois verifique o lead no Kanban.</>,
          ]} />
          <Code>{`curl -X POST ${leadCapture} \\
  -H "Content-Type: application/json" \\
  -d '{
    "company_token": "COLE_AQUI_SEU_TOKEN",
    "nome": "João da Silva",
    "numero": "5511999999999",
    "email": "joao@email.com",
    "mensagem": "Quero um orçamento",
    "utm_source": "google",
    "utm_campaign": "black-friday"
  }'`}</Code>
        </Guia>

        {/* 5. Meta direto */}
        <Guia value="meta" icon={Facebook} nivel="Avançado" titulo="5. Meta Lead Ads direto (sem Make)"
          resumo="Webhook oficial da Meta apontando para o Metrix, sem ferramenta intermediária.">
          <Passos itens={[
            <>Acesse <strong>developers.facebook.com</strong> e abra (ou crie) o seu App do tipo Empresa.</>,
            <>No menu, adicione o produto <strong>Webhooks</strong> e escolha o objeto <strong>Page</strong>.</>,
            <>Em <strong>Callback URL</strong>, cole: <code className="break-all">{metaWebhook}</code></>,
            <>Em <strong>Verify Token</strong>, informe: <code>metrix_crm_leads_verify</code> e clique em Verificar e salvar.</>,
            <>Assine o campo <strong>leadgen</strong>.</>,
            <>Em <strong>Permissões</strong>, solicite <code>leads_retrieval</code>, <code>pages_show_list</code> e <code>pages_manage_metadata</code>.</>,
            <>Conecte a página do cliente e teste pelo <strong>Lead Ads Testing Tool</strong> da Meta.</>,
          ]} />
        </Guia>

        {/* 6. Webhooks de saída */}
        <Guia value="webhooks" icon={Webhook} nivel="Intermediário" titulo="6. Webhooks de saída (enviar eventos do Metrix para fora)"
          resumo="Avise outro sistema quando chegar mensagem, lead novo, venda ganha ou perdida.">
          <Passos itens={[
            <>Na ferramenta de destino (Make, Zapier, n8n ou seu servidor), crie um webhook de entrada e copie a URL gerada.</>,
            <>Aqui no Metrix, aba <strong>Webhooks</strong>, clique em <strong>Novo webhook</strong>.</>,
            <>Preencha o <strong>Nome</strong> e cole a <strong>URL</strong> de destino.</>,
            <>Selecione os <strong>eventos</strong> desejados (deixar vazio envia todos): mensagem recebida/enviada, lead criado, venda ganha, lead perdido, CSAT respondido.</>,
            <>Deixe <strong>Ativo</strong> ligado e clique em Salvar.</>,
            <>Clique no botão <strong>Testar</strong> ao lado do webhook — o destino deve receber um evento de teste e o status ficar 200 em “Últimas entregas”.</>,
            <>Para validar a origem, confira a assinatura HMAC-SHA256 enviada no header <code>X-AtendeZap-Signature</code> usando o <em>secret</em> exibido no cartão.</>,
          ]} />
        </Guia>

        {/* 7. UTM */}
        <Guia value="utm" icon={Link2} nivel="Fácil" titulo="7. Links UTM para WhatsApp"
          resumo="Descubra de qual anúncio ou canal veio cada conversa.">
          <Passos itens={[
            <>Abra a aba <strong>Links UTM</strong>.</>,
            <>Informe o número com DDI (ex.: 5511999999999) e a mensagem inicial.</>,
            <>Preencha <code>utm_source</code> (ex.: instagram), <code>utm_medium</code> (ex.: cpc) e <code>utm_campaign</code> (ex.: lancamento).</>,
            <>Copie o link e use no anúncio, na bio ou no botão do site.</>,
            <>Quando o lead enviar a mensagem, a origem fica registrada na ficha dele no CRM.</>,
          ]} />
        </Guia>

        {/* 8. WhatsApp */}
        <Guia value="whatsapp" icon={MessageCircle} nivel="Comece por aqui" titulo="8. Conectar o WhatsApp"
          resumo="Sem a conexão ativa nenhuma mensagem entra ou sai.">
          <Passos itens={[
            <>Vá em <strong>Conexão</strong> no menu lateral e clique em <strong>Nova conexão</strong>.</>,
            <>Escolha <strong>WhatsApp (QR Code)</strong> para número comum ou <strong>API Oficial (Meta)</strong> para conta verificada.</>,
            <>No celular, abra WhatsApp → Aparelhos conectados → Conectar aparelho e leia o QR Code da tela.</>,
            <>Aguarde o status ficar <strong>Conectado</strong> (verde). Mantenha o celular com internet.</>,
            <>Envie uma mensagem de teste de outro número e veja a conversa aparecer no módulo <strong>Conversas</strong>.</>,
          ]} />
        </Guia>

        {/* 9. Google Agenda */}
        <Guia value="google" icon={Calendar} nivel="Fácil" titulo="9. Google Agenda"
          resumo="Agendamentos do CRM criados automaticamente na agenda do Google.">
          <Passos itens={[
            <>Abra <strong>Plugins</strong> e instale o plugin <strong>Google Agenda</strong>.</>,
            <>Clique em <strong>Conectar conta Google</strong> e autorize o acesso ao calendário.</>,
            <>Escolha qual agenda receberá os eventos.</>,
            <>Crie um agendamento no módulo <strong>Agendamentos</strong> e confirme que ele apareceu no Google Agenda.</>,
          ]} />
        </Guia>
      </Accordion>
    </div>
  );
}
