import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getPublicLeadForm } from "@/lib/lead-forms.functions";
import { DEFAULT_THEME, type FormField, type FormTheme } from "@/lib/lead-forms-types";
import { CheckCircle2, Loader2 } from "lucide-react";

async function loadFormWithTimeout(slug: string, ms: number) {
  return await Promise.race([
    getPublicLeadForm({ data: { slug } }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export const Route = createFileRoute("/f/$slug")({
  loader: async ({ params }) => {
    // Banco lento não pode derrubar a página: tentamos duas vezes e, se falhar,
    // a página carrega e busca os dados no navegador.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const form = await loadFormWithTimeout(params.slug, 3500);
        if (!form) throw notFound();
        return { form, slug: params.slug };
      } catch (err) {
        if (err && typeof err === "object" && "isNotFound" in (err as any)) throw err;
        if (attempt === 1) return { form: null, slug: params.slug };
      }
    }
    return { form: null, slug: params.slug };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.form?.theme ?? {};
    const title = t.titulo || loaderData?.form?.nome || "Formulário";
    const desc = t.subtitulo || "Preencha seus dados e nossa equipe entra em contato.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  errorComponent: () => <Fallback texto="Não foi possível carregar este formulário." />,
  notFoundComponent: () => <Fallback texto="Formulário não encontrado ou desativado." />,
  component: PublicFormGate,
});

function PublicFormGate() {
  const { form: ssrForm, slug } = Route.useLoaderData();
  const [form, setForm] = useState<any>(ssrForm);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (form) return;
    let vivo = true;
    (async () => {
      try {
        const f = await getPublicLeadForm({ data: { slug } });
        if (!vivo) return;
        if (f) setForm(f);
        else setFalhou(true);
      } catch {
        if (vivo) setFalhou(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [form, slug]);

  if (form) return <PublicForm form={form} />;
  if (falhou) return <Fallback texto="Não foi possível carregar este formulário. Atualize a página." />;
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <Loader2 className="size-6 animate-spin text-slate-400" />
    </div>
  );
}


function Fallback({ texto }: { texto: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6 text-center">
      <p className="text-slate-600">{texto}</p>
    </div>
  );
}

const RADIUS: Record<string, string> = { suave: "0.5rem", medio: "1rem", pill: "1.75rem" };

function PublicForm({ form }: { form: any }) {
  const theme: FormTheme = { ...DEFAULT_THEME, ...(form.theme ?? {}) };
  const campos: FormField[] = Array.isArray(form.campos) ? form.campos : [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const tracking = useMemo(() => {
    if (typeof window === "undefined") return {};
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_term: p.get("utm_term"),
      utm_content: p.get("utm_content"),
      gclid: p.get("gclid"),
      fbclid: p.get("fbclid"),
      referrer: document.referrer || null,
      first_page: window.location.href,
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSending(true);
    try {
      const r = await fetch("/api/public/form-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: form.id, campos: values, hp, tracking }),
      });
      if (!r.ok) throw new Error(await r.text());
      const json = await r.json();
      if (json.redirect) {
        window.location.href = json.redirect;
        return;
      }
      setDone(json.mensagem || form.mensagem_sucesso);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  const radius = RADIUS[theme.arredondamento] ?? RADIUS.medio;
  const bgStyle: React.CSSProperties = theme.imagemFundo
    ? { backgroundImage: `url(${theme.imagemFundo})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: theme.corFundo };

  const card = (
    <div
      className="w-full max-w-md bg-white shadow-xl p-6 sm:p-8"
      style={{ borderRadius: radius, color: theme.corTexto }}
    >
      {theme.logoUrl && (
        <img src={theme.logoUrl} alt="Logo" className="h-10 mb-5 object-contain" />
      )}
      <h1 className="text-2xl font-bold leading-tight">{theme.titulo}</h1>
      {theme.subtitulo && <p className="mt-2 text-sm opacity-70">{theme.subtitulo}</p>}

      {done ? (
        <div className="mt-6 flex flex-col items-center text-center gap-3 py-6">
          <CheckCircle2 className="size-12" style={{ color: theme.corPrimaria }} />
          <p className="font-medium">{done}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            className="hidden"
            aria-hidden="true"
          />
          {campos.map((f) => (
            <div key={f.id} className="space-y-1">
              <label className="text-xs font-semibold opacity-80" htmlFor={f.id}>
                {f.label} {f.obrigatorio && <span style={{ color: theme.corPrimaria }}>*</span>}
              </label>
              <FieldInput
                field={f}
                radius={radius}
                value={values[f.id] ?? ""}
                onChange={(v) => setValues((p) => ({ ...p, [f.id]: v }))}
              />
            </div>
          ))}
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <button
            type="submit"
            disabled={sending}
            className="w-full h-12 font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: theme.corPrimaria, borderRadius: radius }}
          >
            {sending && <Loader2 className="size-4 animate-spin" />}
            {theme.textoBotao}
          </button>
          {theme.rodape && <p className="text-[11px] text-center opacity-60 pt-1">{theme.rodape}</p>}
        </form>
      )}
    </div>
  );

  if (theme.layout === "dividido") {
    return (
      <div className="min-h-screen grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-center gap-5 p-12 text-white" style={{ background: theme.corPrimaria }}>
          {theme.logoUrl && <img src={theme.logoUrl} alt="Logo" className="h-10 w-auto self-start object-contain" />}
          <h2 className="text-4xl font-bold leading-tight">{theme.titulo}</h2>
          {theme.subtitulo && <p className="text-white/80 max-w-md">{theme.subtitulo}</p>}
          {!!theme.bullets?.length && (
            <ul className="space-y-2 mt-2">
              {theme.bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-white/90">
                  <CheckCircle2 className="size-4 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid place-items-center p-6" style={bgStyle}>
          {card}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center p-6" style={bgStyle}>
      <div className="w-full max-w-md space-y-4">
        {card}
        {!!theme.bullets?.length && (
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: theme.corTexto }}>
            {theme.bullets.map((b, i) => (
              <li key={i} className="flex items-center gap-1 opacity-70">
                <CheckCircle2 className="size-3" /> {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  radius,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  radius: string;
}) {
  const base = "w-full border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400";
  const style = { borderRadius: radius };
  if (field.tipo === "textarea")
    return (
      <textarea
        id={field.id}
        className={base}
        style={style}
        rows={3}
        placeholder={field.placeholder}
        required={field.obrigatorio}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (field.tipo === "select")
    return (
      <select
        id={field.id}
        className={base}
        style={style}
        required={field.obrigatorio}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione...</option>
        {(field.opcoes ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  if (field.tipo === "checkbox")
    return (
      <label className="flex items-start gap-2 text-xs opacity-80">
        <input
          id={field.id}
          type="checkbox"
          required={field.obrigatorio}
          checked={value === "sim"}
          onChange={(e) => onChange(e.target.checked ? "sim" : "")}
          className="mt-0.5"
        />
        <span>{field.placeholder || field.label}</span>
      </label>
    );
  const type =
    field.tipo === "email" ? "email" : field.tipo === "telefone" ? "tel" : field.tipo === "numero" ? "number" : field.tipo === "data" ? "date" : "text";
  return (
    <input
      id={field.id}
      type={type}
      className={base}
      style={style}
      placeholder={field.placeholder}
      required={field.obrigatorio}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
