// Aba Resumo: totais da rodagem e atalhos para falhas e performance.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useMemo } from "react";
import type { Rodagem, Falha, Evidencia, AtrasoRodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gauge } from "lucide-react";
import { classifyOccurrence, groupEvidsByFailure } from "@/lib/occurrence";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { formatDuration } from "./PerformanceTab";
import { isMeaningful, StatCard, Empty } from "./common";

function OccCard({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="glass-card p-5 hover:border-primary/40 transition-smooth h-full">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-3xl font-bold font-mono mt-1 ${tone}`}>{value}</div>
        <div className="text-xs text-primary mt-2 inline-flex items-center gap-1">Abrir <ArrowRight className="h-3 w-3" /></div>
      </Card>
    </button>
  );
}

export function ResumoTab({ rodagem, falhas, evidencias, performance, onOpenPerformance, onOpenFalhas }: { rodagem: Rodagem; falhas: Falha[]; evidencias: Evidencia[]; performance: AtrasoRodagem[]; onOpenPerformance: () => void; onOpenFalhas: (sub: "todos" | "quebra" | "diferenca" | "quebra_diferenca") => void }) {
  const classData = useMemo(() => [
    { name: "Automação", value: rodagem.total_automacao, color: "hsl(var(--automation))" },
    { name: "Massa/Dados", value: rodagem.total_massa_dados, color: "hsl(var(--data-mass))" },
    { name: "Ambiente", value: rodagem.total_ambiente, color: "hsl(var(--environment))" },
    { name: "Possível funcional", value: rodagem.total_possivel_funcional, color: "hsl(var(--functional))" },
    { name: "Inconclusivo", value: rodagem.total_inconclusivo, color: "hsl(var(--inconclusive))" },
  ].filter((d) => d.value > 0), [rodagem.total_automacao, rodagem.total_massa_dados, rodagem.total_ambiente, rodagem.total_possivel_funcional, rodagem.total_inconclusivo]);

  const sevData = useMemo(() => [
    { name: "Alta", value: rodagem.total_alta, color: "hsl(var(--destructive))" },
    { name: "Média", value: rodagem.total_media, color: "hsl(var(--warning))" },
    { name: "Baixa", value: rodagem.total_baixa, color: "hsl(var(--success))" },
  ].filter((d) => d.value > 0), [rodagem.total_alta, rodagem.total_media, rodagem.total_baixa]);

  const cards = useMemo(() => ([
    { label: "Casos rodados", value: rodagem.total_analisados, tone: "text-primary", force: true },
    { label: "Falhas", value: rodagem.total_falhas, force: true },
    { label: "Funcional", value: rodagem.total_possivel_funcional, tone: "text-functional" },
    { label: "Automação", value: rodagem.total_automacao, tone: "text-automation" },
    { label: "Massa/Dados", value: rodagem.total_massa_dados, tone: "text-data-mass" },
    { label: "Ambiente", value: rodagem.total_ambiente, tone: "text-environment" },
    { label: "Inconclusivo", value: rodagem.total_inconclusivo, tone: "text-inconclusive" },
    { label: "Sev. Alta", value: rodagem.total_alta, tone: "text-destructive" },
    { label: "Sev. Média", value: rodagem.total_media, tone: "text-warning" },
    { label: "Sev. Baixa", value: rodagem.total_baixa, tone: "text-success" },
  ] as { label: string; value: number; tone?: string; force?: boolean }[]).filter((c) => c.force || c.value > 0), [rodagem]);

  const occCounts = useMemo(() => {
    const evMap = groupEvidsByFailure(evidencias);
    const c = { quebra: 0, diferenca: 0, quebra_diferenca: 0 };
    falhas.forEach((f) => { c[classifyOccurrence(f, evMap.get(f.id) || [])]++; });
    return c;
  }, [falhas, evidencias]);

  const hasDiagText = isMeaningful(rodagem.diagnostico_curto) || isMeaningful(rodagem.diagnostico_detalhado) || isMeaningful(rodagem.conclusao_geral);

  return (
    <div className="space-y-6">
      {hasDiagText && (
        <Card className="glass-card p-6">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Diagnóstico da rodagem</h3>
          {isMeaningful(rodagem.diagnostico_curto) && <p className="text-lg font-medium mb-3">{rodagem.diagnostico_curto}</p>}
          {isMeaningful(rodagem.diagnostico_detalhado) && <p className="text-sm text-muted-foreground mb-3">{rodagem.diagnostico_detalhado}</p>}
          {isMeaningful(rodagem.conclusao_geral) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Conclusão</div>
              <p className="text-sm">{rodagem.conclusao_geral}</p>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} />)}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <OccCard label="Quebras de teste" value={occCounts.quebra} tone="text-destructive" onClick={() => onOpenFalhas("quebra")} />
        <OccCard label="Diferenças de arquivos" value={occCounts.diferenca} tone="text-warning" onClick={() => onOpenFalhas("diferenca")} />
        <OccCard label="Quebras + Diferenças" value={occCounts.quebra_diferenca} tone="text-primary" onClick={() => onOpenFalhas("quebra_diferenca")} />
      </div>



      {performance.length > 0 && (() => {
        const slow = performance.filter((p) => p.status === "mais_lento");
        const fast = performance.filter((p) => p.status === "mais_rapido");
        const maxDelay = slow.reduce((a, b) => (b.delay_segundos > a ? b.delay_segundos : a), 0);
        return (
          <Card className="glass-card p-5 flex items-center gap-4 flex-wrap">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Gauge className="h-5 w-5" /></div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Performance da rodagem</div>
              <div className="text-sm mt-0.5">
                <span className="text-destructive font-mono font-semibold">{slow.length}</span> mais lento{slow.length === 1 ? "" : "s"}
                {" · "}
                <span className="text-success font-mono font-semibold">{fast.length}</span> mais rápido{fast.length === 1 ? "" : "s"}
                {maxDelay > 0 && <> · <span className="text-muted-foreground">maior atraso </span><span className="font-mono">{formatDuration(maxDelay)}</span></>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenPerformance}>Ver performance <ArrowRight className="h-3.5 w-3.5" /></Button>
          </Card>
        );
      })()}

      {(classData.length > 0 || sevData.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Distribuição por classificação</h3>
            {classData.length === 0 ? <Empty text="Sem dados de classificação para exibir." /> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={classData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {classData.map((d, i) => <Cell key={i} fill={d.color} stroke="hsl(var(--background))" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {classData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name} <span className="font-mono text-muted-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Distribuição por severidade</h3>
            {sevData.length === 0 ? <Empty text="Sem dados de severidade para exibir." /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sevData}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {sevData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}

    </div>
  );
}

// ============ Blocos operacionais (Jenkins / rerun_requests) ============
