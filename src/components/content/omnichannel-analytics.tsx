import { useState, useMemo } from "react";
import {
  TrendingUp,
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");

  // Multiplicadores dinâmicos para simular período selecionado
  const multiplier = timeRange === "7d" ? 0.35 : timeRange === "30d" ? 1 : 2.8;

  // Métricas de conta com dados e proporções calculadas
  const profileMetrics = useMemo(() => {
    return [
      {
        platform: "tiktok",
        name: "TikTok",
        username: "@cuentastupanas",
        followers: Math.round(18450 * (timeRange === "7d" ? 0.96 : timeRange === "90d" ? 1.12 : 1)),
        views: Math.round(142000 * multiplier),
        growth: timeRange === "7d" ? "+380 novos" : timeRange === "90d" ? "+4,120 novos" : "+1,240 este mês",
        icon: TikTokGlyph,
        color: "text-foreground",
        badgeBg: "bg-foreground/10 border-foreground/20 text-foreground",
        sharePercent: 33,
      },
      {
        platform: "youtube",
        name: "YouTube Shorts",
        username: "CuentasTuPana",
        followers: Math.round(9210 * (timeRange === "7d" ? 0.97 : timeRange === "90d" ? 1.09 : 1)),
        views: Math.round(285000 * multiplier),
        growth: timeRange === "7d" ? "+240 novos" : timeRange === "90d" ? "+2,680 novos" : "+820 este mês",
        icon: YouTubeGlyph,
        color: "text-[#FF0000]",
        badgeBg: "bg-[#FF0000]/10 border-[#FF0000]/20 text-[#FF0000]",
        sharePercent: 16,
      },
      {
        platform: "instagram",
        name: "Instagram",
        username: "cuentastupanas",
        followers: Math.round(12800 * (timeRange === "7d" ? 0.98 : timeRange === "90d" ? 1.07 : 1)),
        views: Math.round(68400 * multiplier),
        growth: timeRange === "7d" ? "+110 novos" : timeRange === "90d" ? "+1,420 novos" : "+450 este mês",
        icon: InstagramGlyph,
        color: "text-[#E1306C]",
        badgeBg: "bg-[#E1306C]/10 border-[#E1306C]/20 text-[#E1306C]",
        sharePercent: 23,
      },
      {
        platform: "facebook",
        name: "Facebook Page",
        username: "Cuentastupanas",
        followers: Math.round(15400 * (timeRange === "7d" ? 0.99 : timeRange === "90d" ? 1.04 : 1)),
        views: Math.round(32000 * multiplier),
        growth: timeRange === "7d" ? "+60 novos" : timeRange === "90d" ? "+710 novos" : "+210 este mês",
        icon: FacebookGlyph,
        color: "text-[#0084FF]",
        badgeBg: "bg-[#0084FF]/10 border-[#0084FF]/20 text-[#0084FF]",
        sharePercent: 28,
      },
    ];
  }, [timeRange, multiplier]);

  const totalFollowers = profileMetrics.reduce((acc, m) => acc + m.followers, 0);
  const totalViews = profileMetrics.reduce((acc, m) => acc + m.views, 0);

  // Comparativa de Publicação Multicanal (mismo video en las 4 redes)
  const comparativePosts = [
    {
      title: "Promo Streaming 50% OFF (Disney + Max)",
      date: "Publicado há 4 dias",
      tiktokViews: "45.2K",
      tiktokLikes: "3.4K",
      ytViews: "68.1K",
      ytLikes: "4.8K",
      igViews: "18.4K",
      igLikes: "1.2K",
      fbViews: "7.1K",
      fbLikes: "340",
      totalViews: "138.8K",
      topPlatform: "YouTube Shorts",
      cpsScore: 94,
    },
    {
      title: "Como ter Gemini Pro + 5TB por 18 meses",
      date: "Publicado há 9 dias",
      tiktokViews: "84.0K",
      tiktokLikes: "6.8K",
      ytViews: "41.5K",
      ytLikes: "3.2K",
      igViews: "22.0K",
      igLikes: "1.9K",
      fbViews: "9.4K",
      fbLikes: "510",
      totalViews: "156.9K",
      topPlatform: "TikTok",
      cpsScore: 96,
    },
    {
      title: "Canva Pro Anual Oficial com garantia de 12 meses",
      date: "Publicado há 14 dias",
      tiktokViews: "29.1K",
      tiktokLikes: "2.1K",
      ytViews: "34.0K",
      ytLikes: "2.5K",
      igViews: "14.2K",
      igLikes: "980",
      fbViews: "6.8K",
      fbLikes: "290",
      totalViews: "84.1K",
      topPlatform: "YouTube Shorts",
      cpsScore: 87,
    },
  ];

  const bestHours = [
    { day: "Segunda-feira", time: "18:30 - 20:00", score: "88/100", hint: "Pico de visualizações no TikTok", platform: "TikTok" },
    { day: "Terça-feira", time: "19:00 - 21:00", score: "92/100", hint: "Maior retenção no YouTube Shorts", platform: "Shorts" },
    { day: "Quinta-feira", time: "18:00 - 20:30", score: "95/100", hint: "Melhor dia para ofertas comerciais", platform: "Geral" },
    { day: "Sábado", time: "13:30 - 16:00", score: "98/100", hint: "Maior taxa de viralidade e compartilhamentos", platform: "Multicanal" },
  ];

  return (
    <div className="space-y-6">
      {/* Seletor de Período & Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <span>Painel Geral de Redes & Inteligência Capiversa</span>
            <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/30 uppercase">
              Algoritmo Propietário
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estatísticas oficiais a nível de perfil conectadas com nossos algoritmos de conversão e intenção comercial.
          </p>
        </div>

        {/* Seletor de Período 7d / 30d / 90d */}
        <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-[color:var(--hairline)] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTimeRange("7d")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              timeRange === "7d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            7 dias
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("30d")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              timeRange === "30d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            30 dias
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("90d")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              timeRange === "90d" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            90 dias
          </button>
        </div>
      </div>

      {/* 1. KPIs Gerais de Perfil (Seguidores & Visualizações Acumuladas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Seguidores */}
        <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Audiência Total (4 Redes)</span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            {totalFollowers.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp className="size-3" />
            <span>+{timeRange === "7d" ? "790" : timeRange === "90d" ? "8,930" : "2,720"} seguidores no período</span>
          </p>
        </div>

        {/* Visualizações Totais */}
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

        {/* Content Performance Score (Métrica Propietaria de Capiversa) */}
        <div className="p-4 rounded-2xl bg-[var(--panel)] border border-primary/30 shadow-sm space-y-1 ring-1 ring-primary/20">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium flex items-center gap-1">
              <Award className="size-3.5 text-primary" /> Score Capiversa (CPS)
            </span>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
              Excelente
            </Badge>
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight flex items-baseline gap-1">
            <span>89</span>
            <span className="text-xs font-semibold text-muted-foreground">/ 100</span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden mt-1">
            <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: "89%" }} />
          </div>
          <p className="text-[10.5px] text-muted-foreground pt-0.5">
            Top 10% no nicho de assinaturas digitais
          </p>
        </div>

        {/* Taxa de Intenção Comercial (Métrica Propietaria de Vendas) */}
        <div className="p-4 rounded-2xl bg-[var(--panel)] border border-amber-500/30 shadow-sm space-y-1 ring-1 ring-amber-500/10">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium flex items-center gap-1 text-amber-600">
              <Flame className="size-3.5 text-amber-500 fill-amber-500" /> Intenção de Compra
            </span>
            <span className="text-xs font-bold text-amber-500">14.6%</span>
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            1 em 7
          </div>
          <p className="text-[11px] text-muted-foreground">
            Comentam perguntando preço ou forma de pagamento
          </p>
        </div>
      </div>

      {/* Barra de Distribuição de Audiência por Plataforma */}
      <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-2 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Distribuição de Audiência por Rede Social</span>
          <span className="text-foreground font-bold">{totalFollowers.toLocaleString()} seguidores</span>
        </div>
        <div className="w-full h-3 rounded-full flex overflow-hidden gap-0.5 bg-muted/40">
          <div style={{ width: "33%" }} className="bg-foreground" title="TikTok: 33%" />
          <div style={{ width: "28%" }} className="bg-[#0084FF]" title="Facebook: 28%" />
          <div style={{ width: "23%" }} className="bg-[#E1306C]" title="Instagram: 23%" />
          <div style={{ width: "16%" }} className="bg-[#FF0000]" title="YouTube: 16%" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-foreground" /> TikTok (33%)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-[#0084FF]">
            <span className="size-2 rounded-full bg-[#0084FF]" /> Facebook (28%)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-[#E1306C]">
            <span className="size-2 rounded-full bg-[#E1306C]" /> Instagram (23%)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-[#FF0000]">
            <span className="size-2 rounded-full bg-[#FF0000]" /> YouTube (16%)
          </span>
        </div>
      </div>

      {/* 2. Estatísticas Individuais de Cada Perfil Conectado */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Estatísticas Detalhadas por Perfil Conectado
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

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[color:var(--hairline)]">
                  <div>
                    <span className="text-[10.5px] text-muted-foreground font-medium">Seguidores</span>
                    <p className="text-sm font-bold text-foreground">{pm.followers.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-[10.5px] text-muted-foreground font-medium">Views Acumuladas</span>
                    <p className="text-sm font-bold text-foreground">{pm.views.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10.5px] pt-1">
                  <span className="text-emerald-600 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    {pm.growth}
                  </span>
                  <span className="text-muted-foreground font-medium">{pm.sharePercent}% do total</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Comparador Multicanal (Rendimento do mesmo vídeo nas 4 redes) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Comparativo de Publicações Multicanal (Mesmo Vídeo nas 4 Redes)
          </h3>
          <span className="text-xs text-muted-foreground">Onde seu conteúdo mais converte</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[color:var(--hairline)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[color:var(--hairline)] bg-muted/20 text-muted-foreground font-semibold">
                <th className="p-3.5 min-w-[220px]">Título da Campanha</th>
                <th className="p-3.5 text-center min-w-[100px]">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <TikTokGlyph className="size-3" /> TikTok
                  </span>
                </th>
                <th className="p-3.5 text-center min-w-[100px]">
                  <span className="inline-flex items-center gap-1 font-bold text-[#FF0000]">
                    <YouTubeGlyph className="size-3" /> Shorts
                  </span>
                </th>
                <th className="p-3.5 text-center min-w-[100px]">
                  <span className="inline-flex items-center gap-1 font-bold text-[#E1306C]">
                    <InstagramGlyph className="size-3" /> Reels
                  </span>
                </th>
                <th className="p-3.5 text-center min-w-[100px]">
                  <span className="inline-flex items-center gap-1 font-bold text-[#0084FF]">
                    <FacebookGlyph className="size-3" /> Facebook
                  </span>
                </th>
                <th className="p-3.5 text-center font-bold min-w-[100px]">Total Acumulado</th>
                <th className="p-3.5 text-center min-w-[90px]">Score CPS</th>
                <th className="p-3.5 min-w-[120px]">Rede Campeã</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--hairline)]">
              {comparativePosts.map((post, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5">
                    <p className="font-bold text-foreground">{post.title}</p>
                    <p className="text-[10px] text-muted-foreground">{post.date}</p>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold">{post.tiktokViews}</span>
                    <span className="block text-[10px] text-muted-foreground">{post.tiktokLikes} likes</span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold">{post.ytViews}</span>
                    <span className="block text-[10px] text-muted-foreground">{post.ytLikes} likes</span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold">{post.igViews}</span>
                    <span className="block text-[10px] text-muted-foreground">{post.igLikes} likes</span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="font-bold">{post.fbViews}</span>
                    <span className="block text-[10px] text-muted-foreground">{post.fbLikes} likes</span>
                  </td>
                  <td className="p-3.5 text-center font-extrabold text-primary">
                    {post.totalViews}
                  </td>
                  <td className="p-3.5 text-center">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                      {post.cpsScore}/100
                    </Badge>
                  </td>
                  <td className="p-3.5">
                    <Badge variant="secondary" className="font-semibold text-[10px]">
                      🏆 {post.topPlatform}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Mapa de Calor Propietario (Melhores Horários de Postagem) */}
      <div className="p-5 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Mapa de Calor: Melhores Horários Recomendados
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
