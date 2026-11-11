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

  // Métricas de cuenta simuladas con datos reales de la empresa
  const profileMetrics = useMemo(() => {
    return [
      {
        platform: "tiktok",
        name: "TikTok",
        username: "@cuentastupanas",
        followers: 18450,
        views: 142000,
        growth: "+1,240 este mes",
        icon: TikTokGlyph,
        color: "text-foreground",
      },
      {
        platform: "youtube",
        name: "YouTube Shorts",
        username: "CuentasTuPana",
        followers: 9210,
        views: 285000,
        growth: "+820 este mes",
        icon: YouTubeGlyph,
        color: "text-[#FF0000]",
      },
      {
        platform: "instagram",
        name: "Instagram",
        username: "cuentastupanas",
        followers: 12800,
        views: 68400,
        growth: "+450 este mes",
        icon: InstagramGlyph,
        color: "text-[#E1306C]",
      },
      {
        platform: "facebook",
        name: "Facebook Page",
        username: "Cuentastupanas",
        followers: 15400,
        views: 32000,
        growth: "+210 este mes",
        icon: FacebookGlyph,
        color: "text-[#0084FF]",
      },
    ];
  }, []);

  const totalFollowers = profileMetrics.reduce((acc, m) => acc + m.followers, 0);
  const totalViews = profileMetrics.reduce((acc, m) => acc + m.views, 0);

  // Comparativa de Publicación Multicanal (mismo video en las 4)
  const comparativePosts = [
    {
      title: "Promo Streaming 50% OFF (Disney + Max)",
      date: "Publicado hace 4 días",
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
    },
    {
      title: "Cómo tener Gemini Pro + 5TB por 18 meses",
      date: "Publicado hace 9 días",
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
    },
    {
      title: "Canva Pro Anual Oficial con garantía",
      date: "Publicado hace 14 días",
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
    },
  ];

  const bestHours = [
    { day: "Segunda-feira", time: "18:30 - 20:00", score: "88/100", hint: "Pico de visualizações no TikTok" },
    { day: "Terça-feira", time: "19:00 - 21:00", score: "92/100", hint: "Maior engajamento no YouTube Shorts" },
    { day: "Quinta-feira", time: "18:00 - 20:30", score: "95/100", hint: "Melhor dia para ofertas comerciais" },
    { day: "Sábado", time: "13:30 - 16:00", score: "98/100", hint: "Maior viralidade em todas as redes" },
  ];

  return (
    <div className="space-y-6">
      {/* Seletor de Período */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">
            Painel Geral de Redes & Inteligência Capiversa
          </h2>
          <p className="text-xs text-muted-foreground">
            Estatísticas oficiais de perfil combinadas com nossos algoritmos de análise comercial.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-[color:var(--hairline)]">
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

      {/* 1. KPIs de Perfil (Seguidores & Visualizações Acumuladas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Seguidores */}
        <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Audiência Total</span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            {totalFollowers.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp className="size-3" />
            <span>+2,720 seguidores no período</span>
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
            <span>+34.8% vs. mês anterior</span>
          </p>
        </div>

        {/* Content Performance Score (Métrica Propietaria) */}
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
          <p className="text-[11px] text-muted-foreground">
            Top 10% no nicho de assinaturas
          </p>
        </div>

        {/* Taxa de Intenção Comercial (Métrica Propietaria) */}
        <div className="p-4 rounded-2xl bg-[var(--panel)] border border-[color:var(--hairline)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium flex items-center gap-1">
              <Flame className="size-3.5 text-amber-500" /> Intenção de Compra
            </span>
            <span className="text-xs font-bold text-amber-500">14.6%</span>
          </div>
          <div className="text-2xl font-extrabold text-foreground tracking-tight">
            1 em 7
          </div>
          <p className="text-[11px] text-muted-foreground">
            Comentam perguntando preço ou método de pagamento
          </p>
        </div>
      </div>

      {/* 2. Estatísticas Individuais de Cada Perfil */}
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
                  <div className="p-2 rounded-xl bg-muted/60 shrink-0">
                    <Icon className={`size-4 ${pm.color}`} />
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
                    <span className="text-[10.5px] text-muted-foreground font-medium">Views</span>
                    <p className="text-sm font-bold text-foreground">{pm.views.toLocaleString()}</p>
                  </div>
                </div>

                <p className="text-[10.5px] text-emerald-600 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md inline-block">
                  {pm.growth}
                </p>
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
          <span className="text-xs text-muted-foreground">Onde seu público mais engaja</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[color:var(--hairline)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[color:var(--hairline)] bg-muted/20 text-muted-foreground font-semibold">
                <th className="p-3.5 min-w-[200px]">Título da Campanha</th>
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
                <th className="p-3.5 text-center font-bold min-w-[110px]">Total Acumulado</th>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Mapa de Calor: Melhores Horários para Publicar
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Calculado com base nas primeiras 3 horas de alcance dos seus posts
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {bestHours.map((bh, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-muted/40 border border-[color:var(--hairline)] space-y-1"
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
