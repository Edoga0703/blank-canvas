import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const NOVO = "__novo__";

function ler(chave: string): { value: string; label: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(chave);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Select com opção de criar valores personalizados (guardados no navegador). */
export function OptionSelect({
  id,
  storageKey,
  options,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  storageKey: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [extras, setExtras] = useState<{ value: string; label: string }[]>([]);
  const [criando, setCriando] = useState(false);
  const [texto, setTexto] = useState("");

  useEffect(() => { setExtras(ler(storageKey)); }, [storageKey]);

  const todas = [...options, ...extras.filter((e) => !options.some((o) => o.value === e.value))];
  const faltando = value && !todas.some((o) => o.value === value)
    ? [{ value, label: value }]
    : [];
  const lista = [...todas, ...faltando];

  function adicionar() {
    const label = texto.trim();
    if (!label) return;
    const novo = { value: label.toLowerCase().replace(/\s+/g, "_").slice(0, 32), label };
    const proximos = [...extras.filter((e) => e.value !== novo.value), novo];
    setExtras(proximos);
    try { window.localStorage.setItem(storageKey, JSON.stringify(proximos)); } catch { /* ignora */ }
    onChange(novo.value);
    setTexto("");
    setCriando(false);
  }

  if (criando) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
          placeholder="Nome da nova opção"
        />
        <Button type="button" size="sm" onClick={adicionar}>Salvar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCriando(false)}>Cancelar</Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => { if (v === NOVO) setCriando(true); else onChange(v); }}
    >
      <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {lista.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        <SelectItem value={NOVO}>
          <span className="flex items-center gap-1 text-primary"><Plus className="w-3.5 h-3.5" /> Adicionar opção</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
