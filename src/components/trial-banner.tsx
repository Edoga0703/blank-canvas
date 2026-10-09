import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X, AlertTriangle, Lock } from "lucide-react";
import type { CompanyRow } from "@/lib/tenant";
import { getAccessInfo, trialDaysLeft } from "@/lib/tenant";

type Props = { company: CompanyRow | null; isSuperAdmin?: boolean };

export function TrialBanner({ company, isSuperAdmin }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const acesso = getAccessInfo(company ?? null);
  const days = company?.trial_ate ? trialDaysLeft(company.trial_ate) : 0;
  const isTrial = acesso.state === "trial" && !isSuperAdmin;
  const isCarencia = acesso.state === "carencia" && !isSuperAdmin;
  const ativo = isTrial || isCarencia;
  const lastDay = isTrial && days <= 1;

  useEffect(() => {
    if (!ativo) return;
    if (!lastDay && !isCarencia) return;
    try {
      const key = `trial_modal_${company?.id}_${isCarencia ? "carencia" : "fim"}_${new Date().toDateString()}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      setShowModal(true);
    } catch {}
  }, [ativo, lastDay, isCarencia, company?.id]);

  useEffect(() => {
    if (!isTrial) return;
    try {
      const key = `trial_banner_dismissed_${company?.id}_${new Date().toDateString()}`;
      if (sessionStorage.getItem(key)) setDismissed(true);
    } catch {}
  }, [isTrial, company?.id]);

  if (!ativo) return null;

  const tone: "green" | "amber" | "red" = isCarencia ? "red" : days >= 5 ? "green" : days >= 2 ? "amber" : "red";
  const styles = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-300",
  }[tone];
  const Icon = isCarencia ? Lock : tone === "red" ? AlertTriangle : Sparkles;

  const diasTexto =
    acesso.diasDesdeFim <= 0 ? "hoje" : acesso.diasDesdeFim === 1 ? "há 1 dia" : `há ${acesso.diasDesdeFim} dias`;

  const label = isCarencia
    ? `Seu período de teste terminou ${diasTexto}. A conta está em modo somente leitura por mais ${acesso.horasCarencia}h`
    : days <= 0
    ? "Seu teste grátis termina hoje"
    : days === 1
    ? "Último dia do seu teste grátis"
    : `Faltam ${days} dias do seu teste grátis`;

  function dismiss() {
    setDismissed(true);
    try {
      const key = `trial_banner_dismissed_${company?.id}_${new Date().toDateString()}`;
      sessionStorage.setItem(key, "1");
    } catch {}
  }

  return (
    <>
      {(!dismissed || isCarencia) && (
        <div className={`flex items-center gap-3 px-4 py-2 text-[13px] font-medium border-b ${styles}`}>
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 min-w-0 truncate">
            {label}
            {isCarencia
              ? ". Você pode navegar, mas não realizar ações até ativar o plano."
              : ". Escolha um plano para continuar sem interrupções."}
          </span>
          <Link
            to="/app/checkout"
            className="shrink-0 inline-flex items-center rounded-md bg-[#0B22FE] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0A1FE0] transition-colors"
          >
            {isCarencia ? "Ativar meu plano" : "Assinar agora"}
          </Link>
          {tone !== "red" && (
            <button
              onClick={dismiss}
              title="Ocultar hoje"
              className="shrink-0 size-7 grid place-items-center rounded-md hover:bg-black/5"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="mx-auto size-14 rounded-full bg-red-100 grid place-items-center">
              {isCarencia ? <Lock className="size-7 text-red-600" /> : <AlertTriangle className="size-7 text-red-600" />}
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#0A0A0F]">
              {isCarencia
                ? `Seu período de teste terminou ${diasTexto}`
                : days <= 0
                ? "Seu teste termina hoje"
                : "Último dia do teste grátis"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isCarencia
                ? `Sua conta está com restrições: você pode navegar e consultar, mas não realizar ações (enviar mensagens, mover cards, cadastrar). Faltam ${acesso.horasCarencia}h para o acesso ser bloqueado — ative seu plano para liberar tudo novamente.`
                : "Escolha um plano agora para não perder o acesso ao Capi Conversa, suas conversas e automações."}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-accent"
              >
                Agora não
              </button>
              <Link
                to="/app/checkout"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg bg-[#0B22FE] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0A1FE0]"
              >
                {isCarencia ? "Ativar meu plano" : "Ver planos"}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
