// Cabecalho do modulo: nome, rodagem atual e troca de rodagem.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import type { ReactNode } from "react";
import { useState } from "react";
import { extractVmName } from "@/services/data";
import type { Rodagem, Modulo } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { formatDateTime, getHealthStatus } from "@/lib/format";
import { isMeaningful } from "./common";

export function ModuleHeader({ modulo, rodagem, runs, onPickRun }: { modulo: Modulo | null; rodagem: Rodagem | null; runs: Rodagem[]; onPickRun: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const health = getHealthStatus(rodagem?.status_label || rodagem?.status_geral, rodagem?.score_saude);
  const fields: { label: string; value: ReactNode }[] = rodagem ? [
    { label: "Sistema", value: rodagem.sistema },
    { label: "Branch", value: rodagem.branch },
    { label: "Versão", value: rodagem.versao_sistema },
    { label: "Data", value: formatDateTime(rodagem.data_analise) },
  ].filter((f) => isMeaningful(f.value)) : [];
  return (
    <Card className="glass-card p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="flex flex-col lg:flex-row lg:items-start gap-6 justify-between relative">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{modulo?.nome || "Módulo"}</h1>
            {(rodagem && health.label !== "Sem dados") && (
              <Badge variant="outline" className={`${health.className} gap-1.5`}>
                <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} />{health.label}
              </Badge>
            )}
            {!rodagem && (
              <Badge variant="outline" className={`${health.className} gap-1.5`}>
                <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} />Sem dados
              </Badge>
            )}
            {runs.length > 0 && (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-8">
                    <ChevronsUpDown className="h-3.5 w-3.5" /> Trocar rodagem
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0 max-sm:w-[calc(100vw-2rem)]" align="start">
                  <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    {runs.length} rodagens disponíveis
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {runs.map((r) => {
                      const active = r.id === rodagem?.id;
                      const h = getHealthStatus(r.status_label || r.status_geral, r.score_saude);
                      return (
                        <button key={r.id} onClick={() => { onPickRun(r.id); setOpen(false); }} className={`w-full text-left px-3 py-2.5 hover:bg-secondary/60 transition-smooth border-b border-border/50 ${active ? "bg-primary/5" : ""}`}>
                          <div className="flex items-center gap-2">
                            {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                            {(() => {
                              const vm = r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem);
                              return (
                                <span className="text-sm font-medium truncate flex-1">
                                  {formatDateTime(r.data_analise)}
                                  {vm && <span className="text-muted-foreground font-normal"> - {vm}</span>}
                                </span>
                              );
                            })()}

                            {h.label !== "Sem dados" && <Badge variant="outline" className={`${h.className} text-[10px] h-5`}>{h.label}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 ml-5">
                            {r.versao_sistema && <span>v{r.versao_sistema}</span>}
                            {r.branch && <span className="font-mono">{r.branch}</span>}
                            <span>{r.total_falhas} falhas</span>
                            {r.total_possivel_funcional > 0 && <span className="text-functional">{r.total_possivel_funcional} func.</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          {fields.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              {fields.map((f) => (
                <span key={f.label}><strong className="text-foreground/80">{f.label}:</strong> {f.value}</span>
              ))}
            </div>
          )}
        </div>
        {rodagem?.score_saude != null && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-4xl font-bold gradient-text">{rodagem.score_saude}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score de saúde</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
