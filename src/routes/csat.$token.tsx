import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCsatByToken, submitCsat } from "@/lib/csat.functions";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/csat/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Avalie nosso atendimento" },
      { name: "description", content: "Leva 1 minuto: dê sua nota e deixe um comentário sobre o atendimento." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Avalie nosso atendimento" },
      { property: "og:description", content: "Leva 1 minuto: dê sua nota e deixe um comentário sobre o atendimento." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `https://metrixcrm.com.br/csat/${params.token}` },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `https://metrixcrm.com.br/csat/${params.token}` }],
  }),
  component: CsatPage,
});


function CsatPage() {
  const { token } = Route.useParams();
  const get = useServerFn(getCsatByToken);
  const submit = useServerFn(submitCsat);

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<{ found: boolean; respondido?: boolean; empresa?: string; primaryColor?: string } | null>(null);
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setState(await get({ data: { token } }) as any); }
      finally { setLoading(false); }
    })();
  }, [token]);

  async function handleSubmit() {
    if (score < 1) { setError("Selecione uma nota."); return; }
    setSending(true); setError(null);
    try {
      await submit({ data: { token, score, comentario: comentario.trim() || undefined } });
      setSubmitted(true);
    } catch (e: any) { setError(e?.message ?? "Erro ao enviar."); }
    finally { setSending(false); }
  }

  const accent = state?.primaryColor || "#0B22FE";

  // Shell with subtle themed background using the company's primary color
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#F8F9FB] text-[#0A0A0F] flex items-center justify-center px-5 py-10 sm:py-14">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              `linear-gradient(to right, ${accent}0D 1px, transparent 1px), linear-gradient(to bottom, ${accent}0D 1px, transparent 1px)`,
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
          }}
        />
        <div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 60%)` }}
        />
        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 65%)` }}
        />
      </div>
      {children}
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <Loader2 className="size-8 animate-spin" style={{ color: accent }} />
      </Shell>
    );
  }

  if (!state?.found) {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 sm:p-10 text-center shadow-[0_20px_60px_-30px_rgba(0,0,0,0.15)]">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-black/5">
            <AlertCircle className="size-8 text-black/40" />
          </div>
          <h1 className="mt-5 text-xl font-bold">Pesquisa indisponível</h1>
          <p className="mt-2 text-sm text-black/60">
            Este link de avaliação não foi encontrado ou já expirou.
          </p>
        </div>
      </Shell>
    );
  }

  if (state.respondido || submitted) {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 sm:p-10 text-center shadow-[0_20px_60px_-30px_rgba(0,0,0,0.15)]">
          <div
            className="mx-auto grid size-20 place-items-center rounded-full"
            style={{ background: `${accent}15` }}
          >
            <CheckCircle2 className="size-11" style={{ color: accent }} />
          </div>
          <h1 className="mt-6 text-2xl sm:text-3xl font-black tracking-tight">Obrigado!</h1>
          <p className="mt-3 text-base text-black/60 max-w-xs mx-auto">
            Sua avaliação foi registrada com sucesso. Isso nos ajuda muito a melhorar.
          </p>
        </div>
      </Shell>
    );
  }

  const labels = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];
  const active = hover || score;

  return (
    <Shell>
      <div className="w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 sm:p-10 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.18)]">
        <div className="text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ background: `${accent}12`, color: accent }}
          >
            Pesquisa de satisfação
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-black tracking-tight text-[#0A0A0F]">
            Como foi seu atendimento
            {state.empresa ? (
              <>
                <br className="hidden sm:block" />
                <span> na {state.empresa}</span>
              </>
            ) : null}?
          </h1>
          <p className="mt-2 text-sm text-black/55">Sua opinião nos ajuda a melhorar.</p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5 sm:gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`Nota ${n}`}
              className="p-1.5 rounded-xl transition-all hover:scale-110 active:scale-95"
            >
              <Star
                className="size-10 sm:size-12 transition-colors"
                fill={n <= active ? accent : "transparent"}
                stroke={n <= active ? accent : "#0A0A0F33"}
                strokeWidth={1.75}
              />
            </button>
          ))}
        </div>

        <div className="mt-3 h-6 text-center">
          {active > 0 && (
            <p className="text-sm font-semibold" style={{ color: accent }}>
              {labels[active]}
            </p>
          )}
        </div>

        <div className="mt-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-black/50 mb-2">
            Comentário (opcional)
          </label>
          <Textarea
            placeholder="Conte um pouco mais sobre sua experiência..."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={4}
            className="resize-none rounded-xl border-black/10 focus-visible:border-transparent focus-visible:ring-2"
            style={{ ["--tw-ring-color" as any]: accent }}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm font-medium text-red-600 flex items-center gap-2">
            <AlertCircle className="size-4" /> {error}
          </p>
        )}

        <Button
          className="w-full mt-6 h-12 rounded-xl text-base font-semibold shadow-lg transition-all hover:brightness-110 hover:shadow-xl disabled:opacity-60"
          onClick={handleSubmit}
          disabled={sending}
          style={{ background: accent, color: "white", boxShadow: `0 10px 30px -10px ${accent}80` }}
        >
          {sending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
          Enviar avaliação
        </Button>

        <p className="mt-5 text-center text-[11px] text-black/40">
          Powered by <span className="font-semibold">Capi Conversa</span>
        </p>
      </div>
    </Shell>
  );
}
