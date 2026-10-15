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
import { formatDateTime, formatPercent, formatarTempoTotal, resultadoRodagem, rodagemAnteriorComTempo, tempoTotalRodagem, variacaoTempo } from "@/lib/format";
import { cn } from "@/lib/utils";

const OCC_COR = {
  quebra: { texto: "text-destructive", barra: "bg-destructive" },
  diferenca: { texto: "text-warning", barra: "bg-warning" },
  quebra_diferenca: { texto: "text-fuchsia-500 dark:text-fuchsia-400", barra: "bg-fuchsia-500" },
} as const;

function OccCard({ label, hint, value, tone, onClick }: { label: string; hint: string; value: number; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={value === 0}
      className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left transition-smooth hover:border-primary/40 disabled:cursor-default disabled:opacity-60 disabled:hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:items-start"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="flex items-center gap-2 sm:w-full sm:justify-between">
        <span className={`text-2xl font-bold font-mono sm:text-3xl ${tone}`}>{value}</span>
        {value > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            Ver <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </span>
    </button>
  );
}

export function ResumoTab({ rodagem, falhas, evidencias, performance, onOpenPerformance, onOpenFalhas, historico = [] }: { rodagem: Rodagem; falhas: Falha[]; evidencias: Evidencia[]; performance: AtrasoRodagem[]; onOpenPerformance: () => void; onOpenFalhas: (sub: "todos" | "quebra" | "diferenca" | "quebra_diferenca") => void; historico?: Rodagem[] }) {
  // Rodagem anterior do modulo com tempo total: base da variacao do tempo.
  const anterior = useMemo(() => rodagemAnteriorComTempo(rodagem, historico), [rodagem, historico]);
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

  // Total, aprovados e falhas ficam no bloco "Resultado"; aqui so as classificacoes extras.
  const cards = useMemo(() => ([
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
        <Card className="glass-card p-4 sm:p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Diagnóstico da rodagem</h3>
          {isMeaningful(rodagem.diagnostico_curto) && <p className="text-lg font-medium mb-3">{rodagem.diagnostico_curto}</p>}
          {isMeaningful(rodagem.diagnostico_detalhado) && <p className="text-sm text-muted-foreground mb-3">{rodagem.diagnostico_detalhado}</p>}
          {isMeaningful(rodagem.conclusao_geral) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">Conclusão</div>
              <p className="text-sm">{rodagem.conclusao_geral}</p>
            </div>
          )}
        </Card>
      )}

      <ResultadoCard rodagem={rodagem} occ={occCounts} anterior={anterior} />

      <div className="grid gap-3 sm:grid-cols-3">
        <OccCard label="Quebras de teste" hint="O teste parou com erro" value={occCounts.quebra} tone={OCC_COR.quebra.texto} onClick={() => onOpenFalhas("quebra")} />
        <OccCard label="Diferenças de arquivos" hint="Arquivo gerado diferente da base" value={occCounts.diferenca} tone={OCC_COR.diferenca.texto} onClick={() => onOpenFalhas("diferenca")} />
        <OccCard label="Quebra + diferença" hint="As duas coisas no mesmo caso" value={occCounts.quebra_diferenca} tone={OCC_COR.quebra_diferenca.texto} onClick={() => onOpenFalhas("quebra_diferenca")} />
      </div>

      {cards.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} />)}
        </div>
      )}



      {performance.length > 0 && (() => {
        const slow = performance.filter((p) => p.status === "mais_lento");
        const fast = performance.filter((p) => p.status === "mais_rapido");
        const maxDelay = slow.reduce((a, b) => (b.delay_segundos > a ? b.delay_segundos : a), 0);
        return (
          <Card className="p-4 sm:p-5 flex items-center gap-4 flex-wrap">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Gauge className="h-5 w-5" /></div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-medium">Performance da rodagem</div>
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
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Distribuição por classificação</h3>
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
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Distribuição por severidade</h3>
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

/** Resultado da rodagem: taxa de sucesso e quantos casos de cada tipo. */
/** Bloco da direita do Resultado: rotulo em cima, numero grande e um detalhe embaixo (todos alinhados). */
function Bloco({ label, valor, detalhe, title }: { label: string; valor: string; detalhe: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-semibold leading-tight">{valor}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">{detalhe}</div>
    </div>
  );
}

/** Tempo total (inicio ate o fim) e a variacao em relacao a rodagem anterior do modulo. */
function TempoTotal({ rodagem, anterior }: { rodagem: Rodagem; anterior: Rodagem | null }) {
  const segundos = tempoTotalRodagem(rodagem);
  if (segundos == null) return null;
  const segundosAnterior = anterior ? tempoTotalRodagem(anterior) : null;
  const variacao = segundosAnterior ? variacaoTempo(segundos, segundosAnterior) : null;
  const periodo = `De ${formatDateTime(rodagem.data_inicio_rodagem)} até ${formatDateTime(rodagem.data_fim_rodagem)}`;
  // Menos de 0,05% (arredonda para 0,0%): fica neutro.
  const igual = variacao != null && Math.abs(variacao) < 0.0005;
  const subiu = variacao != null && !igual && variacao > 0;
  return (
    <Bloco
      label="Tempo total"
      valor={formatarTempoTotal(segundos)}
      title={periodo}
      detalhe={
        variacao == null || !anterior || segundosAnterior == null ? (
          <span>sem rodagem anterior para comparar</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-mono font-medium",
                igual ? "bg-muted text-muted-foreground" : subiu ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
              )}
              aria-label={igual ? "mesmo tempo" : `${subiu ? "aumento" : "redução"} de ${formatPercent(Math.abs(variacao))}`}
            >
              {igual ? "=" : subiu ? "▲" : "▼"} {formatPercent(Math.abs(variacao))}
            </span>
            <span title={`Rodagem anterior: ${formatDateTime(anterior.data_inicio_rodagem)}`}>
              vs anterior ({formatarTempoTotal(segundosAnterior)} · {formatDateTime(anterior.data_inicio_rodagem).slice(0, 5)})
            </span>
          </>
        )
      }
    />
  );
}

function ResultadoCard({ rodagem, occ, anterior }: { rodagem: Rodagem; occ: { quebra: number; diferenca: number; quebra_diferenca: number }; anterior: Rodagem | null }) {
  const r = resultadoRodagem(rodagem);
  if (!r) {
    // Sem os totais para a taxa: mostra o que existe (falhas e, se vier, casos rodados).
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="text-sm text-muted-foreground">Falhas nesta rodagem</div>
            <div className="mt-1 text-3xl font-bold font-mono">{rodagem.total_falhas ?? "—"}</div>
            {(rodagem.total_analisados ?? 0) > 0 && (
              <div className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{rodagem.total_analisados.toLocaleString("pt-BR")}</span> casos rodados
              </div>
            )}
          </div>
          <TempoTotal rodagem={rodagem} anterior={anterior} />
        </div>
      </Card>
    );
  }
  const partes = [
    { key: "ok", label: "Passaram", value: r.passaram, barra: "bg-success" },
    { key: "q", label: "Quebras", value: occ.quebra, barra: OCC_COR.quebra.barra },
    { key: "d", label: "Diferenças", value: occ.diferenca, barra: OCC_COR.diferenca.barra },
    { key: "qd", label: "Quebra + diferença", value: occ.quebra_diferenca, barra: OCC_COR.quebra_diferenca.barra },
  ];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div>
          <div className="text-sm text-muted-foreground">Resultado da rodagem</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono sm:text-4xl">{formatPercent(r.taxa)}</span>
            <span className="text-sm text-muted-foreground">passaram</span>
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
          <TempoTotal rodagem={rodagem} anterior={anterior} />
          {tempoTotalRodagem(rodagem) != null && <div className="w-px self-stretch bg-border max-sm:hidden" aria-hidden />}
          <Bloco
            label="Casos rodados"
            valor={r.rodados.toLocaleString("pt-BR")}
            detalhe={<><span className="font-mono text-destructive">{r.falhas}</span> {r.falhas === 1 ? "falhou" : "falharam"}</>}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {partes.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${p.barra}`} />{p.label} <span className="font-mono text-foreground">{p.value}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}
