import { useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { combinaBusca } from "@/lib/merge";
import { cn } from "@/lib/utils";

export type OpcaoBusca = { valor: string; rotulo: string; selo?: string; detalhe?: ReactNode };

/** Combobox com busca (versão, branch): mesmo visual do Select, digitando filtra, setas escolhem, Enter confirma. */
export function SelectBusca({
  opcoes, value, onChange, ariaLabel, id, placeholder = "Selecione", buscaPlaceholder = "Buscar…", vazio = "Nada encontrado.", className,
}: {
  opcoes: OpcaoBusca[]; value: string; onChange: (valor: string) => void; ariaLabel?: string; id?: string;
  placeholder?: string; buscaPlaceholder?: string; vazio?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState(0);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const atual = opcoes.find((o) => o.valor === value);
  const visiveis = opcoes.filter((o) => combinaBusca(o.rotulo, busca));
  const indiceAtivo = Math.min(ativa, Math.max(0, visiveis.length - 1));
  const escolher = (valor: string) => { onChange(valor); setOpen(false); setBusca(""); };
  const mover = (passo: number) => {
    if (!visiveis.length) return;
    const proximo = (indiceAtivo + passo + visiveis.length) % visiveis.length;
    setAtiva(proximo);
    document.getElementById(`${listaId}-${proximo}`)?.scrollIntoView({ block: "nearest" });
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setBusca("");
        // Abre com a opção escolhida ativa (ou a primeira).
        else setAtiva(Math.max(0, opcoes.findIndex((x) => x.valor === value)));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button" id={id} role="combobox" aria-expanded={open} aria-label={ariaLabel}
          // Igual ao Select: setas abrem a lista pelo teclado.
          onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("line-clamp-1", !atual && "text-muted-foreground")}>
            {atual ? atual.rotulo : placeholder}
            {atual?.selo && <span className="ml-2 text-xs text-muted-foreground">{atual.selo}</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 max-sm:w-[calc(100vw-2rem)]"
        // Abre ja digitando na busca (o Radix focaria a caixa da lista).
        onOpenAutoFocus={(e) => { e.preventDefault(); buscaRef.current?.focus(); }}
      >
        <div className="border-b border-border p-2">
          <Input
            ref={buscaRef} placeholder={buscaPlaceholder} value={busca} className="h-11 md:h-9" aria-label={buscaPlaceholder.split("…")[0]}
            role="combobox" aria-expanded aria-controls={listaId} aria-autocomplete="list"
            aria-activedescendant={visiveis.length ? `${listaId}-${indiceAtivo}` : undefined}
            onChange={(e) => { setBusca(e.target.value); setAtiva(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
              else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
              else if (e.key === "Enter" && visiveis[indiceAtivo]) { e.preventDefault(); escolher(visiveis[indiceAtivo].valor); }
            }}
          />
        </div>
        <div id={listaId} className="max-h-72 overflow-auto p-1" role="listbox" aria-label={ariaLabel}>
          {visiveis.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{vazio}</p>}
          {visiveis.map((o, i) => (
            <button
              key={o.valor} id={`${listaId}-${i}`} type="button" role="option" aria-selected={o.valor === value} tabIndex={-1}
              onClick={() => escolher(o.valor)}
              onMouseMove={() => setAtiva(i)}
              className={cn(
                "relative flex w-full flex-col items-start rounded-sm py-1.5 pl-8 pr-2 text-left max-md:min-h-11",
                i === indiceAtivo && "bg-accent text-accent-foreground",
              )}
            >
              {o.valor === value && <Check className="absolute left-2 top-2 h-4 w-4" aria-hidden />}
              <span className="text-sm">
                {o.rotulo}
                {o.selo && <span className="ml-2 rounded border border-border px-1 text-[9px] text-muted-foreground">{o.selo}</span>}
              </span>
              {o.detalhe && <span className="text-[10px] text-muted-foreground">{o.detalhe}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
