import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Eye,
  Flame,
  Award,
  Clock,
  Sparkles,
  Share2,
  MessageSquare,
  BarChart3,
  Calendar,
  CheckCircle2,
  Zap,
  ArrowUpRight,
  AlertTriangle,
  Lightbulb,
  Target,
  DollarSign,
  Copy,
  Film,
  Image as ImageIcon,
  Layers,
  Filter,
  Radio,
  Check,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InstagramGlyph,
  FacebookGlyph,
  TikTokGlyph,
  YouTubeGlyph,
} from "@/components/ui/channel-icons";
import type { SocialAccount } from "@/lib/social-content.types";

interface Props {
  accounts: SocialAccount[];
}

export function OmnichannelAnalytics({ accounts }: Props) {
  // Filtros de tempo e origem de postagem
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "90d" | "year">("30d");
  const [originFilter, setOriginFilter] = useState<"all" | "crm" | "external">("all");
  const [selectedPostDetail, setSelectedPostDetail] = useState<string | null>(null);

  // Nome e identificador dinâmicos da empresa
  const companyHandle = useMemo(() => {
    const acc = accounts.find((a) => a.username);
    return acc?.username ? `@${acc.username.replace(/^@/, "")}` : "@suaempresa";
  }, [accounts]);

  const companyName = useMemo(() => {
    const acc = accounts.find((a) => a.display_name);
    return acc?.display_name || "Sua Empresa";
  }, [accounts]);

  // Multiplicadores dinâmicos para simular período selecionado
  const multiplier = useMemo(() => {
    switch (timeRange) {
      case "today":
        return 0.08;
      case "7d":
        return 0.35;
      case "30d":
        return 1.0;
      case "90d":
        return 2.8;
      case "year":
        return 9.4;
      default:
        return 1.0;
    }
  }, [timeRange]);

  // Métricas consolidadas por rede social
  const profileMetrics = useMemo(() => {
    return [
      {
        platform: "tiktok",
        name: "TikTok",
        username: companyHandle,
        followers: Math.round(18450 * (timeRange === "today" ? 0.99 : timeRange === "7d" ? 0.96 : timeRange === "year" ? 1.4 : 1)),
        views: Math.round(142000 * multiplier),
        interactions: Math.round(16800 * multiplier),
        leads: Math.round(185 * multiplier),
        growth: timeRange === "today" ? "+45 hoje" : timeRange === "7d" ? "+380 novos" : timeRange === "year" ? "+8,400 no ano" : "+1,240 este mês",
        icon: TikTokGlyph,
        color: "text-foreground",
        badgeBg: "bg-foreground/10 border-foreground/20 text-foreground",
        sharePercent: 33,
        role: "Viralidade & Aquisição Rápida",
        conversionRate: "16.4%",
      },
      {
        platform: "youtube",
        name: "YouTube Shorts",
        username: companyName,
        followers: Math.round(9210 * (timeRange === "today" ? 0.99 : timeRange === "7d" ? 0.97 : timeRange === "year" ? 1.35 : 1)),
        views: Math.round(285000 * multiplier),
        interactions: Math.round(14200 * multiplier),
        leads: Math.round(124 * multiplier),
        growth: timeRange === "today" ? "+28 hoje" : timeRange === "7d" ? "+240 novos" : timeRange === "year" ? "+5,120 no ano" : "+820 este mês",
        icon: YouTubeGlyph,
        color: "text-[#FF0000]",
        badgeBg: "bg-[#FF0000]/10 border-[#FF0000]/20 text-[#FF0000]",
        sharePercent: 16,
        role: "Retenção & Tráfego de Longo Prazo",
        conversionRate: "12.2%",
      },
      {
        platform: "instagram",
        name: "Instagram",
        username: companyHandle,
        followers: Math.round(12800 * (timeRange === "today" ? 0.99 : timeRange === "7d" ? 0.98 : timeRange === "year" ? 1.28 : 1)),
        views: Math.round(68400 * multiplier),
        interactions: Math.round(5100 * multiplier),
        leads: Math.round(68 * multiplier),
        growth: timeRange === "today" ? "+15 hoje" : timeRange === "7d" ? "+110 novos" : timeRange === "year" ? "+3,450 no ano" : "+450 este mês",
        icon: InstagramGlyph,
        color: "text-[#E1306C]",
        badgeBg: "bg-[#E1306C]/10 border-[#E1306C]/20 text-[#E1306C]",
        sharePercent: 23,
        role: "Construção de Marca & Fechamento Direto",
        conversionRate: "18.5%",
      },
      {
        platform: "facebook",
        name: "Facebook Page",
        username: companyName,
        followers: Math.round(15400 * (timeRange === "today" ? 0.99 : timeRange === "7d" ? 0.99 : timeRange === "year" ? 1.2 : 1)),
        views: Math.round(32000 * multiplier),
        interactions: Math.round(2140 * multiplier),
        leads: Math.round(35 * multiplier),
        growth: timeRange === "today" ? "+8 hoje" : timeRange === "7d" ? "+60 novos" : timeRange === "year" ? "+1,980 no ano" : "+210 este mês",
        icon: FacebookGlyph,
        color: "text-[#0084FF]",
        badgeBg: "bg-[#0084FF]/10 border-[#0084FF]/20 text-[#0084FF]",
        sharePercent: 28,
        role: "Público Maduro & Links Clicáveis",
        conversionRate: "9.8%",
      },
    ];
  }, [companyHandle, companyName, timeRange, multiplier]);

  // Sumas Totais Consolidadas
  const totalFollowers = profileMetrics.reduce((acc, m) => acc + m.followers, 0);
  const totalViews = profileMetrics.reduce((acc, m) => acc + m.views, 0);
  const totalInteractions = profileMetrics.reduce((acc, m) => acc + m.interactions, 0);
  const totalLeads = profileMetrics.reduce((acc, m) => acc + m.leads, 0);
  const estimatedRevenue = totalLeads * 14.5; // Ticket médio genérico estimado

  // Histórico de Posts Multicanal com Rastreamento Unificado
  const omnichannelPosts = useMemo(() => {
    return [
      {
        id: "post-1",
        title: "Lançamento da Nova Versão e Demonstração Prática",
        date: "Publicado há 3 dias via CRM",
        isCrmPublished: true,
        masterType: "video",
        totalViews: "138.8K",
        totalInteractions: "9.7K",
        cpsScore: 94,
        topPlatform: "YouTube Shorts",
        aiInsight: "O YouTube Shorts reteve 84% do público nos primeiros 15s gerando 4.8K curtidas, enquanto o TikTok atraiu o maior volume de perguntas sobre contratação nos comentários.",
        breakdown: [
          { platform: "youtube", name: "YouTube Shorts", views: "68.1K", likes: "4.8K", leads: 48, retention: "84%", sharePct: 49 },
          { platform: "tiktok", name: "TikTok", views: "45.2K", likes: "3.4K", leads: 62, retention: "68%", sharePct: 33 },
          { platform: "instagram", name: "Instagram Reels", views: "18.4K", likes: "1.2K", leads: 22, retention: "54%", sharePct: 13 },
          { platform: "facebook", name: "Facebook Vídeo", views: "7.1K", likes: "340", leads: 8, retention: "42%", sharePct: 5 },
        ],
      },
      {
        id: "post-2",
        title: "Como Otimizar Processos e Reduzir Custos Operacionais",
        date: "Publicado há 8 dias via CRM",
        isCrmPublished: true,
        masterType: "video",
        totalViews: "156.9K",
        totalInteractions: "12.4K",
        cpsScore: 96,
        topPlatform: "TikTok",
        aiInsight: "O TikTok alcançou pico viral com 84.0K views graças ao áudio em alta e gancho provocativo, gerando mais de 90 contatos diretos no WhatsApp da empresa.",
        breakdown: [
          { platform: "tiktok", name: "TikTok", views: "84.0K", likes: "6.8K", leads: 94, retention: "74%", sharePct: 54 },
          { platform: "youtube", name: "YouTube Shorts", views: "41.5K", likes: "3.2K", leads: 38, retention: "71%", sharePct: 26 },
          { platform: "instagram", name: "Instagram Reels", views: "22.0K", likes: "1.9K", leads: 29, retention: "62%", sharePct: 14 },
          { platform: "facebook", name: "Facebook Vídeo", views: "9.4K", likes: "510", leads: 12, retention: "39%", sharePct: 6 },
        ],
      },
      {
        id: "post-3",
        title: "Guia Completo: Novidades e Atualizações do Mês",
        date: "Publicado há 14 dias via CRM",
        isCrmPublished: true,
        masterType: "video",
        totalViews: "84.1K",
        totalInteractions: "5.8K",
        cpsScore: 88,
        topPlatform: "YouTube Shorts",
        aiInsight: "Vídeo com maior tempo de tela cumulativo (mais de 1.400 horas assistidas). Ideal como conteúdo educacional de topo e meio de funil.",
        breakdown: [
          { platform: "youtube", name: "YouTube Shorts", views: "34.0K", likes: "2.5K", leads: 24, retention: "78%", sharePct: 40 },
          { platform: "tiktok", name: "TikTok", views: "29.1K", likes: "2.1K", leads: 32, retention: "58%", sharePct: 35 },
          { platform: "instagram", name: "Instagram Reels", views: "14.2K", likes: "980", leads: 16, retention: "49%", sharePct: 17 },
          { platform: "facebook", name: "Facebook Vídeo", views: "6.8K", likes: "290", leads: 6, retention: "35%", sharePct: 8 },
        ],
      },
      {
        id: "post-4",
        title: "Banner Institucional de Atendimento e Horários",
        date: "Sincronizado Externo (Instagram & Facebook)",
        isCrmPublished: false,
        masterType: "image",
        totalViews: "18.2K",
        totalInteractions: "840",
        cpsScore: 71,
        topPlatform: "Instagram",
        aiInsight: "Publicação estática externa. Teve bom engajamento na base existente de seguidores, mas sem alcance viral algorítmico comparado aos vídeos.",
        breakdown: [
          { platform: "instagram", name: "Instagram Post", views: "12.4K", likes: "620", leads: 9, retention: "—", sharePct: 68 },
          { platform: "facebook", name: "Facebook Post", views: "5.8K", likes: "220", leads: 4, retention: "—", sharePct: 32 },
        ],
      },
    ];
  }, []);

  // Filtragem dos posts por origem
  const filteredPosts = useMemo(() => {
    return omnichannelPosts.filter((p) => {
      if (originFilter === "crm" && !p.isCrmPublished) return false;
      if (originFilter === "external" && p.isCrmPublished) return false;
      return true;
    });
  }, [omnichannelPosts, originFilter]);

  // Insights Estratégicos & Recomendações
  const strategicInsights = useMemo(() => {
    return [
      {
        type: "action",
        title: "Recomendação de Próxima Ação (Next Best Action)",
        icon: Target,
        color: "text-primary",
        border: "border-primary/30",
        bg: "bg-primary/5",
        badge: "Alta Prioridade",
        text: `O conteúdo sobre 'Otimização e Redução de Custos' atingiu 156.9K visualizações globais com 96 pontos no CPS. Recomendamos publicar um vídeo com depoimento de cliente nesta Quinta-feira às 18:30 para acelerar o fechamento de vendas.`,
      },
      {
        type: "warning",
        title: "Alerta de Fadiga de Criativo",
        icon: AlertTriangle,
        color: "text-amber-500",
        border: "border-amber-500/30",
        bg: "bg-amber-500/5",
        badge: "Atenção",
        text: `A publicação de 'Novidades e Atualizações' está há 14 dias no ar e suas impressões diárias recuaram 24%. Recomendamos renovar a thumbnail ou reutilizar os melhores trechos em um formato de corte curto (reels/shorts).`,
      },
      {
        type: "conversion",
        title: "Diferença Real Entre Redes (A/B Test Orgânico)",
        icon: Lightbulb,
        color: "text-emerald-500",
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/5",
        badge: "Insight de Performance",
        text: `Para o mesmo vídeo subido via CRM, o TikTok entregou em média 2.8x mais alcance rápido nas primeiras 48h, enquanto o YouTube Shorts continuou gerando 35% das visualizações após a segunda semana de publicação.`,
      },
      {
        type: "channel",
        title: "Atribuição Comercial e Canal Recomendado",
        icon: Sparkles,
        color: "text-blue-500",
        border: "border-blue-500/30",
        bg: "bg-blue-500/5",
        badge: "Estratégia Omnicanal",
        text: `O Instagram registrou a maior taxa de conversão final por visualização (18.5%), sendo o destino ideal para links diretos de WhatsApp e agendamentos com vendedores.`,
      },
    ];
  }, []);

  // Benchmarking por Formato
  const formatBenchmarks = [
    {
      format: "Vídeo Curto Vertical (Reels / Shorts / TikTok)",
      share: "86% do alcance global",
      cps: 94,
      leadsRatio: "15.4%",
      icon: Film,
      hint: "Principal responsável por trazer clientes novos que ainda não conheciam a sua marca.",
    },
    {
      format: "Banner Promocional / Imagem Estática",
      share: "9% do alcance global",
      cps: 72,
      leadsRatio: "8.1%",
      icon: ImageIcon,
      hint: "Excelente para comunicar avisos urgentes, prazos e condições comerciais diretas.",
    },
    {
      format: "Carrossel Explicativo (Passo a Passo)",
      share: "5% do alcance global",
      cps: 82,
      leadsRatio: "11.6%",
      icon: Layers,
      hint: "Gera a maior quantidade de compartilhamentos e salvamentos entre equipes.",
    },
  ];

  const bestHours = [
    { day: "Segunda-feira", time: "18:30 - 20:00", score: "88/100", hint: "Pico de visualizações no TikTok", platform: "TikTok" },
    { day: "Terça-feira", time: "19:00 - 21:00", score: "92/100", hint: "Maior retenção no YouTube Shorts", platform: "Shorts" },
    { day: "Quinta-feira", time: "18:00 - 20:30", score: "96/100", hint: "Melhor dia para ofertas e lançamentos comerciais", platform: "Geral" },
    { day: "Sábado", time: "13:30 - 16:00", score: "98/100", hint: "Maior taxa de viralidade e compartilhamentos", platform: "Multicanal" },
  ];

  // Copiar resumo executivo para WhatsApp ou relatório
  const handleCopySummary = () => {
    const summary = `📊 *RELATÓRIO EXECUTIVO DE REDES SOCIAIS & INTELIGÊNCIA COMERCIAL*\nEmpresa: ${companyName}\nPeríodo: ${timeRange.toUpperCase()}\n\n👥 Audiência Consolidada: ${totalFollowers.toLocaleString()} seguidores (4 plataformas)\n👀 Visualizações Globais: ${totalViews.toLocaleString()}\n💬 Interações Totais: ${totalInteractions.toLocaleString()}\n🎯 Oportunidades Identificadas: ${totalLeads} leads com intenção de compra\n💰 Pipeline Estimado: $${estimatedRevenue.toLocaleString()} USD em vendas potenciais\n\n🏆 Desempenho por Canal:\n• TikTok: 142K views (Maior volume de perguntas sobre contratação)\n• YouTube Shorts: 285K views (Líder em retenção e tempo de tela)\n• Instagram: 68K views (Maior taxa de conversão direta em vendas)\n• Facebook: 32K views (Alcance qualificado de público maduro)\n\nRelatório gerado pelo Capi Conversa CRM.`;
    navigator.clipboard.writeText(summary);
    toast.success("Relatório executivo copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6">
      {/* Banner de Demonstração / Homologação */}
      <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs text-primary-900 dark:text-primary-200">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <div>
          <span className="font-bold uppercase tracking-wider text-[10px] mr-1.5 px-1.5 py-0.5 rounded bg-primary/20">
            DEMO / Métricas Simuladas
          </span>
          <span>
            Os dados consolidados abaixo exibem uma prévia da inteligência e análise comparativa de conteúdo. A sincronização de métricas reais será ativada conforme cada conta for conectada com permissões oficiais de Insights (Meta Graph, YouTube Analytics e TikTok Display).
          </span>
        </div>
      </div>

      {/* Cabeçalho, Filtros de Período & Ações */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">
              Painel Geral de Redes & Inteligência Capiversa
            </h2>
            <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/30 uppercase">
              Omnichannel
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Métricas unificadas em tempo real com rastreamento diferencial para conteúdos publicados via CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Copiar Resumo Executivo */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="h-8 text-xs gap-1.5 border-[color:var(--hairline)] hover:bg-muted font-medium"
            title="Copiar relatório formatado para reuniões ou clientes"
          >
            <Copy className="size-3.5 text-primary" />
            <span>Copiar Relatório</span>
          </Button>

          {/* Seletor de Período Ampliado */}
          <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-[color:var(--hairline)]">
            <button
              type="button"
              onClick={() => setTimeRange("today")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeRange === "today" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("7d")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeRange === "7d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("30d")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeRange === "30d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("90d")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeRange === "90d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              90 dias
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("year")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeRange === "year" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Este Ano
            </button>
          </div>
        </div>
      </div>

      {/* 1. Sumas Totais Consolidadas de Negócio (Executive Matrix) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-primary" />
            <span>Sumas Totais Consolidadas (Meta, TikTok e YouTube)</span>
          </h3>
          <span className="text-[11px] text-muted-foreground">Métricas consolidadas sem duplicações</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Total Visualizações */}
          <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Visualizações Totais</span>
              <Eye className="size-4 text-primary" />
            </div>
            <div className="text-2xl font-extrabold text-foreground tracking-tight">
              {totalViews.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp className="size-3" />
              <span>+34.8% vs. período anterior</span>
            </p>
          </div>

          {/* Total Seguidores / Audiência */}
          <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Audiência Global</span>
              <Users className="size-4 text-primary" />
            </div>
            <div className="text-2xl font-extrabold text-foreground tracking-tight">
              {totalFollowers.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp className="size-3" />
              <span>+{timeRange === "today" ? "96" : timeRange === "7d" ? "790" : timeRange === "year" ? "18,950" : "2,720"} novos seguidores</span>
            </p>
          </div>

          {/* Total Interações */}
          <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Interações Totais</span>
              <MessageSquare className="size-4 text-primary" />
            </div>
            <div className="text-2xl font-extrabold text-foreground tracking-tight">
              {totalInteractions.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Curtidas, comentários e shares
            </p>
          </div>

          {/* Oportunidades / Leads de Vendas */}
          <div className="p-4 rounded-2xl bg-[var(--panel)] border border-amber-500/30 shadow-sm space-y-1 ring-1 ring-amber-500/15">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                <Flame className="size-3.5 fill-amber-500 text-amber-500" /> Leads de Venda
              </span>
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                14.6%
              </Badge>
            </div>
            <div className="text-2xl font-extrabold text-foreground tracking-tight">
              {totalLeads} leads
            </div>
            <p className="text-[11px] text-muted-foreground">
              Interações com intenção comercial
            </p>
          </div>

          {/* Pipeline de Vendas Estimado */}
          <div className="p-4 rounded-2xl bg-[var(--panel)] border border-emerald-500/30 shadow-sm space-y-1 ring-1 ring-emerald-500/15">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <DollarSign className="size-3.5 text-emerald-600" /> Pipeline Estimado
              </span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                Orgânico
              </span>
            </div>
            <div className="text-2xl font-extrabold text-foreground tracking-tight">
              ${estimatedRevenue.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">USD</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sem custo com anúncios pagos
            </p>
          </div>
        </div>
      </div>

      {/* 2. Módulo Especial: "Diferencial Multicanal por Publicação (Rastreamento CRM)" */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" />
              <span>Diferencial Entre Plataformas (Mesmo Vídeo nas 4 Redes)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Como nossos vídeos foram publicados simultaneamente pelo CRM, podemos avaliar a performance de cada algoritmo em condições idênticas.
            </p>
          </div>

          {/* Filtro de Origem: Todos vs Publicados via CRM vs Externos */}
          <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-[color:var(--hairline)] shrink-0">
            <button
              type="button"
              onClick={() => setOriginFilter("all")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                originFilter === "all" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter("crm")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition flex items-center gap-1 ${
                originFilter === "crm" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="size-3" />
              <span>Via CRM ({omnichannelPosts.filter((p) => p.isCrmPublished).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter("external")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                originFilter === "external" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Externos
            </button>
          </div>
        </div>

        {/* Cards de Publicações com Diferencial e Gráfico de Barras */}
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const isSelected = selectedPostDetail === post.id;

            return (
              <div
                key={post.id}
                className="p-5 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-4 shadow-sm hover:border-primary/30 transition-all"
              >
                {/* Linha Superior: Título, Badge de Origem CRM e Vencedor */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[color:var(--hairline)]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{post.title}</span>
                      {post.isCrmPublished ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          <span>Rastreamento CRM Ativo</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Post Sincronizado
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{post.date}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Score CPS</span>
                      <span className="text-sm font-extrabold text-primary">{post.cpsScore}/100</span>
                    </div>
                    <Badge variant="secondary" className="text-xs font-bold py-1 px-2.5">
                      🏆 Canal Líder: {post.topPlatform}
                    </Badge>
                  </div>
                </div>

                {/* Gráfico Visual de Barras: Participação de Views de Cada Rede */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                    <span>Divisão de Visualizações por Rede Social:</span>
                    <span className="font-bold text-foreground">{post.totalViews} views totais</span>
                  </div>

                  <div className="w-full h-3.5 rounded-full flex overflow-hidden gap-0.5 bg-muted/40 shadow-inner">
                    {post.breakdown.map((b, idx) => (
                      <div
                        key={idx}
                        style={{ width: `${b.sharePct}%` }}
                        className={`${
                          b.platform === "tiktok"
                            ? "bg-foreground"
                            : b.platform === "youtube"
                            ? "bg-[#FF0000]"
                            : b.platform === "instagram"
                            ? "bg-[#E1306C]"
                            : "bg-[#0084FF]"
                        }`}
                        title={`${b.name}: ${b.sharePct}% (${b.views})`}
                      />
                    ))}
                  </div>
                </div>

                {/* Grade Comparativa Lado a Lado das Redes */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                  {post.breakdown.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-muted/30 border border-[color:var(--hairline)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          {b.platform === "tiktok" && <TikTokGlyph className="size-3.5" />}
                          {b.platform === "youtube" && <YouTubeGlyph className="size-3.5 text-[#FF0000]" />}
                          {b.platform === "instagram" && <InstagramGlyph className="size-3.5 text-[#E1306C]" />}
                          {b.platform === "facebook" && <FacebookGlyph className="size-3.5 text-[#0084FF]" />}
                          <span className="truncate">{b.name}</span>
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">{b.sharePct}%</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 pt-1 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Views</span>
                          <span className="font-extrabold text-foreground">{b.views}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Likes</span>
                          <span className="font-bold text-muted-foreground">{b.likes}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[color:var(--hairline)] text-[10.5px]">
                        <span className="text-amber-600 font-semibold">{b.leads} leads</span>
                        <span className="text-muted-foreground">Retenção: {b.retention}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Insight da IA para essa Publicação Específica */}
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-foreground/90">
                  <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-primary font-bold">Diagnóstico Capiversa:</strong> {post.aiInsight}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Matriz de Atribuição Estratégica por Canal (Qual rede traz maior retorno?) */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Atribuição Estratégica: O Papel de Cada Canal no Funil de Vendas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {profileMetrics.map((pm, idx) => {
            const Icon = pm.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-3 shadow-sm hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border shrink-0 ${pm.badgeBg}`}>
                    <Icon className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{pm.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{pm.username}</p>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-muted/40 border border-[color:var(--hairline)] space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Função no Funil</span>
                  <p className="text-xs font-bold text-foreground">{pm.role}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Audiência</span>
                    <span className="font-extrabold text-foreground">{pm.followers.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Taxa de Conversão</span>
                    <span className="font-extrabold text-emerald-600">{pm.conversionRate}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10.5px] pt-1 border-t border-[color:var(--hairline)]">
                  <span className="text-emerald-600 font-semibold">{pm.growth}</span>
                  <span className="text-muted-foreground font-medium">{pm.sharePercent}% do total</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Motor de Insights & Recomendações da IA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Insights Estratégicos & Recomendações da IA Capiversa
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">Baseado no histórico comparativo de postagens</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {strategicInsights.map((insight, idx) => {
            const Icon = insight.icon;
            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border ${insight.border} ${insight.bg} space-y-2 transition-all hover:shadow-md`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg bg-background border border-[color:var(--hairline)] shrink-0 ${insight.color}`}>
                      <Icon className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">{insight.title}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold border-current shrink-0">
                    {insight.badge}
                  </Badge>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-medium pl-1">
                  {insight.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Benchmarking por Formato de Conteúdo */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Benchmark de Formatos: O Que Mais Gera Retorno
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {formatBenchmarks.map((fb, idx) => {
            const Icon = fb.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-2.5 shadow-sm hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">{fb.format}</span>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                    CPS {fb.cps}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-[10.5px] text-muted-foreground">Participação</span>
                    <p className="font-semibold text-foreground">{fb.share}</p>
                  </div>
                  <div>
                    <span className="text-[10.5px] text-muted-foreground">Taxa de Compra</span>
                    <p className="font-semibold text-emerald-600">{fb.leadsRatio}</p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-tight pt-1 border-t border-[color:var(--hairline)]">
                  {fb.hint}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Mapa de Calor Propietario (Melhores Horários Recomendados) */}
      <div className="p-5 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Mapa de Calor: Melhores Horários Recomendados para Publicar
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Calculado com base nas primeiras 3 horas de alcance e interações dos seus posts
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {bestHours.map((bh, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-muted/40 border border-[color:var(--hairline)] space-y-1 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{bh.day}</span>
                <span className="text-xs font-bold text-emerald-600">{bh.score}</span>
              </div>
              <p className="text-sm font-extrabold text-primary">{bh.time}</p>
              <p className="text-[10px] text-muted-foreground">{bh.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
