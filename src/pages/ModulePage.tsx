import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchLatestRunByModule, fetchRunsByModule, fetchRunById,
  fetchFailuresByRun, fetchEvidenceByRun, fetchGroupsByRun, fetchNextStepsByRun,
  fetchPerformanceByRun, fetchGroupLinksByRun,
  subscribeToTable, fetchModules,
} from "@/services/qa";
import type { Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, Modulo, AtrasoRodagem } from "@/types/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Search, FileText, Image as ImageIcon, FileArchive, RefreshCw, ArrowRight, ChevronsUpDown, Check, Lightbulb, Gauge, TrendingUp, TrendingDown, Minus, Copy } from "lucide-react";
import { formatDateTime, getHealthStatus, severityRank } from "@/lib/format";
import { ClassificationBadge, SeverityBadge, ConfidenceBadge } from "@/components/Badges";
import { FailureDetailSheet } from "@/components/FailureDetailSheet";
import { FileComparatorDialog } from "@/components/FileComparator";
import { classifyOccurrence, groupEvidsByFailure, pairBaseAtual, type ComparisonPair, type OccurrenceType } from "@/lib/occurrence";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

// Descrição clara do problema da falha — usa o melhor texto disponível
function failureDescription(f: Falha): string {
  const order = [f.erro_principal, f.mensagem_principal, f.erro_titulo, f.trecho_relevante, f.hipotese_principal, f.primeira_acao_recomendada, f.descricao_caso, f.caso_teste_provavel];
  for (const v of order) {
    if (v && String(v).trim() && String(v).trim() !== "—") return String(v).trim();
  }
  return "";
}

export default function ModulePage() {
  const { slug = "" } = useParams();
  const [modulo, setModulo] = useState<Modulo | null>(null);
  const [rodagem, setRodagem] = useState<Rodagem | null>(null);
  const [historico, setHistorico] = useState<Rodagem[]>([]);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [grupos, setGrupos] = useState<Agrupamento[]>([]);
  const [passos, setPassos] = useState<ProximoPasso[]>([]);
  const [performance, setPerformance] = useState<AtrasoRodagem[]>([]);
  const [groupLinks, setGroupLinks] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState("resumo");
  const [loading, setLoading] = useState(true);
  const [selectedFalha, setSelectedFalha] = useState<Falha | null>(null);
  const [comparePair, setComparePair] = useState<{ pair: ComparisonPair; falha: Falha } | null>(null);

  const loadAll = async (runId?: string) => {
    try {
      setLoading(true);
      const mods = await fetchModules();
      const m = mods.find((x) => x.slug === slug) || null;
      setModulo(m);
      const runs = await fetchRunsByModule(slug);
      setHistorico(runs);
      const r = runId ? await fetchRunById(runId) : (runs[0] || (await fetchLatestRunByModule(slug)));
      setRodagem(r);
      if (r) {
        const [f, e, g, p, perf, links] = await Promise.all([
          fetchFailuresByRun(r.id), fetchEvidenceByRun(r.id), fetchGroupsByRun(r.id), fetchNextStepsByRun(r.id),
          fetchPerformanceByRun(r.id), fetchGroupLinksByRun(r.id),
        ]);
        setFalhas(f); setEvidencias(e); setGrupos(g); setPassos(p); setPerformance(perf); setGroupLinks(links);
      } else {
        setFalhas([]); setEvidencias([]); setGrupos([]); setPassos([]); setPerformance([]); setGroupLinks({});
      }
    } catch (e: any) {
      toast.error("Erro ao carregar módulo", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const offs = [
      subscribeToTable("rodagens", (p) => { if (p.new?.modulo_slug === slug) { toast.success("Nova rodagem recebida"); loadAll(); } }),
      subscribeToTable("falhas", () => loadAll(rodagem?.id)),
      subscribeToTable("evidencias", () => loadAll(rodagem?.id)),
      subscribeToTable("proximos_passos", () => loadAll(rodagem?.id)),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading && !rodagem) {
    return <div className="p-8 space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-fade-in">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-3 w-3" /> Visão geral
      </Link>

      <ModuleHeader modulo={modulo} rodagem={rodagem} runs={historico} onPickRun={(id) => loadAll(id)} onRefresh={() => loadAll(rodagem?.id)} />

      {!rodagem ? (
        <Card className="glass-card p-12 text-center mt-8">
          <h3 className="text-lg font-semibold">Nenhuma rodagem encontrada</h3>
          <p className="mt-2 text-sm text-muted-foreground">Este módulo ainda não recebeu análise do Codex/Python.</p>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="falhas">Falhas <span className="ml-1.5 text-xs opacity-60">({falhas.length})</span></TabsTrigger>
            <TabsTrigger value="agrupamentos">Agrupamentos</TabsTrigger>
            <TabsTrigger value="performance">Performance{performance.length > 0 && <span className="ml-1.5 text-xs opacity-60">({performance.length})</span>}</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="mt-6"><ResumoTab rodagem={rodagem} falhas={falhas} passos={passos} performance={performance} onSelect={setSelectedFalha} onOpenPerformance={() => setActiveTab("performance")} /></TabsContent>
          <TabsContent value="falhas" className="mt-6"><FalhasTab falhas={falhas} onSelect={setSelectedFalha} /></TabsContent>
          <TabsContent value="agrupamentos" className="mt-6"><AgrupamentosTab grupos={grupos} falhas={falhas} links={groupLinks} onSelect={setSelectedFalha} /></TabsContent>
          <TabsContent value="performance" className="mt-6"><PerformanceTab data={performance} /></TabsContent>
          <TabsContent value="historico" className="mt-6"><HistoricoTab runs={historico} currentId={rodagem.id} onPick={(id) => loadAll(id)} /></TabsContent>
        </Tabs>
      )}

      <FailureDetailSheet falha={selectedFalha} open={!!selectedFalha} onClose={() => setSelectedFalha(null)} />
    </div>
  );
}

function isMeaningful(v: any) {
  if (v == null) return false;
  if (typeof v === "string") { const s = v.trim(); return s !== "" && s !== "—" && s.toLowerCase() !== "sem informação"; }
  return true;
}

function ModuleHeader({ modulo, rodagem, runs, onPickRun, onRefresh }: { modulo: Modulo | null; rodagem: Rodagem | null; runs: Rodagem[]; onPickRun: (id: string) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const health = getHealthStatus(rodagem?.status_label || rodagem?.status_geral, rodagem?.score_saude);
  const fields: { label: string; value: any }[] = rodagem ? [
    { label: "Sistema", value: rodagem.sistema },
    { label: "Branch", value: rodagem.branch },
    { label: "Versão", value: rodagem.versao_sistema },
    { label: "Análise", value: formatDateTime(rodagem.data_analise) },
  ].filter((f) => isMeaningful(f.value)) : [];
  return (
    <Card className="glass-card p-6 lg:p-8 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="flex flex-col lg:flex-row lg:items-start gap-6 justify-between relative">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{modulo?.nome || "Módulo"}</h1>
            <Badge variant="outline" className={`${health.className} gap-1.5`}>
              <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} />{health.label}
            </Badge>
            {runs.length > 0 && (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-8">
                    <ChevronsUpDown className="h-3.5 w-3.5" /> Trocar rodagem
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
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
                            <span className="text-sm font-medium truncate flex-1">{formatDateTime(r.data_analise)}</span>
                            <Badge variant="outline" className={`${h.className} text-[10px] h-5`}>{h.label}</Badge>
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
        <div className="flex items-center gap-3">
          {rodagem?.score_saude != null && (
            <div className="text-right">
              <div className="text-4xl font-bold gradient-text">{rodagem.score_saude}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score de saúde</div>
            </div>
          )}
          <Button variant="outline" size="icon" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}

function StatCard({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${tone}`}>{value ?? 0}</div>
    </Card>
  );
}

function ResumoTab({ rodagem, falhas, passos, performance, onSelect, onOpenPerformance }: { rodagem: Rodagem; falhas: Falha[]; passos: ProximoPasso[]; performance: AtrasoRodagem[]; onSelect: (f: Falha) => void; onOpenPerformance: () => void }) {
  const classData = [
    { name: "Automação", value: rodagem.total_automacao, color: "hsl(var(--automation))" },
    { name: "Massa/Dados", value: rodagem.total_massa_dados, color: "hsl(var(--data-mass))" },
    { name: "Ambiente", value: rodagem.total_ambiente, color: "hsl(var(--environment))" },
    { name: "Possível funcional", value: rodagem.total_possivel_funcional, color: "hsl(var(--functional))" },
    { name: "Inconclusivo", value: rodagem.total_inconclusivo, color: "hsl(var(--inconclusive))" },
  ].filter((d) => d.value > 0);

  const sevData = [
    { name: "Alta", value: rodagem.total_alta, color: "hsl(var(--destructive))" },
    { name: "Média", value: rodagem.total_media, color: "hsl(var(--warning))" },
    { name: "Baixa", value: rodagem.total_baixa, color: "hsl(var(--success))" },
  ].filter((d) => d.value > 0);

  const grupoData = useMemo(() => {
    const m = new Map<string, number>();
    falhas.forEach((f) => { if (f.grupo) m.set(f.grupo, (m.get(f.grupo) || 0) + 1); });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [falhas]);

  const rotinaData = useMemo(() => {
    const m = new Map<string, number>();
    falhas.forEach((f) => { if (f.rotina_funcional) m.set(f.rotina_funcional, (m.get(f.rotina_funcional) || 0) + 1); });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [falhas]);

  const cards: { label: string; value: number; tone?: string; force?: boolean }[] = [
    { label: "Falhas", value: rodagem.total_falhas, force: true },
    { label: "Funcional", value: rodagem.total_possivel_funcional, tone: "text-functional" },
    { label: "Automação", value: rodagem.total_automacao, tone: "text-automation" },
    { label: "Massa/Dados", value: rodagem.total_massa_dados, tone: "text-data-mass" },
    { label: "Ambiente", value: rodagem.total_ambiente, tone: "text-environment" },
    { label: "Inconclusivo", value: rodagem.total_inconclusivo, tone: "text-inconclusive" },
    { label: "Sev. Alta", value: rodagem.total_alta, tone: "text-destructive" },
    { label: "Sev. Média", value: rodagem.total_media, tone: "text-warning" },
    { label: "Sev. Baixa", value: rodagem.total_baixa, tone: "text-success" },
  ].filter((c) => c.force || c.value > 0);

  const principais = [...falhas]
    .sort((a, b) => severityRank(b.severidade) - severityRank(a.severidade) || ((a.ordem_prioridade ?? 999) - (b.ordem_prioridade ?? 999)))
    .slice(0, 5);

  const hasDiagText = isMeaningful(rodagem.diagnostico_curto) || isMeaningful(rodagem.diagnostico_detalhado) || isMeaningful(rodagem.conclusao_geral);
  const fallbackDiag = rodagem.total_falhas > 0
    ? "Foram encontradas falhas nesta rodagem. Analise os casos listados abaixo."
    : "Nenhuma falha encontrada nesta rodagem.";

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

      {rotinaData.length > 0 && (
        <Card className="glass-card p-6">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Falhas por rotina funcional</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rotinaData} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
              <Bar dataKey="value" fill="hsl(var(--functional))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-4">Principais falhas</h3>
        {principais.length === 0 ? <Empty text="Sem falhas registradas." /> : (
          <div className="space-y-2">
            {principais.map((f) => {
              const desc = failureDescription(f);
              const titulo = f.caso_teste_provavel || f.erro_titulo || f.arquivo_zip || "Falha";
              return (
                <button key={f.id} onClick={() => onSelect(f)} className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-smooth text-left">
                  {f.ordem_prioridade != null && <span className="font-mono text-xs text-muted-foreground w-6">#{f.ordem_prioridade}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{titulo}</div>
                    {desc && desc !== titulo && (
                      <div className="text-xs text-muted-foreground truncate">{desc}</div>
                    )}
                    {f.id_caso_teste && <div className="font-mono text-[10px] text-muted-foreground/80">{f.id_caso_teste}</div>}
                  </div>
                  {f.severidade && <SeverityBadge value={f.severidade} />}
                  {f.classificacao && <ClassificationBadge value={f.classificacao} />}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {passos.length > 0 && (
        <Card className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /> Ações sugeridas</h3>
          <div className="space-y-2">
            {passos.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{p.descricao}</div>
                  {p.relacionado_a && <div className="text-[11px] text-muted-foreground mt-0.5">{p.relacionado_a}</div>}
                </div>
                {p.prioridade && <Badge variant="outline" className="text-[10px]">{p.prioridade}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
function FalhasTab({ falhas, onSelect }: { falhas: Falha[]; onSelect: (f: Falha) => void }) {
  const [q, setQ] = useState("");
  const [classif, setClassif] = useState<string>("");
  const [sev, setSev] = useState<string>("");
  const [conf, setConf] = useState<string>("");
  const [hasPrint, setHasPrint] = useState(false);
  const [hasTxt, setHasTxt] = useState(false);
  const [hasZip, setHasZip] = useState(false);

  const filtered = useMemo(() => falhas.filter((f) => {
    if (q && !JSON.stringify(f).toLowerCase().includes(q.toLowerCase())) return false;
    if (classif && (f.classificacao || "").toLowerCase() !== classif.toLowerCase()) return false;
    if (sev && (f.severidade || "").toLowerCase() !== sev.toLowerCase()) return false;
    if (conf && (f.confianca || "").toLowerCase() !== conf.toLowerCase()) return false;
    if (hasPrint && !f.arquivo_print) return false;
    if (hasTxt && !f.arquivo_txt) return false;
    if (hasZip && !f.arquivo_zip) return false;
    return true;
  }), [falhas, q, classif, sev, conf, hasPrint, hasTxt, hasZip]);

  const uniq = (key: keyof Falha) => Array.from(new Set(falhas.map((f) => f[key]).filter(Boolean))) as string[];
  const has = (key: keyof Falha) => falhas.some((f) => isMeaningful(f[key] as any));

  const cols = {
    prioridade: has("ordem_prioridade"),
    grupo: has("grupo") || has("subgrupo"),
    descricao: falhas.some((f) => failureDescription(f)),
    classificacao: has("classificacao"),
    severidade: has("severidade"),
    confianca: has("confianca"),
    evidencias: has("arquivo_print") || has("arquivo_txt") || has("arquivo_zip"),
  };
  const colCount = 1 + Object.values(cols).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <Card className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar em todas as falhas..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background" />
        </div>
        <div className="flex flex-wrap gap-2">
          {cols.classificacao && <Select label="Classificação" value={classif} onChange={setClassif} options={uniq("classificacao")} />}
          {cols.severidade && <Select label="Severidade" value={sev} onChange={setSev} options={uniq("severidade")} />}
          {cols.confianca && <Select label="Confiança" value={conf} onChange={setConf} options={uniq("confianca")} />}
          {has("arquivo_print") && <ToggleChip label="Tem print" active={hasPrint} onClick={() => setHasPrint((v) => !v)} />}
          {has("arquivo_txt") && <ToggleChip label="Tem TXT" active={hasTxt} onClick={() => setHasTxt((v) => !v)} />}
          {has("arquivo_zip") && <ToggleChip label="Tem ZIP" active={hasZip} onClick={() => setHasZip((v) => !v)} />}
        </div>
      </Card>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {cols.prioridade && <TableHead className="w-12">#</TableHead>}
              <TableHead>Caso de teste</TableHead>
              {cols.grupo && <TableHead>Grupo</TableHead>}
              {cols.descricao && <TableHead>Descrição</TableHead>}
              {cols.classificacao && <TableHead>Classificação</TableHead>}
              {cols.severidade && <TableHead>Severidade</TableHead>}
              {cols.confianca && <TableHead>Confiança</TableHead>}
              {cols.evidencias && <TableHead className="text-center">Evidências</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-12">Nenhuma falha corresponde aos filtros.</TableCell></TableRow>
            ) : filtered.map((f) => (
              <TableRow key={f.id} className="border-border cursor-pointer hover:bg-secondary/40" onClick={() => onSelect(f)}>
                {cols.prioridade && <TableCell className="font-mono text-xs text-muted-foreground">{f.ordem_prioridade ?? "—"}</TableCell>}
                <TableCell>
                  <div className="font-medium text-sm truncate max-w-[240px]">{f.caso_teste_provavel || f.arquivo_zip || "—"}</div>
                  {f.id_caso_teste && <div className="font-mono text-[10px] text-muted-foreground">{f.id_caso_teste}</div>}
                </TableCell>
                {cols.grupo && <TableCell className="text-xs">{f.grupo}{f.subgrupo && <span className="text-muted-foreground"> / {f.subgrupo}</span>}</TableCell>}
                {cols.descricao && <TableCell className="max-w-[320px]"><div className="line-clamp-2 text-xs text-muted-foreground">{failureDescription(f) || "—"}</div></TableCell>}
                {cols.classificacao && <TableCell><ClassificationBadge value={f.classificacao} /></TableCell>}
                {cols.severidade && <TableCell><SeverityBadge value={f.severidade} /></TableCell>}
                {cols.confianca && <TableCell><ConfidenceBadge value={f.confianca} /></TableCell>}
                {cols.evidencias && (
                  <TableCell>
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                      {f.arquivo_print && <ImageIcon className="h-3.5 w-3.5 text-primary" />}
                      {f.arquivo_txt && <FileText className="h-3.5 w-3.5 text-warning" />}
                      {f.arquivo_zip && <FileArchive className="h-3.5 w-3.5 text-data-mass" />}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
      <option value="">{label}: todos</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`h-8 px-3 rounded-md border text-xs transition-smooth ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );
}

function AgrupamentosTab({ grupos, falhas, links, onSelect }: { grupos: Agrupamento[]; falhas: Falha[]; links: Record<string, string[]>; onSelect: (f: Falha) => void }) {
  const indices = useMemo(() => {
    const byId = new Map<string, Falha>();
    const byCaso = new Map<string, Falha[]>();
    const byZip = new Map<string, Falha>();
    falhas.forEach((f) => {
      if (f.id) byId.set(String(f.id).toLowerCase(), f);
      if (f.id_caso_teste) {
        const k = String(f.id_caso_teste).toLowerCase();
        const arr = byCaso.get(k) || [];
        arr.push(f);
        byCaso.set(k, arr);
      }
      if (f.arquivo_zip) byZip.set(String(f.arquivo_zip).toLowerCase(), f);
    });
    return { byId, byCaso, byZip };
  }, [falhas]);

  const resolveCasos = (rel: any): Falha[] => {
    if (!Array.isArray(rel)) return [];
    const out: Falha[] = [];
    const seen = new Set<string>();
    rel.forEach((r) => {
      const k = String(r ?? "").toLowerCase().trim();
      if (!k) return;
      const matches: Falha[] = [];
      const a = indices.byId.get(k); if (a) matches.push(a);
      const b = indices.byCaso.get(k); if (b) matches.push(...b);
      const c = indices.byZip.get(k); if (c) matches.push(c);
      matches.forEach((m) => { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } });
    });
    return out;
  };

  type Item = {
    id: string;
    titulo: string;
    tipo: string | null;
    descricao: string | null;
    quantidade: number;
    classificacao_predominante: string | null;
    severidade_predominante: string | null;
    acao_recomendada: string | null;
    casos: Falha[];
    semVinculo?: boolean;
    isVisual?: boolean;
  };

  const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const items: Item[] = useMemo(() => {
    if (grupos.length > 0) {
      return grupos.map((g: any) => {
        // FONTE PRIMÁRIA: agrupamentos_falhas (com fallback fk_cluster no service)
        const linkedIds = links[String(g.id)] || [];
        let casos = resolveCasos(linkedIds);

        // FALLBACK: arquivos_relacionados
        let semVinculo = false;
        if (casos.length === 0) {
          const rel = Array.isArray(g.arquivos_relacionados)
            ? g.arquivos_relacionados.map((x: any) => String(x)).filter(Boolean)
            : [];
          casos = resolveCasos(rel);
          if (casos.length === 0) semVinculo = true;
        }

        const cls = new Map<string, number>(); const sevs = new Map<string, number>();
        casos.forEach((f) => {
          if (f.classificacao) cls.set(f.classificacao, (cls.get(f.classificacao) || 0) + 1);
          if (f.severidade) sevs.set(f.severidade, (sevs.get(f.severidade) || 0) + 1);
        });
        const quantidade = casos.length || (typeof g.quantidade === "number" && g.quantidade > 0 ? g.quantidade : 0);
        return {
          id: g.id,
          titulo: g.titulo || "Agrupamento",
          tipo: g.tipo,
          descricao: g.descricao,
          quantidade,
          classificacao_predominante: g.classificacao_predominante || top(cls),
          severidade_predominante: g.severidade_predominante || top(sevs),
          acao_recomendada: g.acao_recomendada,
          casos,
          semVinculo,
        };
      });
    }
    // Sem agrupamentos no DB: gera direto a partir das falhas
    const agg = new Map<string, { titulo: string; tipo: string; casos: Falha[]; classes: Map<string, number>; sevs: Map<string, number> }>();
    falhas.forEach((f) => {
      const key = f.grupo || f.classificacao || f.severidade || f.rotina_funcional || "Outros";
      const tipo = f.grupo ? "Grupo" : f.classificacao ? "Classificação" : f.severidade ? "Severidade" : f.rotina_funcional ? "Rotina funcional" : "Outros";
      const cur = agg.get(key) || { titulo: key, tipo, casos: [], classes: new Map(), sevs: new Map() };
      cur.casos.push(f);
      if (f.classificacao) cur.classes.set(f.classificacao, (cur.classes.get(f.classificacao) || 0) + 1);
      if (f.severidade) cur.sevs.set(f.severidade, (cur.sevs.get(f.severidade) || 0) + 1);
      agg.set(key, cur);
    });
    return Array.from(agg.values())
      .sort((a, b) => b.casos.length - a.casos.length)
      .map((g) => ({
        id: g.titulo,
        titulo: g.titulo,
        tipo: g.tipo,
        descricao: null,
        quantidade: g.casos.length,
        classificacao_predominante: top(g.classes),
        severidade_predominante: top(g.sevs),
        acao_recomendada: null,
        casos: g.casos,
        isVisual: true,
      }));
  }, [grupos, falhas, links, indices]);

  if (items.length === 0) return <Empty text="Sem agrupamentos." />;

  const visualAviso = items.some((i) => i.isVisual);

  return (
    <div className="space-y-4">
      {visualAviso && (
        <p className="text-xs text-muted-foreground italic">Agrupamento visual calculado a partir das falhas (sem dados em <code>agrupamentos.arquivos_relacionados</code>).</p>
      )}

      {items.map((g) => (
        <Card key={g.id} className="glass-card p-5">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              {g.tipo && <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.tipo}</div>}
              <h3 className="font-semibold mt-0.5">{g.titulo}</h3>
            </div>
            <Badge variant="outline" className="font-mono shrink-0">×{g.quantidade}</Badge>
          </div>
          {g.descricao && <p className="text-sm text-muted-foreground mb-3">{g.descricao}</p>}
          <div className="flex flex-wrap gap-2 mb-4">
            {g.classificacao_predominante && <ClassificationBadge value={g.classificacao_predominante} />}
            {g.severidade_predominante && <SeverityBadge value={g.severidade_predominante} />}
          </div>
          {g.acao_recomendada && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs mb-4">
              <strong className="text-primary">Ação:</strong> {g.acao_recomendada}
            </div>
          )}

          {g.casos.length > 0 ? (
            <GroupCasesList casos={g.casos} onSelect={onSelect} />
          ) : g.semVinculo ? (
            <p className="text-xs text-muted-foreground italic">
              Este agrupamento ainda não possui vínculos gravados. O Codex precisa preencher a tabela <code>agrupamentos_falhas</code>.
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function GroupCasesList({ casos, onSelect }: { casos: Falha[]; onSelect: (f: Falha) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Casos vinculados a esta quebra ({casos.length})
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar casos" : "Ver casos"}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          {casos.map((f) => {
            const desc = failureDescription(f);
            const titulo = f.caso_teste_provavel || f.erro_titulo || f.arquivo_zip || "Caso";
            const rid = f.rotina_funcional || f.subgrupo || "";
            return (
              <div
                key={f.id}
                className="rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-smooth p-3 cursor-pointer"
                onClick={() => onSelect(f)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {rid ? `[${rid}] ` : ""}{titulo}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                      {f.id_caso_teste && <span className="font-mono">#{f.id_caso_teste}</span>}
                      {f.arquivo_zip && <span className="truncate max-w-[220px]">{f.arquivo_zip}</span>}
                      {f.grupo && <span>{f.grupo}{f.subgrupo ? ` / ${f.subgrupo}` : ""}</span>}
                      {f.rotina_funcional && <span className="font-mono">{f.rotina_funcional}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {f.classificacao && <ClassificationBadge value={f.classificacao} />}
                      {f.severidade && <SeverityBadge value={f.severidade} />}
                    </div>
                    {desc && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{desc}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSelect(f); }}>Ver detalhe</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoricoTab({ runs, currentId, onPick }: { runs: Rodagem[]; currentId?: string; onPick: (id: string) => void }) {
  if (runs.length === 0) return <Empty text="Sem histórico." />;
  return (
    <Card className="glass-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead>Data</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Versão</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Falhas</TableHead>
            <TableHead className="text-right">Funcional</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => {
            const h = getHealthStatus(r.status_label || r.status_geral, r.score_saude);
            const active = r.id === currentId;
            return (
              <TableRow key={r.id} className={`border-border ${active ? "bg-primary/5" : ""}`}>
                <TableCell className="text-xs">{formatDateTime(r.data_analise)}</TableCell>
                <TableCell className="font-mono text-xs">{r.branch || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.versao_sistema || "—"}</TableCell>
                <TableCell><Badge variant="outline" className={h.className}>{h.label}</Badge></TableCell>
                <TableCell className="text-right font-mono">{r.total_falhas}</TableCell>
                <TableCell className="text-right font-mono text-functional">{r.total_possivel_funcional}</TableCell>
                <TableCell><Button size="sm" variant={active ? "default" : "ghost"} onClick={() => onPick(r.id)}>{active ? "Atual" : "Abrir"}</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function Empty({ text = "Sem dados." }: { text?: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

// ============= Performance helpers =============
function formatDuration(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const out = h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  return neg ? `-${out}` : out;
}

function PerfBadge({ status }: { status: AtrasoRodagem["status"] }) {
  if (status === "mais_lento") return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 gap-1"><TrendingUp className="h-3 w-3" />Mais lento</Badge>;
  if (status === "mais_rapido") return <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1"><TrendingDown className="h-3 w-3" />Mais rápido</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1"><Minus className="h-3 w-3" />Sem variação</Badge>;
}

function PerformanceTab({ data }: { data: AtrasoRodagem[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [caseFilter, setCaseFilter] = useState<string>("");

  const filtered = useMemo(() => {
    let out = [...data];
    if (statusFilter) out = out.filter((d) => d.status === statusFilter);
    if (caseFilter) out = out.filter((d) => d.codigo_teste === caseFilter);
    if (q) {
      const k = q.toLowerCase();
      out = out.filter((d) => `${d.codigo_teste} ${d.nome_teste}`.toLowerCase().includes(k));
    }
    return out.sort((a, b) => Math.abs(b.delay_segundos) - Math.abs(a.delay_segundos));
  }, [data, q, statusFilter, caseFilter]);

  if (data.length === 0) {
    return (
      <Card className="glass-card p-12 text-center">
        <Gauge className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-semibold">Nenhum dado de performance encontrado para esta rodagem.</h3>
        <p className="text-sm text-muted-foreground mt-1">Quando o Codex enviar dados de performance, eles aparecerão aqui.</p>
      </Card>
    );
  }

  const slow = data.filter((d) => d.status === "mais_lento");
  const fast = data.filter((d) => d.status === "mais_rapido");
  const equal = data.filter((d) => d.status === "igual");
  const maxDelay = slow.reduce((a, b) => (b.delay_segundos > a.delay_segundos ? b : a), slow[0] || null as any);
  const maxGain = fast.reduce((a, b) => (b.delay_segundos < a.delay_segundos ? b : a), fast[0] || null as any);
  const totalAdded = slow.reduce((s, d) => s + d.delay_segundos, 0);
  const totalSaved = fast.reduce((s, d) => s + Math.abs(d.delay_segundos), 0);

  const cards = [
    { label: "Registros", value: data.length, tone: "" },
    { label: "Mais lentos", value: slow.length, tone: "text-destructive" },
    { label: "Mais rápidos", value: fast.length, tone: "text-success" },
    { label: "Sem variação", value: equal.length, tone: "text-muted-foreground" },
    maxDelay && { label: "Maior atraso", value: formatDuration(maxDelay.delay_segundos), tone: "text-destructive" },
    maxGain && { label: "Maior ganho", value: formatDuration(Math.abs(maxGain.delay_segundos)), tone: "text-success" },
    totalAdded > 0 && { label: "Tempo adicional", value: formatDuration(totalAdded), tone: "text-destructive" },
    totalSaved > 0 && { label: "Tempo economizado", value: formatDuration(totalSaved), tone: "text-success" },
  ].filter(Boolean) as { label: string; value: any; tone: string }[];

  const distData = [
    { name: "Mais lentos", value: slow.length, color: "hsl(var(--destructive))" },
    { name: "Mais rápidos", value: fast.length, color: "hsl(var(--success))" },
    { name: "Sem variação", value: equal.length, color: "hsl(var(--muted-foreground))" },
  ].filter((d) => d.value > 0);

  const topSlow = [...slow].sort((a, b) => b.delay_segundos - a.delay_segundos).slice(0, 10);
  const topFast = [...fast].sort((a, b) => a.delay_segundos - b.delay_segundos).slice(0, 10);

  const topSlowChart = topSlow.map((d) => ({ name: d.codigo_teste || d.id, value: d.delay_segundos, label: formatDuration(d.delay_segundos) }));
  const topFastChart = topFast.map((d) => ({ name: d.codigo_teste || d.id, value: Math.abs(d.delay_segundos), label: formatDuration(Math.abs(d.delay_segundos)) }));

  const cases = Array.from(new Set(data.map((d) => d.codigo_teste).filter(Boolean))) as string[];

  const hasName = data.some((d) => d.nome_teste && d.nome_teste.trim());

  const copyRow = (d: AtrasoRodagem) => {
    const txt = [d.codigo_teste, d.nome_teste, d.tempo_padrao, d.tempo_atual, formatDuration(d.delay_segundos), `${d.variacao_pct.toFixed(1)}%`].filter(Boolean).join(" | ");
    navigator.clipboard.writeText(txt);
    toast.success("Linha copiada");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${c.tone}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {distData.length > 0 && (
          <Card className="glass-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Distribuição</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={distData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {distData.map((d, i) => <Cell key={i} fill={d.color} stroke="hsl(var(--background))" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {distData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name} <span className="font-mono text-muted-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {topSlowChart.length > 0 && (
          <Card className="glass-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Top {topSlowChart.length} maiores atrasos</h3>
            <ResponsiveContainer width="100%" height={Math.max(220, topSlowChart.length * 26)}>
              <BarChart data={topSlowChart} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatDuration(Number(v))} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatDuration(Number(v))} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {topFastChart.length > 0 && (
          <Card className="glass-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Top {topFastChart.length} maiores ganhos</h3>
            <ResponsiveContainer width="100%" height={Math.max(220, topFastChart.length * 26)}>
              <BarChart data={topFastChart} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatDuration(Number(v))} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatDuration(Number(v))} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                <Bar dataKey="value" fill="hsl(var(--success))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {(topSlow.length > 0 || topFast.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {topSlow.length > 0 && (
            <Card className="glass-card p-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-destructive" />Top atrasos</h3>
              <div className="space-y-2">
                {topSlow.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.nome_teste || d.codigo_teste}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{d.codigo_teste} · {d.tempo_padrao} → {d.tempo_atual}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-destructive">+{formatDuration(d.delay_segundos)}</div>
                      <PerfBadge status={d.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {topFast.length > 0 && (
            <Card className="glass-card p-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingDown className="h-4 w-4 text-success" />Top ganhos</h3>
              <div className="space-y-2">
                {topFast.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.nome_teste || d.codigo_teste}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{d.codigo_teste} · {d.tempo_padrao} → {d.tempo_atual}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-success">{formatDuration(d.delay_segundos)}</div>
                      <PerfBadge status={d.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Card className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome do caso..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            <option value="">Status: todos</option>
            <option value="mais_lento">Mais lento</option>
            <option value="mais_rapido">Mais rápido</option>
            <option value="igual">Sem variação</option>
          </select>
          {cases.length > 0 && (
            <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option value="">Caso: todos</option>
              {cases.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </Card>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Código</TableHead>
              {hasName && <TableHead>Caso de teste</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Tempo base</TableHead>
              <TableHead className="text-right">Tempo atual</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              <TableHead className="text-right">Variação</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={hasName ? 8 : 7} className="text-center text-sm text-muted-foreground py-12">Nenhum registro corresponde aos filtros.</TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id} className="border-border">
                <TableCell className="font-mono text-xs">{d.codigo_teste || "—"}</TableCell>
                {hasName && <TableCell className="text-sm max-w-[280px] truncate">{d.nome_teste || "—"}</TableCell>}
                <TableCell><PerfBadge status={d.status} /></TableCell>
                <TableCell className="text-right font-mono text-xs">{d.tempo_padrao || "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs">{d.tempo_atual || "—"}</TableCell>
                <TableCell className={`text-right font-mono text-xs ${d.status === "mais_lento" ? "text-destructive" : d.status === "mais_rapido" ? "text-success" : ""}`}>
                  {d.status === "mais_lento" ? "+" : ""}{formatDuration(d.delay_segundos)}
                </TableCell>
                <TableCell className={`text-right font-mono text-xs ${d.status === "mais_lento" ? "text-destructive" : d.status === "mais_rapido" ? "text-success" : ""}`}>
                  {d.variacao_pct > 0 ? "+" : ""}{d.variacao_pct.toFixed(1)}%
                </TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => copyRow(d)}><Copy className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
