import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, ArrowRight, Bot, KanbanSquare, Sparkles, Zap } from "lucide-react";
import { brand } from "@/config/brand";

const TITLE = "Capi Conversa vs Botconversa: qual é melhor para WhatsApp em 2026?";
const DESC =
  "Comparativo direto entre Capi Conversa e Botconversa: IA nativa, CRM automático, agendamentos e preço. Veja qual atende melhor sua PME no WhatsApp.";
const URL = "https://metrixcrm.com.br/comparativo/metrix-vs-botconversa";

export const Route = createFileRoute("/comparativo/metrix-vs-botconversa")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: brand.name },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESC,
          url: URL,
          author: { "@type": "Organization", name: brand.name },
          publisher: { "@type": "Organization", name: brand.name },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Capi Conversa ou Botconversa: qual é melhor para PMEs?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Capi Conversa é melhor para quem quer IA nativa qualificando lead e movendo o card no CRM sozinha. Botconversa é um construtor de fluxos com bot mais tradicional — bom para automações simples, mas exige montar árvore de decisão manualmente.",
              },
            },
            {
              "@type": "Question",
              name: "O Metrix substitui o Botconversa?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sim. Metrix cobre atendimento por IA, CRM Kanban, agendamentos, campanhas em massa e catálogo em um plano só, sem precisar de plataforma de bot separada.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: Page,
});

type Row = { feature: string; metrix: string | boolean; bot: string | boolean };
const ROWS: Row[] = [
  { feature: "IA nativa que responde e qualifica lead", metrix: true, bot: "Requer integração externa" },
  { feature: "CRM Kanban com movimentação automática por IA", metrix: true, bot: false },
  { feature: "Agendamentos com calendário próprio", metrix: true, bot: false },
  { feature: "Campanhas em massa segmentadas pelo funil", metrix: true, bot: true },
  { feature: "Catálogo de produtos/serviços com IA vendedora", metrix: true, bot: false },
  { feature: "Construtor visual de fluxos (drag-and-drop)", metrix: true, bot: true },
  { feature: "Respostas rápidas com áudio, vídeo e imagem", metrix: true, bot: "Limitado" },
  { feature: "Pós-venda automático (NPS, recompra)", metrix: true, bot: false },
  { feature: "Modelo de precificação", metrix: "Plano único simples", bot: "Cobra por contato ativo" },
  { feature: "Onboarding guiado + suporte em português", metrix: true, bot: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check className="h-4 w-4" /> Sim</span>;
  if (v === false) return <span className="inline-flex items-center gap-1.5 text-muted-foreground"><X className="h-4 w-4" /> Não</span>;
  return <span className="text-foreground">{v}</span>;
}

function Page() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60 bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 h-14">
          <Link to="/" className="font-semibold tracking-tight text-lg">{brand.name}</Link>
          <Link to="/entrar" className="text-sm font-medium text-primary hover:underline">Entrar</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-16 space-y-12">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Início</Link>
          <span className="mx-2">/</span>
          <span>Comparativo Metrix vs Botconversa</span>
        </nav>

        <section className="space-y-4">
          <span className="inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Comparativo 2026
          </span>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            Capi Conversa vs Botconversa: qual atende melhor sua PME no WhatsApp?
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Se você chegou aqui pesquisando <strong>Botconversa</strong>, provavelmente quer automatizar
            WhatsApp e organizar leads. A diferença central é simples: o <strong>Capi Conversa</strong> traz
            IA nativa que <em>entende</em> a conversa, responde e move o card no funil sozinha —
            sem você desenhar árvore de decisão manualmente.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          {[
            { icon: Bot, title: "IA que responde por você", body: "Treine em uma tela contando sobre a empresa. Ela qualifica, responde 24/7 e só chama humano quando precisa." },
            { icon: KanbanSquare, title: "CRM Kanban automático", body: "Cada conversa vira card. A IA move Novo → Qualificado → Ganho conforme a conversa evolui — sem trabalho manual." },
            { icon: Zap, title: "Resposta em segundos", body: "O tempo médio de resposta cai de horas para segundos. Lead frio vira quente antes do concorrente ver a mensagem." },
            { icon: Sparkles, title: "Tudo em um plano", body: "Atendimento, CRM, agendamentos, campanhas e catálogo no mesmo lugar. Sem stack de 4 ferramentas amarradas por Zapier." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary mb-3">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Comparativo lado a lado</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Recurso</th>
                  <th className="text-left font-semibold px-4 py-3">Capi Conversa</th>
                  <th className="text-left font-semibold px-4 py-3">Botconversa</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={r.feature} className={i % 2 ? "bg-muted/20" : ""}>
                    <td className="px-4 py-3 font-medium">{r.feature}</td>
                    <td className="px-4 py-3"><Cell v={r.metrix} /></td>
                    <td className="px-4 py-3"><Cell v={r.bot} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Comparativo baseado em informações públicas dos produtos. Botconversa é marca dos seus respectivos donos.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Quando o Metrix ganha</h2>
          <ul className="space-y-3 text-[15px] leading-relaxed">
            <li className="flex gap-3"><Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> Você quer <strong>responder em segundos</strong> — não desenhar fluxograma de bot pra cada cenário.</li>
            <li className="flex gap-3"><Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> Precisa que <strong>o lead entre no CRM sozinho</strong> e ande no funil sem alguém arrastar card.</li>
            <li className="flex gap-3"><Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> Atende <strong>clínica, imobiliária, serviços ou e-commerce</strong> e quer agendamento + catálogo no mesmo sistema.</li>
            <li className="flex gap-3"><Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> Não quer <strong>pagar por contato ativo</strong> — Metrix tem plano único e previsível.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Quando o Botconversa faz sentido</h2>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Se o seu caso é 100% construir <strong>fluxos manuais de bot</strong> (menus, botões, gatilhos por palavra-chave)
            e você não precisa de CRM Kanban, agendamento ou IA que entende linguagem natural, um construtor
            de bot tradicional cobre. A partir do momento em que você quer atendimento humanizado, qualificação
            automática e um funil vivo, o Metrix ganha por vir <strong>tudo pronto</strong>.
          </p>
        </section>

        <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Teste o Capi Conversa 7 dias grátis</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Conecte seu WhatsApp em 2 minutos e veja a IA qualificar seu primeiro lead. Sem cartão, sem amarração.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              to="/entrar"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
            >
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-card mt-16">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 text-xs text-muted-foreground flex flex-wrap gap-3 justify-between">
          <span>© {new Date().getFullYear()} {brand.name}</span>
          <div className="flex gap-4">
            <Link to="/termos" className="hover:text-foreground">Termos</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
