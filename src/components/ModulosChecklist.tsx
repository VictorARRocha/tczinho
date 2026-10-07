import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MODULOS_ACESSO, nomeModulo } from "@/lib/permissoes";

/** Campo com lista de checagem dos modulos: fechado mostra os escolhidos; aberto, as caixinhas. */
export function ModulosChecklist({
  value,
  onChange,
  id,
  placeholder = "Escolha os módulos",
}: {
  value: string[];
  onChange: (slugs: string[]) => void;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const alternar = (slug: string, marcar: boolean) => {
    const set = new Set(value);
    if (marcar) set.add(slug);
    else set.delete(slug);
    // Mantem a ordem oficial dos modulos.
    onChange(MODULOS_ACESSO.map((m) => m.slug).filter((s) => set.has(s)));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label="Módulos que você usa"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {value.length ? value.map(nomeModulo).join(", ") : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
        <div role="group" aria-label="Módulos" className="grid grid-cols-2">
          {MODULOS_ACESSO.map((m) => (
            <label key={m.slug} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/60">
              <Checkbox checked={value.includes(m.slug)} onCheckedChange={(v) => alternar(m.slug, v === true)} aria-label={m.nome} />
              {m.nome}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
