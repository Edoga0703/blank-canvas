import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import type { LeadOpt } from "./appointment-form";

/** Seletor de contato do CRM em um único campo, com busca embutida. */
export function ContactPicker({
  leads,
  cardId,
  nome,
  numero,
  onSelect,
  id,
}: {
  leads: LeadOpt[];
  cardId: string;
  nome: string;
  numero: string;
  onSelect: (l: LeadOpt) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const rotulo = nome || numero ? `${nome || "Sem nome"}${numero ? ` · ${numero}` : ""}` : "Selecionar contato do CRM";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={nome || numero ? "" : "text-muted-foreground"}>{rotulo}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-3rem)] p-0"
        align="start"
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar por nome ou telefone" />
          <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">
                Nenhum contato. Digite nome e telefone abaixo — será salvo no CRM.
              </span>
            </CommandEmpty>
            <CommandGroup>
              {leads.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.nome || "Sem nome"} ${l.numero}`}
                  onSelect={() => { onSelect(l); setOpen(false); }}
                >
                  <Check className={`mr-2 w-4 h-4 ${cardId === l.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">
                    {l.nome || "Sem nome"} <span className="text-muted-foreground">{l.numero}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
