import React from "react";
import { Target, Edit3, Calendar, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  variation?: number;
  hero?: boolean;
}

export function KpiCard({ icon, label, value, variation, hero }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border border-[color:var(--hairline)] bg-white p-6 flex flex-col justify-between hover:shadow-md transition-all group ${hero ? 'ring-1 ring-[var(--brand)]/10' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`size-14 rounded-2xl grid place-items-center transition-transform group-hover:scale-110 shadow-inner ${hero ? "bg-blue-50 text-[color:var(--brand)]" : "bg-slate-50 text-slate-400"}`}>
          {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: "size-7" }) : icon}
        </div>

        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className={`font-bold tabular-nums tracking-tighter text-slate-900 ${hero ? "text-3xl" : "text-2xl"}`}>
            {value}
          </p>
        </div>
      </div>
      {variation !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${variation >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {variation > 0 ? "+" : ""}{variation.toFixed(1)}%
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">vs mês anterior</span>
        </div>
      )}
    </div>
  );
}

interface MetaCardProps {
  meta: number;
  receitaMes: number;
  pct: number;
  onEdit?: () => void;
}

export function MetaCard({ meta, receitaMes, pct, onEdit }: MetaCardProps) {
  const fmtBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-6 relative group overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[color:var(--brand)]/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform blur-2xl" />
      
      <div className="flex items-center justify-between mb-6 relative">
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-2xl grid place-items-center bg-blue-50 text-[color:var(--brand)] shadow-inner group-hover:scale-110 transition-transform">
            <Target className="size-7" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Meta mensal</p>
            <p className="text-2xl font-bold tabular-nums tracking-tighter text-slate-900">
              {meta > 0 ? `${pct}%` : "Definir meta"}
            </p>
          </div>
        </div>
        {onEdit && (
          <Button variant="ghost" size="icon" className="size-9 rounded-xl text-[color:var(--brand)] hover:bg-blue-50" onClick={onEdit}>
            <Edit3 className="size-4" />
          </Button>
        )}
      </div>

      <div className="space-y-3 relative">
        <div className="flex justify-between items-end text-[10px] font-bold uppercase tracking-wider">
          <span className="text-muted-foreground">Progresso atual</span>
          <span className="text-[color:var(--brand)] font-bold">{fmtBRL(receitaMes)} <span className="text-slate-300 mx-1">/</span> {fmtBRL(meta)}</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
          <div 
            className="h-full bg-[color:var(--brand)] transition-all duration-1000" 
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function MetaConfigCard() {
  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-8 space-y-8 shadow-sm">
      <div className="space-y-1">
        <h3 className="font-bold text-lg text-slate-900">Configuração da meta</h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ajuste os parâmetros de performance</p>
      </div>
      
      <div className="space-y-6">
        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Calendar className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Período</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Agosto de 2026</p>
          </div>
        </div>

        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Target className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Métrica principal</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Receita (BRL)</p>
          </div>
        </div>

        <div className="flex items-center gap-4 group">
          <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 grid place-items-center text-slate-400 group-hover:text-[color:var(--brand)] group-hover:border-[color:var(--brand)]/20 transition-colors">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Visibilidade</p>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Toda a unidade</p>
          </div>
        </div>
      </div>

      <Button className="w-full rounded-2xl h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider shadow-lg shadow-slate-900/10 mt-4">
        Editar definições
      </Button>
    </div>
  );
}
