import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Indicador de etapas (Reexecutar, Regravar): etapa feita ganha check; so vai para as liberadas. */
export function EtapasNav<T extends number>({ etapas, atual, podeIrPara, onIr }: {
  etapas: { n: T; label: string }[]; atual: T; podeIrPara: (n: T) => boolean; onIr: (n: T) => void;
}) {
  return (
    <nav aria-label="Etapas" className="mb-4">
      <ol className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        {etapas.map(({ n, label }, i) => {
          const eAtual = atual === n;
          const feita = n < atual;
          return (
            <li key={n} className={cn("flex items-center gap-2", i < etapas.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => podeIrPara(n) && onIr(n)}
                disabled={!podeIrPara(n)}
                aria-current={eAtual ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed md:min-h-0",
                  eAtual ? "font-semibold text-foreground" : "text-muted-foreground enabled:hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                    eAtual && "border-primary bg-primary text-primary-foreground",
                    feita && "border-primary/40 bg-primary/10 text-primary",
                    !eAtual && !feita && "border-border",
                  )}
                >
                  {feita ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                {label}
              </button>
              {i < etapas.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
