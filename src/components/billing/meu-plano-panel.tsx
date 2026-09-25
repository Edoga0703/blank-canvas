import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyBillingSummary, previewCheckout, createCheckoutCharge, checkChargeStatus, cancelMyCharge,
  requestPaymentLink,
} from "@/lib/billing-checkout.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import {
  Loader2, Minus, Plus, QrCode, CreditCard, Copy, Clock, ExternalLink,
  Sparkles, ShieldCheck, Users, Wifi, RefreshCw,
} from "lucide-react";

function brl(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MeuPlanoPanel() {
  const summaryFn = useServerFn(getMyBillingSummary);
  const previewFn = useServerFn(previewCheckout);
  const createFn = useServerFn(createCheckoutCharge);
  const checkFn = useServerFn(checkChargeStatus);
  const cancelFn = useServerFn(cancelMyCharge);
  const linkFn = useServerFn(requestPaymentLink);
  const plano = usePlanFeatures();
  const [pedindoLink, setPedindoLink] = useState(false);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [incluirPlano, setIncluirPlano] = useState(true);
  const [preview, setPreview] = useState<{ items: any[]; total_cents: number } | null>(null);
  const [gerando, setGerando] = useState<"pix" | "card" | null>(null);
  const [charge, setCharge] = useState<any>(null);
  const pollRef = useRef<any>(null);

  async function load() {
    setLoading(true);
    try {
      const res: any = await summaryFn();
      setData(res);
      const pendente = (res.charges ?? []).find((c: any) => c.status === "pending");
      if (pendente) setCharge(pendente);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const cartItems = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ tipo: "addon" as const, id, quantidade: q })),
    [cart],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!data) return;
      if (!incluirPlano && cartItems.length === 0) { setPreview(null); return; }
      try {
        const res: any = await previewFn({ data: { items: cartItems, incluirPlano } });
        if (alive) setPreview(res);
      } catch { /* ignora enquanto o usuário mexe no carrinho */ }
    })();
    return () => { alive = false; };
  }, [cart, incluirPlano, data]);

  // Enquanto houver cobrança pendente na tela, verifica o pagamento.
  useEffect(() => {
    if (!charge || charge.status !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const res: any = await checkFn({ data: { id: charge.id } });
        if (res?.status === "paid") {
          clearInterval(pollRef.current);
          toast.success("Pagamento confirmado!");
          setCharge(null); setCart({});
          await load();
        }
      } catch { /* silencioso */ }
    }, 8000);
    return () => clearInterval(pollRef.current);
  }, [charge?.id, charge?.status]);

  async function solicitarPagamento(motivo: string) {
    setPedindoLink(true);
    try {
      const res: any = await linkFn({ data: { motivo } });
      if (res?.url) {
        window.open(res.url, "_blank", "noopener");
        toast.success("Abrimos a página de pagamento em uma nova aba.");
      } else {
        toast.info("Cobrança gerada. Atualize a página para ver os detalhes.");
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gerar o pagamento");
    } finally {
      setPedindoLink(false);
    }
  }

  async function gerar(metodo: "pix" | "card") {
    setGerando(metodo);
    try {
      const res: any = await createFn({ data: { items: cartItems, incluirPlano, metodo } });
      setCharge(res);
      if (metodo === "card" && res?.payment_url) window.open(res.payment_url, "_blank", "noopener");
      toast.success("Cobrança gerada");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gerar a cobrança");
    } finally {
      setGerando(null);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  const sub = data.subscription;
  const proxima = sub?.proxima_cobranca || sub?.current_period_end;
  const creditosIlimitados = !data.creditosIA?.total || data.creditosIA.total >= 1_000_000;
  // Só quem tem assinatura externa ATIVA e paga (Kiwify, Cakto, PerfectPay)
  // continua sendo cobrado por lá. Trial, inadimplente e novos usam o
  // checkout interno (Abacate Pay).
  const provider = String(sub?.provider ?? "manual");
  const statusSub = String(sub?.status ?? "");
  const externo =
    !["manual", "abacatepay", "interno"].includes(provider) &&
    ["active", "ativa", "paid", "authorized"].includes(statusSub) &&
    data.company?.status_cobranca !== "trial";
  // Gateway padrão definido no Master (kiwify por enquanto).
  const gateway = String(data.gateway ?? "kiwify");
  const kiwifyMode = gateway === "kiwify";
  const METODO_LABEL: Record<string, string> = {
    card: "Cartão de crédito", credit_card: "Cartão de crédito", cartao: "Cartão de crédito",
    pix: "PIX", boleto: "Boleto", manual: "Pagamento manual",
  };
  const metodoAtual = METODO_LABEL[String(sub?.metodo_pagamento ?? "").toLowerCase()] ?? "Não informado";
  const portalUrl = data.gatewayPortalUrl as string | null;

  return (
    <div className="space-y-6 w-full">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 p-0 overflow-hidden border-0 bg-primary bg-[linear-gradient(135deg,var(--primary)_0%,color-mix(in_oklab,var(--primary)_82%,transparent)_55%,color-mix(in_oklab,var(--primary)_62%,transparent)_100%)] text-primary-foreground">
          <div className="p-6 relative">
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary-foreground/10" aria-hidden />
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider opacity-90">
              <Sparkles className="size-4" /> Plano ativo
            </div>
            <h1 className="text-3xl font-bold mt-2">{data.plano?.nome ?? "Sem plano"}</h1>
            <p className="text-sm opacity-90 mt-1">
              Parabéns! Sua conta {brand.name} está ativa e pronta para vender mais.
            </p>
            <div className="flex items-end gap-2 mt-4">
              <span className="text-4xl font-extrabold">{brl(data.planoValorCents)}</span>
              <span className="opacity-80 text-sm pb-1">/mês</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/15 text-primary-foreground border-0 capitalize">
                <ShieldCheck className="size-3.5 mr-1" /> {data.company?.status_cobranca ?? "ativo"}
              </Badge>
              {proxima && (
                <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/15 text-primary-foreground border-0">
                  Renova em {new Date(proxima).toLocaleDateString("pt-BR")}
                </Badge>
              )}
              <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/15 text-primary-foreground border-0">
                <Users className="size-3.5 mr-1" /> {plano.usage.usuarios}/{plano.limites.usuarios} usuários
              </Badge>
              <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/15 text-primary-foreground border-0">
                <Wifi className="size-3.5 mr-1" /> {plano.usage.instancias}/{plano.limites.instancias} conexões
              </Badge>
              {data.creditosIA && (
                <Badge className="bg-primary-foreground/15 hover:bg-primary-foreground/15 text-primary-foreground border-0">
                  <Sparkles className="size-3.5 mr-1" />
                  {creditosIlimitados
                    ? "Créditos de IA ilimitados"
                    : `${Math.max(0, Number(data.creditosIA.saldo ?? 0)).toLocaleString("pt-BR")} créditos de IA disponíveis`}
                </Badge>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Adicionais ativos</div>
          {data.addons.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              Nenhum adicional contratado. Adicione usuários ou conexões abaixo.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {data.addons.map((a: any) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate">{a.quantidade}x {a.addon_product?.nome}</span>
                  <span className="text-muted-foreground">{brl((a.addon_product?.preco_cents ?? 0) * a.quantidade)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Forma de pagamento</h2>
            <p className="text-sm text-muted-foreground">
              Método atual: <b className="text-foreground">{metodoAtual}</b>
              {proxima && <> · próxima cobrança em {new Date(proxima).toLocaleDateString("pt-BR")}</>}
            </p>
          </div>
          <Badge variant="secondary" className="capitalize">{kiwifyMode ? "Kiwify" : provider}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cartão sem limite, cartão vencido ou pagamento recusado? Troque o cartão e solicite a cobrança novamente —
          não é preciso cancelar a assinatura.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pedindoLink}
            onClick={() => {
              if (portalUrl) window.open(portalUrl, "_blank", "noopener");
              else void solicitarPagamento("alterar_metodo");
            }}
          >
            <CreditCard className="size-4 mr-1.5" /> Alterar forma de pagamento
          </Button>
          <Button disabled={pedindoLink} onClick={() => void solicitarPagamento("nova_tentativa")}>
            {pedindoLink ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
            Solicitar pagamento novamente
          </Button>
        </div>
      </Card>

      {kiwifyMode || externo ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Sua assinatura é processada pela <b className="capitalize text-foreground">{kiwifyMode ? "Kiwify" : provider}</b>.
          Use os botões acima para pagar, trocar o cartão ou reenviar a cobrança. Para contratar adicionais, fale com o
          suporte.
        </Card>
      ) : charge && charge.status === "pending" ? (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-4 text-amber-600" />
            <h2 className="font-semibold">Cobrança aguardando pagamento — {brl(charge.total_cents)}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{charge.descricao}</p>

          {charge.metodo === "pix" ? (
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {charge.pix_qrcode && (
                <img
                  src={charge.pix_qrcode.startsWith("data:") ? charge.pix_qrcode : `data:image/png;base64,${charge.pix_qrcode}`}
                  alt="QR Code PIX para pagamento da mensalidade"
                  className="size-48 rounded-lg border bg-white p-2"
                />
              )}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="text-sm font-medium">PIX copia e cola</div>
                <div className="text-[11px] font-mono break-all bg-muted rounded-md p-3 max-h-28 overflow-auto">
                  {charge.pix_copia_cola ?? "—"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => { navigator.clipboard.writeText(charge.pix_copia_cola ?? ""); toast.success("Código copiado"); }}>
                    <Copy className="size-4 mr-1.5" /> Copiar código
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const res: any = await checkFn({ data: { id: charge.id } });
                    if (res?.status === "paid") { toast.success("Pagamento confirmado!"); setCharge(null); await load(); }
                    else toast.info("Ainda não identificamos o pagamento.");
                  }}>
                    Já paguei
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await cancelFn({ data: { id: charge.id } }); setCharge(null); await load();
                  }}>Cancelar cobrança</Button>
                </div>
                <p className="text-xs text-muted-foreground">A liberação é automática assim que o pagamento cair.</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {charge.payment_url && (
                <Button asChild><a href={charge.payment_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4 mr-1.5" /> Pagar com cartão</a></Button>
              )}
              <Button variant="ghost" onClick={async () => { await cancelFn({ data: { id: charge.id } }); setCharge(null); await load(); }}>
                Cancelar cobrança
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-lg">Montar pagamento</h2>
            <p className="text-sm text-muted-foreground">Escolha os adicionais. Tudo é somado em uma única cobrança.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incluirPlano} onChange={(e) => setIncluirPlano(e.target.checked)} className="size-4" />
            Incluir mensalidade do plano ({brl(data.planoValorCents)})
          </label>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.catalogo.map((p: any) => {
              const qtd = cart[p.id] ?? 0;
              return (
                <div key={p.id} className="border rounded-xl p-4 flex flex-col gap-3 h-full">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.nome}</div>
                    {p.descricao && <div className="text-xs text-muted-foreground line-clamp-3 mt-0.5">{p.descricao}</div>}
                    <div className="text-sm font-semibold mt-2">{brl(p.preco_cents)}<span className="text-xs font-normal text-muted-foreground">/mês</span></div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="outline" size="icon" className="size-8" aria-label={`Remover ${p.nome}`}
                      onClick={() => setCart({ ...cart, [p.id]: Math.max(0, qtd - 1) })}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{qtd}</span>
                    <Button variant="outline" size="icon" className="size-8" aria-label={`Adicionar ${p.nome}`}
                      onClick={() => setCart({ ...cart, [p.id]: qtd + 1 })}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="space-y-2">
            {(preview?.items ?? []).map((i: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{i.quantidade > 1 ? `${i.quantidade}x ` : ""}{i.nome}</span>
                <span className="text-muted-foreground">{brl(i.total_cents)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>Total</span>
              <span>{brl(preview?.total_cents ?? 0)}</span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button disabled={!preview?.total_cents || !!gerando} onClick={() => gerar("pix")}>
              {gerando === "pix" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <QrCode className="size-4 mr-1.5" />}
              Pagar com PIX
            </Button>
            <Button variant="outline" disabled={!preview?.total_cents || !!gerando} onClick={() => gerar("card")}>
              {gerando === "card" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <CreditCard className="size-4 mr-1.5" />}
              Pagar com cartão
            </Button>
          </div>
        </Card>
      )}

    </div>
  );
}
