import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchLatestRunByModule, fetchRunsByModule, fetchRunById,
  fetchFailuresByRun, fetchEvidenceByRun, fetchGroupsByRun, fetchNextStepsByRun,
  fetchPerformanceByRun, fetchGroupLinksByRun,
  subscribeToTable, fetchModules, listStorageFilesByRun, mergeEvidences,
  fetchTestcaseHierarchy,
  extractVmName,
  type TestcaseHierarchyNode,
} from "@/services/qa";

import type { Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, Modulo, AtrasoRodagem } from "@/types/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Button } from "@/components/ui/button";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronDown, ChevronRight, Search, FileText, Image as ImageIcon, FileArchive, RefreshCw, ArrowRight, ChevronsUpDown, Check, Lightbulb, Gauge, TrendingUp, TrendingDown, Minus, Copy, FolderTree, ArrowUp, ArrowDown } from "lucide-react";
import { formatDateTime, getHealthStatus, severityRank } from "@/lib/format";
import { ClassificationBadge, SeverityBadge, ConfidenceBadge } from "@/components/Badges";
import { FailureDetailSheet } from "@/components/FailureDetailSheet";
import { FileComparatorDialog } from "@/components/FileComparator";
import { classifyOccurrence, groupEvidsByFailure, pairBaseAtual, type ComparisonPair, type OccurrenceType } from "@/lib/occurrence";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import { useDebounce } from "@/hooks/useDebounce";

async function handleEvidenceDownload(ev: Evidencia) {
  const direct = ev.public_url || ev.signed_url;
  if (direct) { window.open(direct, "_blank", "noopener,noreferrer"); return; }
  const bucket = ev.bucket || STORAGE_BUCKET;
  if (!ev.storage_path) { toast.error("Sem URL disponível"); return; }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ev.storage_path, 60 * 60);
  if (error || !data?.signedUrl) { toast.error("Falha ao gerar link"); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

// Descrição clara do problema da falha — usa o melhor texto disponível
function failureDescription(f: Falha): string {
  const order = [f.erro_principal, f.mensagem_principal, f.erro_titulo, f.trecho_relevante, f.hipotese_principal, f.primeira_acao_recomendada, f.descricao_caso, f.caso_teste_provavel];
  for (const v of order) {
    if (v && String(v).trim() && String(v).trim() !== "—") return String(v).trim();
  }
  return "";
}

// Remove a extensão do nome para exibição limpa (ex: .txt não polui a lista)
function cleanFileName(nome?: string | null, extensao?: string | null): string {
  if (!nome) return "—";
  let out = nome;
  let ext = (extensao || "").trim().toLowerCase().replace(/^\.+/, "");
  if (ext) {
    const re = new RegExp(`\\.${ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    out = out.replace(re, "");
  }
  // Remove sufixos _Antigo / _Atual / _Base / _Gerado / _Novo / _Original / _Referencia / _Esperado ...
  out = out.replace(/[_\-\. ]+(antigo|atual|base|gerado|gerada|novo|nova|original|referencia|referência|esperado|esperada|padrao|padrão|anterior|previo|prévio|antes|depois|current|new)$/i, "");
  return out;
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
  const [hierarchy, setHierarchy] = useState<TestcaseHierarchyNode[]>([]);
  const [activeTab, setActiveTab] = useState("resumo");
  const [falhasSubTab, setFalhasSubTab] = useState<"todos" | "quebra" | "diferenca" | "quebra_diferenca">("todos");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFalha, setSelectedFalha] = useState<Falha | null>(null);
  const [comparePair, setComparePair] = useState<{ pair: ComparisonPair; falha: Falha } | null>(null);

  // Controle de race condition: cada loadAll incrementa o id; respostas atrasadas são ignoradas
  const requestRef = useRef(0);
  const currentSlugRef = useRef(slug);

  const moduleName = modulo?.nome || slug;

  const loadAll = async (runId?: string, targetSlug: string = slug) => {
    const reqId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      // Fetches independentes rodam em paralelo
      const [mods, runs] = await Promise.all([fetchModules(), fetchRunsByModule(targetSlug)]);
      if (reqId !== requestRef.current) return;
      setModulo(mods.find((x) => x.slug === targetSlug) || null);
      setHistorico(runs);
      const r = runId ? await fetchRunById(runId) : (runs[0] || (await fetchLatestRunByModule(targetSlug)));
      if (reqId !== requestRef.current) return;
      setRodagem(r);
      if (r) {
        const [f, e, g, p, perf, links, storageFiles, hier] = await Promise.all([
          fetchFailuresByRun(r.id), fetchEvidenceByRun(r.id), fetchGroupsByRun(r.id), fetchNextStepsByRun(r.id),
          fetchPerformanceByRun(r.id), fetchGroupLinksByRun(r.id),
          listStorageFilesByRun(r.id, targetSlug, r.pasta_origem),
          fetchTestcaseHierarchy(targetSlug),
        ]);
        if (reqId !== requestRef.current) return;
        const merged = mergeEvidences(e, storageFiles);
        setFalhas(f); setEvidencias(merged); setGrupos(g); setPassos(p); setPerformance(perf); setGroupLinks(links); setHierarchy(hier);
      } else {
        setFalhas([]); setEvidencias([]); setGrupos([]); setPassos([]); setPerformance([]); setGroupLinks({}); setHierarchy([]);
      }
    } catch (e: any) {
      if (reqId !== requestRef.current) return;
      setLoadError(e?.message || "Erro ao carregar módulo");
      toast.error("Erro ao carregar módulo", { description: e?.message });
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Trocou de módulo → invalida tudo IMEDIATAMENTE para evitar mostrar dados antigos
    currentSlugRef.current = slug;
    requestRef.current++; // cancela respostas em voo do módulo anterior
    setModulo(null);
    setRodagem(null);
    setHistorico([]);
    setFalhas([]);
    setEvidencias([]);
    setGrupos([]);
    setPassos([]);
    setPerformance([]);
    setGroupLinks({});
    setHierarchy([]);
    setSelectedFalha(null);
    setComparePair(null);
    setActiveTab("resumo");
    setLoading(true);
    setLoadError(null);

    loadAll(undefined, slug);
    const offs = [
      subscribeToTable("rodagens", (p) => {
        if (p.new?.modulo_slug === currentSlugRef.current) {
          toast.success("Nova rodagem recebida");
          loadAll(undefined, currentSlugRef.current);
        }
      }),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-fade-in space-y-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
            <RefreshCw className="relative h-4 w-4 animate-spin text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Carregando módulo {moduleName}...</span>
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-fade-in">
        <Card className="glass-card p-12 text-center">
          <h3 className="text-lg font-semibold">Não foi possível carregar os dados deste módulo</h3>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-4" onClick={() => loadAll(undefined, slug)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      </div>
    );
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

          <TabsContent value="resumo" className="mt-6"><ResumoTab rodagem={rodagem} falhas={falhas} evidencias={evidencias} performance={performance} onOpenPerformance={() => setActiveTab("performance")} onOpenFalhas={(sub) => { setFalhasSubTab(sub); setActiveTab("falhas"); }} /></TabsContent>
          <TabsContent value="falhas" className="mt-6"><FalhasTab moduloNome={modulo?.nome || ""} falhas={falhas} evidencias={evidencias} hierarchy={hierarchy} subTab={falhasSubTab} setSubTab={setFalhasSubTab} onSelect={setSelectedFalha} onCompare={(pair, falha) => setComparePair({ pair, falha })} /></TabsContent>
          <TabsContent value="agrupamentos" className="mt-6"><AgrupamentosTab grupos={grupos} falhas={falhas} links={groupLinks} onSelect={setSelectedFalha} /></TabsContent>
          <TabsContent value="performance" className="mt-6"><PerformanceTab data={performance} /></TabsContent>
          <TabsContent value="historico" className="mt-6"><HistoricoTab runs={historico} currentId={rodagem.id} onPick={(id) => loadAll(id)} /></TabsContent>
        </Tabs>
      )}

      <FailureDetailSheet
        falha={selectedFalha}
        open={!!selectedFalha}
        onClose={() => setSelectedFalha(null)}
        evidencias={selectedFalha ? evidencias.filter((e) => {
          if (e.falha_id && e.falha_id === selectedFalha.id) return true;
          // falhas sintéticas: id "storage:{folder}" → evidências cujo path está dentro do folder
          if (selectedFalha.id?.startsWith("storage:")) {
            const folder = selectedFalha.id.replace(/^storage:/, "");
            return (e.storage_path || "").startsWith(folder);
          }
          return false;
        }) : undefined}
      />
      <FileComparatorDialog open={!!comparePair} pair={comparePair?.pair || null} falha={comparePair?.falha || null} onClose={() => setComparePair(null)} />
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
    { label: "Data", value: formatDateTime(rodagem.data_analise) },
  ].filter((f) => isMeaningful(f.value)) : [];
  return (
    <Card className="glass-card p-6 lg:p-8 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="flex flex-col lg:flex-row lg:items-start gap-6 justify-between relative">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{modulo?.nome || "Módulo"}</h1>
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

function ResumoTab({ rodagem, falhas, evidencias, performance, onOpenPerformance, onOpenFalhas }: { rodagem: Rodagem; falhas: Falha[]; evidencias: Evidencia[]; performance: AtrasoRodagem[]; onOpenPerformance: () => void; onOpenFalhas: (sub: "todos" | "quebra" | "diferenca" | "quebra_diferenca") => void }) {
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

  const rotinaData = useMemo(() => {
    const m = new Map<string, number>();
    falhas.forEach((f) => { if (f.rotina_funcional) m.set(f.rotina_funcional, (m.get(f.rotina_funcional) || 0) + 1); });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [falhas]);

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
    </div>
  );
}

// ============ Blocos operacionais (Jenkins / rerun_requests) ============


type EnrichedItem = { f: Falha; evs: Evidencia[]; tipo: OccurrenceType; pairs: ComparisonPair[] };

type TreeNode = {
  id: string;            // caminho completo: "1.3.7"
  segment: string;       // último segmento: "7"
  label: string;
  fullPath: string;      // "[1] Folha > [1.3] Tabelas > [1.3.7] ..."
  children: Map<string, TreeNode>;
  items: EnrichedItem[]; // falhas cujo ID == node.id
  counts: { quebra: number; diferenca: number; quebra_diferenca: number; total: number };
};

function extractCaseIdParts(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const m = String(raw).match(/\d+(?:\.\d+)*/);
  if (!m) return null;
  return m[0].split(".");
}

function buildFailuresTree(
  items: EnrichedItem[],
  moduloNome: string,
  hierMap: Map<string, TestcaseHierarchyNode>,
) {
  const root: TreeNode = { id: "", segment: "", label: "", fullPath: "", children: new Map(), items: [], counts: { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } };
  const orphans: EnrichedItem[] = [];

  for (const it of items) {
    const parts = extractCaseIdParts(it.f.id_caso_teste);
    if (!parts || parts.length === 0) { orphans.push(it); continue; }
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).join(".");
      let child = cur.children.get(id);
      if (!child) {
        child = { id, segment: parts[i], label: "", fullPath: "", children: new Map(), items: [], counts: { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } };
        cur.children.set(id, child);
      }
      cur = child;
    }
    cur.items.push(it);
  }

  const nameMap = buildNameMapFromHierarchy(hierMap);
  const finalize = (node: TreeNode, depth: number) => {
    // Prioridade: nameMap (derivado de full_path_label) > node_name > metadados da falha > fallback
    const nm = nameMap.get(node.id);
    const hier = hierMap.get(node.id);
    if (nm && nm.trim()) {
      node.label = nm.trim();
    } else if (hier?.node_name && hier.node_name.trim()) {
      node.label = hier.node_name.trim();
    } else if (node.items.length) {
      const it = node.items[0];
      node.label = (it.f.caso_teste_provavel || it.f.descricao_caso || it.f.erro_titulo || "").toString();
    } else if (depth === 1 && moduloNome) {
      node.label = moduloNome;
    } else {
      node.label = "";
    }

    node.fullPath = buildFullPathLabel(node.id, hierMap, nameMap, moduloNome);
    node.children.forEach((c) => {
      finalize(c, depth + 1);
      node.counts.quebra += c.counts.quebra;
      node.counts.diferenca += c.counts.diferenca;
      node.counts.quebra_diferenca += c.counts.quebra_diferenca;
      node.counts.total += c.counts.total;
    });
    for (const it of node.items) {
      node.counts[it.tipo] = (node.counts[it.tipo] || 0) + 1;
      node.counts.total++;
    }
  };
  root.children.forEach((c) => finalize(c, 1));
  return { root, orphans };
}

// Parseia "[2] Fiscal > [2.6] Integrações > ..." em pares {id, name}
function parseFullPathLabel(label: string): Array<{ id: string; name: string }> {
  if (!label) return [];
  return label.split(">").map((seg) => {
    const m = seg.trim().match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!m) return null;
    return { id: m[1].trim(), name: m[2].trim() };
  }).filter(Boolean) as Array<{ id: string; name: string }>;
}

// Constrói id -> nome extraindo de full_path_label de TODOS os nós da hierarquia,
// garantindo nomes reais de pais/intermediários mesmo sem linha própria em testcase_hierarchy.
function buildNameMapFromHierarchy(hierMap: Map<string, TestcaseHierarchyNode>): Map<string, string> {
  const nameMap = new Map<string, string>();
  hierMap.forEach((h) => {
    parseFullPathLabel(h?.full_path_label || "").forEach(({ id, name }) => {
      if (id && name && !nameMap.has(id)) nameMap.set(id, name);
    });
    if (h?.node_id && h?.node_name && !nameMap.has(String(h.node_id))) {
      nameMap.set(String(h.node_id), String(h.node_name).trim());
    }
  });
  return nameMap;
}

// Constrói caminho completo "[1] Folha > [1.3] Tabelas > [1.3.7] ..." de um node_id
function buildFullPathLabel(nodeId: string, hierMap: Map<string, TestcaseHierarchyNode>, nameMap: Map<string, string>, moduloNome: string): string {
  const direct = hierMap.get(nodeId);
  if (direct?.full_path_label && direct.full_path_label.trim()) return direct.full_path_label.trim();
  const parts = nodeId.split(".");
  const segs: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const id = parts.slice(0, i + 1).join(".");
    const nm = nameMap.get(id);
    const h = hierMap.get(id);
    const name = (nm && nm.trim()) || h?.node_name?.trim() || (i === 0 && moduloNome ? moduloNome : `Grupo ${id}`);
    segs.push(`[${id}] ${name}`);
  }
  return segs.join(" > ");
}

function collectAllNodeIds(node: TreeNode, acc: string[] = []): string[] {
  node.children.forEach((c) => { acc.push(c.id); collectAllNodeIds(c, acc); });
  return acc;
}

function itemMatches(it: EnrichedItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const parts = [
    it.f.id_caso_teste, it.f.caso_teste_provavel, it.f.descricao_caso, it.f.erro_titulo,
    it.f.erro_principal, it.f.mensagem_principal, it.f.grupo, it.f.subgrupo, it.f.rotina_funcional,
  ];
  for (const p of parts) if (p && String(p).toLowerCase().includes(needle)) return true;
  for (const e of it.evs) {
    if ((e.nome_arquivo || "").toLowerCase().includes(needle)) return true;
    if ((e.extensao || "").toLowerCase().includes(needle)) return true;
    if ((e.storage_path || "").toLowerCase().includes(needle)) return true;
  }
  for (const p of it.pairs) {
    if ((p.base?.nome_arquivo || "").toLowerCase().includes(needle)) return true;
    if ((p.atual?.nome_arquivo || "").toLowerCase().includes(needle)) return true;
  }
  return false;
}

function FalhasTab({
  moduloNome, falhas, evidencias, hierarchy, subTab, setSubTab, onSelect, onCompare,
}: {
  moduloNome: string;
  falhas: Falha[];
  evidencias: Evidencia[];
  hierarchy: TestcaseHierarchyNode[];
  subTab: "todos" | "quebra" | "diferenca" | "quebra_diferenca";
  setSubTab: (s: "todos" | "quebra" | "diferenca" | "quebra_diferenca") => void;
  onSelect: (f: Falha) => void;
  onCompare: (pair: ComparisonPair, falha: Falha) => void;
}) {
  const [q, setQ] = useState("");
  const [extFilter, setExtFilter] = useState<string>("");
  const debouncedQ = useDebounce(q, 250);

  const hierMap = useMemo(() => {
    const m = new Map<string, TestcaseHierarchyNode>();
    hierarchy.forEach((h) => { if (h?.node_id) m.set(String(h.node_id), h); });
    return m;
  }, [hierarchy]);

  const evMap = useMemo(() => groupEvidsByFailure(evidencias), [evidencias]);

  // Calcula pares base/atual uma única vez por falha e reaproveita em tudo abaixo
  const realPairsByFalha = useMemo(() => {
    const m = new Map<string, ComparisonPair[]>();
    falhas.forEach((f) => { m.set(f.id, pairBaseAtual(evMap.get(f.id) || [])); });
    return m;
  }, [falhas, evMap]);

  const realPairKeys = useMemo(() => {
    const set = new Set<string>();
    realPairsByFalha.forEach((pairs) => pairs.forEach((p) => set.add(p.key)));
    return set;
  }, [realPairsByFalha]);

  const syntheticFalhas = useMemo(() => {
    const orphan = evidencias.filter((e) => !e.falha_id);
    if (orphan.length === 0) return [] as { f: Falha; evs: Evidencia[]; pairs: ComparisonPair[] }[];
    const byCmpFolder = new Map<string, Evidencia[]>();
    orphan.forEach((e) => {
      const path = (e.storage_path || "").replace(/\\/g, "/");
      const m = path.match(/^(.*\/comparacao)\//i);
      if (!m) return;
      const folder = m[1];
      const arr = byCmpFolder.get(folder) || [];
      arr.push(e);
      byCmpFolder.set(folder, arr);
    });
    const out: { f: Falha; evs: Evidencia[]; pairs: ComparisonPair[] }[] = [];
    byCmpFolder.forEach((evs, cmpFolder) => {
      if (realPairKeys.has(`cmp:${cmpFolder}`)) return;
      const pairs = pairBaseAtual(evs);
      if (!pairs.length) return;
      const caseFolder = cmpFolder.replace(/\/comparacao$/i, "");
      const caseName = caseFolder.split("/").pop() || caseFolder;
      const id = `storage:${caseFolder}`;
      const f = {
        id, rodagem_id: evs[0]?.rodagem_id || "", modulo_slug: evs[0]?.modulo_slug || "",
        ordem_prioridade: null, arquivo_zip: null, arquivo_txt: null, arquivo_print: null,
        caso_identificado: false, id_caso_teste: caseName,
        caso_teste_provavel: `Comparação: ${caseName}`,
        grupo: "Storage", subgrupo: null, rotina_funcional: null, descricao_caso: caseFolder, confianca_associacao: null,
        erro_titulo: null, erro_principal: null, mensagem_principal: null, trecho_relevante: null,
        call_stack_resumido: null, tipo_tecnico: "diferenca_arquivo", formulario_ou_tela: null, componente: null,
        classificacao: null, classificacao_label: null, severidade: null, confianca: null, status_analise: null,
        cor: null, fato_observado: null, hipotese_principal: null, analise_tecnica: null, analise_funcional: null,
        impacto_possivel: null, primeira_acao_recomendada: null, informacoes_faltantes: null, tags: null,
        created_at: "",
      } as Falha;
      out.push({ f, evs, pairs });
    });
    return out;
  }, [evidencias, realPairKeys]);

  const enriched: EnrichedItem[] = useMemo(() => {
    const real: EnrichedItem[] = falhas.map((f) => {
      const evs = evMap.get(f.id) || [];
      const pairs = realPairsByFalha.get(f.id) || [];
      return { f, evs, tipo: classifyOccurrence(f, evs), pairs };
    });
    const synth: EnrichedItem[] = syntheticFalhas.map(({ f, evs, pairs }) => ({ f, evs, tipo: classifyOccurrence(f, evs), pairs }));
    return real.concat(synth);
  }, [falhas, evMap, realPairsByFalha, syntheticFalhas]);

  const counts = useMemo(() => {
    const c = { quebra: 0, diferenca: 0, quebra_diferenca: 0 };
    enriched.forEach((e) => { c[e.tipo]++; });
    return { ...c, todos: enriched.length };
  }, [enriched]);

  const allExts = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((e) => e.pairs.forEach((p) => p.extensao && s.add(p.extensao)));
    return Array.from(s).sort();
  }, [enriched]);




  // Busca também considera nomes reais dos grupos/casos vindos da hierarquia
  const filteredByHierSearch = useMemo(() => {
    if (!debouncedQ) return enriched;
    const needle = debouncedQ.toLowerCase();
    const matchingIds = new Set<string>();
    hierMap.forEach((h, id) => {
      if ((h.node_name || "").toLowerCase().includes(needle) ||
          (h.full_path_names || "").toLowerCase().includes(needle) ||
          (h.full_path_label || "").toLowerCase().includes(needle) ||
          (h.script_name || "").toLowerCase().includes(needle) ||
          (h.procedure_name || "").toLowerCase().includes(needle)) {
        matchingIds.add(id);
      }
    });
    if (matchingIds.size === 0) return enriched;
    return enriched.filter((it) => {
      if (itemMatches(it, debouncedQ)) return true;
      const parts = extractCaseIdParts(it.f.id_caso_teste);
      if (!parts) return false;
      for (let i = 0; i < parts.length; i++) {
        if (matchingIds.has(parts.slice(0, i + 1).join("."))) return true;
      }
      return false;
    });
  }, [enriched, debouncedQ, hierMap]);

  const filtered = useMemo(() => filteredByHierSearch.filter(({ tipo, pairs }) => {
    if (subTab !== "todos" && tipo !== subTab) return false;
    if (extFilter && !pairs.some((p) => p.extensao === extFilter)) return false;
    return true;
  }), [filteredByHierSearch, subTab, extFilter]);

  const { root, orphans } = useMemo(() => buildFailuresTree(filtered, moduloNome, hierMap), [filtered, moduloNome, hierMap]);

  const allIds = useMemo(() => collectAllNodeIds(root), [root]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const hasActiveFilter = Boolean(debouncedQ || extFilter || subTab !== "todos");
  // Estado inicial recolhido; expande automaticamente apenas quando há filtro/busca ativos
  useEffect(() => {
    setExpanded(hasActiveFilter ? new Set(allIds) : new Set());
  }, [allIds, hasActiveFilter]);

  const toggle = (id: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set());

  // Smart open: ao clicar num grupo/subgrupo abaixo do módulo, expande o
  // caminho até o primeiro caso com falha/diferença visível no filtro atual.
  const smartOpen = (node: TreeNode, depth: number) => {
    if (depth === 0) { toggle(node.id); return; }
    if (expanded.has(node.id)) { toggle(node.id); return; }
    const path: string[] = [];
    const dfs = (n: TreeNode): boolean => {
      if (n.items.length > 0) return true;
      const kids = Array.from(n.children.values())
        .filter((k) => k.counts.total > 0)
        .sort((a, b) => Number(a.segment) - Number(b.segment) || a.segment.localeCompare(b.segment));
      for (const k of kids) {
        path.push(k.id);
        if (dfs(k)) return true;
        path.pop();
      }
      return false;
    };
    dfs(node);
    setExpanded((prev) => new Set([...prev, node.id, ...path]));
  };


  const SubTabBtn = ({ id, label, count, tone }: { id: typeof subTab; label: string; count: number; tone?: string }) => (
    <button
      onClick={() => setSubTab(id)}
      className={`px-3 h-8 rounded-md text-xs font-medium transition-smooth border ${
        subTab === id ? "bg-primary/15 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className={`font-mono ml-1 ${tone || ""}`}>({count})</span>
    </button>
  );

  const rootChildren = Array.from(root.children.values()).sort((a, b) => Number(a.segment) - Number(b.segment));
  const isEmpty = filtered.length === 0;

  return (
    <div className="space-y-4">
      <Card className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <SubTabBtn id="quebra" label="Quebras" count={counts.quebra} tone="text-destructive" />
          <SubTabBtn id="diferenca" label="Diferenças" count={counts.diferenca} tone="text-warning" />
          <SubTabBtn id="quebra_diferenca" label="Quebra + Diferença" count={counts.quebra_diferenca} tone="text-primary" />
          <SubTabBtn id="todos" label="Todos" count={counts.todos} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por ID, nome, descrição, arquivo ou extensão..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background flex-1 min-w-[220px]" />
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={expandAll}><FolderTree className="h-3.5 w-3.5" /> Expandir tudo</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={collapseAll}>Recolher tudo</Button>
          </div>
        </div>
      </Card>

      {isEmpty ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          {debouncedQ || extFilter || subTab !== "todos"
            ? "Nenhum item encontrado para os filtros aplicados."
            : "Nenhuma falha encontrada neste módulo."}
        </Card>
      ) : (
        <Card className="p-2 md:p-3 bg-card/60 backdrop-blur-xl border-border/70 shadow-[0_8px_32px_-12px_hsl(222_50%_2%/0.5)]">
          <div className="space-y-0.5">
            {rootChildren.map((c) => (
              <TreeNodeView key={c.id} node={c} depth={0} expanded={expanded} onToggle={toggle} onSmartOpen={smartOpen} onSelect={onSelect} onCompare={onCompare} />
            ))}

            {orphans.length > 0 && (
              <OrphanGroup items={orphans} expanded={expanded} onToggle={toggle} onSelect={onSelect} onCompare={onCompare} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: OccurrenceType }) {
  const base = "text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full border";
  if (tipo === "quebra")
    return <Badge variant="outline" className={`${base} bg-rose-500/10 text-rose-300 border-rose-500/30`}>Quebra</Badge>;
  if (tipo === "diferenca")
    return <Badge variant="outline" className={`${base} bg-amber-900/25 text-amber-200/90 border-amber-700/40`}>Diferença</Badge>;
  return <Badge variant="outline" className={`${base} bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30`}>Quebra + Diferença</Badge>;
}

function CountsPills({ counts }: { counts: TreeNode["counts"] }) {
  const totalDif = counts.diferenca + counts.quebra_diferenca;
  const pill = "text-[10px] font-medium px-1.5 py-0 rounded-full border tabular-nums";
  return (
    <div className="flex gap-1 flex-wrap">
      {counts.quebra > 0 && <Badge variant="outline" className={`${pill} bg-rose-500/10 text-rose-300 border-rose-500/25`}>{counts.quebra} quebra</Badge>}
      {totalDif > 0 && <Badge variant="outline" className={`${pill} bg-amber-500/10 text-amber-300 border-amber-500/25`}>{totalDif} dif.</Badge>}
    </div>
  );
}

// Estilo hierárquico por profundidade: nível 0 = módulo (forte), 1 = grupo, 2 = subgrupo, 3+ = subgrupos menores
function nodeStyleForDepth(depth: number, open: boolean) {
  const activeChip = "bg-foreground/[0.14] border-foreground/25 text-foreground font-semibold";
  const idleChip = "bg-muted/40 border-border/50 text-muted-foreground group-hover:bg-muted/70 group-hover:border-border group-hover:text-foreground";
  if (depth === 0) {
    return {
      row: "py-2.5 mt-2 first:mt-0",
      idChip: `font-mono text-sm rounded-md px-2 py-0.5 border transition-colors ${open ? activeChip : `font-semibold ${idleChip}`}`,
      label: `text-base tracking-tight ${open ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`,
    };
  }
  if (depth === 1) {
    return {
      row: "py-2",
      idChip: `font-mono text-[13px] rounded-md px-2 py-0.5 border transition-colors ${open ? activeChip : `font-semibold ${idleChip}`}`,
      label: `text-[15px] ${open ? "font-semibold text-foreground" : "font-medium text-foreground/85"}`,
    };
  }
  return {
    row: "py-1.5",
    idChip: `font-mono text-xs rounded-md px-1.5 py-0.5 border transition-colors ${open ? activeChip : `font-medium ${idleChip}`}`,
    label: `text-sm ${open ? "font-medium text-foreground" : "text-foreground/75"}`,
  };
}

function TreeNodeView({
  node, depth, expanded, onToggle, onSmartOpen, onSelect, onCompare,
}: {
  node: TreeNode; depth: number; expanded: Set<string>;
  onToggle: (id: string) => void;
  onSmartOpen: (node: TreeNode, depth: number) => void;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const hasChildren = node.children.size > 0 || node.items.length > 0;
  const open = expanded.has(node.id);
  const indent = depth * 16;
  const style = nodeStyleForDepth(depth, open);

  return (
    <div>
      <div
        className={`group flex items-center gap-2.5 pr-2 rounded-lg cursor-pointer transition-colors hover:bg-secondary/60 ${style.row}`}
        style={{ paddingLeft: indent + 8 }}
        onClick={() => hasChildren && onSmartOpen(node, depth)}
      >

        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground transition-transform" style={{ transform: open ? "rotate(0deg)" : "rotate(0deg)" }}>
          {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />}
        </span>
        <span className={`shrink-0 tabular-nums tracking-tight ${style.idChip}`}>
          [{node.id}]
        </span>
        <span className={`truncate ${style.label}`}>{node.label}</span>
      </div>
      {open && (
        <div className="relative">
          {/* Linha guia sutil */}
          <div
            className="absolute top-0 bottom-0 w-px bg-border/70"
            style={{ left: indent + 15 }}
            aria-hidden
          />
          {node.items.map((it) => (
            <LeafItemCard key={it.f.id} item={it} depth={depth + 1} onSelect={onSelect} onCompare={onCompare} />
          ))}
          {Array.from(node.children.values())
            .sort((a, b) => Number(a.segment) - Number(b.segment) || a.segment.localeCompare(b.segment))
            .map((c) => (
              <TreeNodeView key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSmartOpen={onSmartOpen} onSelect={onSelect} onCompare={onCompare} />
            ))}
        </div>
      )}
    </div>
  );
}

function LeafItemCard({
  item, depth, onSelect, onCompare,
}: {
  item: EnrichedItem; depth: number;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const { f, tipo, pairs } = item;
  const desc = failureDescription(f);
  const isQuebra = tipo === "quebra" || tipo === "quebra_diferenca";
  const isDiff = tipo === "diferenca" || tipo === "quebra_diferenca";
  const titulo = f.caso_teste_provavel || f.erro_titulo || f.arquivo_zip || "Caso";
  const script = f.rotina_funcional || f.componente || f.formulario_ou_tela;
  const idCaso = f.id_caso_teste;
  const indent = depth * 16 + 20;

  const accent =
    tipo === "quebra" ? "border-rose-500/40"
    : tipo === "diferenca" ? "border-amber-700/50"
    : "border-fuchsia-500/40";

  return (
    <div
      className={`ml-1 my-2 border-l-2 ${accent} bg-card/80 hover:bg-card border border-border/60 hover:border-border rounded-r-lg cursor-pointer transition-colors shadow-sm hover:shadow-md`}
      style={{ marginLeft: indent }}
      onClick={() => onSelect(f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f); } }}
    >
      <div className="px-4 py-3 space-y-2.5">
        {/* Cabeçalho: ID + Status */}
        <div className="flex items-start gap-2.5 flex-wrap">
          {idCaso && (
            <span className="font-mono text-[11px] font-semibold text-foreground bg-muted border border-border rounded-md px-2 py-0.5 shrink-0 tabular-nums">
              #{idCaso}
            </span>
          )}
          <div className="flex-1 min-w-0" />
          <TipoBadge tipo={tipo} />
        </div>


        {/* Metadata secundária */}
        {(script || f.severidade || f.classificacao) && (
          <div className="flex items-center gap-2 flex-wrap">
            {f.severidade && <SeverityBadge value={f.severidade} />}
            {f.classificacao && <ClassificationBadge value={f.classificacao} />}
            {script && (
              <span className="text-[11px] text-muted-foreground">
                <span className="opacity-80">Script:</span> <span className="font-mono text-foreground/80">{script}</span>
              </span>
            )}
          </div>
        )}

        {/* Descrição */}
        {isQuebra && desc && (
          <p className="text-[13px] text-foreground/75 leading-relaxed line-clamp-3">{desc}</p>
        )}

        {/* Pares de comparação */}
        {isDiff && pairs.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {pairs.map((p) => {
              const ext = (p.extensao || "").trim().toLowerCase().replace(/^\.+/, "");
              const displayName = cleanFileName(p.base?.nome_arquivo, p.extensao) || cleanFileName(p.atual?.nome_arquivo, p.extensao);
              return (
                <div key={p.key} className="flex items-center gap-2 flex-wrap text-xs bg-background/50 rounded-md px-3 py-2 border border-border/50">
                  {ext && ext !== "txt" && <Badge variant="outline" className="text-[10px] font-mono">.{ext}</Badge>}
                  <div className="flex-1 min-w-0 font-mono text-[12px] truncate text-foreground/85" title={displayName}>{displayName}</div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); onCompare(p, f); }}
                  >
                    Ver diferenças
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {isDiff && pairs.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Arquivos de comparação não vinculados.</p>
        )}

        {/* Rodapé de ações */}
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-secondary hover:bg-secondary/80 border border-border/60"
            onClick={(e) => { e.stopPropagation(); onSelect(f); }}
          >
            Detalhes
          </Button>
        </div>
      </div>
    </div>
  );
}


function OrphanGroup({
  items, expanded, onToggle, onSelect, onCompare,
}: {
  items: EnrichedItem[]; expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const id = "__orphan__";
  const open = expanded.has(id) || !expanded.size;
  const counts = items.reduce(
    (acc, it) => { acc[it.tipo]++; acc.total++; return acc; },
    { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } as TreeNode["counts"],
  );
  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1.5 pr-2 pl-2 rounded-md hover:bg-secondary/40 cursor-pointer"
        onClick={() => onToggle(id)}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="font-mono text-sm font-bold text-muted-foreground bg-muted/40 border border-border rounded px-2 py-0.5 shrink-0">[sem ID]</span>
        <span className="text-sm text-muted-foreground truncate">Sem identificação numérica</span>
        <div className="ml-auto"><CountsPills counts={counts} /></div>
      </div>
      {open && (
        <div>
          {items.map((it) => (
            <LeafItemCard key={it.f.id} item={it} depth={1} onSelect={onSelect} onCompare={onCompare} />
          ))}
        </div>
      )}
    </div>
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

  const filteredItems = useMemo(() => items.filter((g) => g.quantidade > 1), [items]);

  if (filteredItems.length === 0) return <Empty text="Sem agrupamentos com múltiplos casos." />;

  const visualAviso = filteredItems.some((i) => i.isVisual);

  return (
    <div className="space-y-4">
      {visualAviso && (
        <p className="text-xs text-muted-foreground italic">Agrupamento visual calculado a partir das falhas (sem dados em <code>agrupamentos.arquivos_relacionados</code>).</p>
      )}

      {filteredItems.map((g) => (
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
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  if (runs.length === 0) return <Empty text="Sem histórico." />;
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRuns = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div className="space-y-3">
      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Data</TableHead>
              <TableHead>VM</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead className="text-right">Falhas</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRuns.map((r) => {
              const active = r.id === currentId;
              return (
                <TableRow key={r.id} className={`border-border ${active ? "bg-primary/5" : ""}`}>
                  <TableCell className="text-xs">{formatDateTime(r.data_analise)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem) || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.versao_sistema || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_falhas}</TableCell>
                  <TableCell>
                    {active
                      ? <Button size="sm" variant="ghost" disabled>Atual</Button>
                      : <Button size="sm" variant="outline" onClick={() => onPick(r.id)}>Abrir</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, runs.length)} de {runs.length}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
            <span className="text-xs font-mono text-muted-foreground">{currentPage} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  type SortKey = "codigo" | "nome" | "status" | "base" | "atual" | "diff" | "var";
  const [sortKey, setSortKey] = useState<SortKey>("diff");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debouncedQ = useDebounce(q, 250);

  const groupOf = (codigo?: string | null) => {
    const m = String(codigo || "").match(/^(\d+(?:\.\d+)?)/);
    return m ? m[1] : "";
  };

  const parseTimeToSec = (s?: string | null): number => {
    if (!s) return 0;
    const parts = String(s).trim().split(":").map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "codigo" || k === "nome" ? "asc" : "desc"); }
  };

  const filtered = useMemo(() => {
    let out = [...data];
    if (statusFilter !== "all") out = out.filter((d) => d.status === statusFilter);
    if (groupFilter !== "all") out = out.filter((d) => groupOf(d.codigo_teste) === groupFilter);
    if (caseFilter !== "all") out = out.filter((d) => d.codigo_teste === caseFilter);
    if (debouncedQ) {
      const k = debouncedQ.toLowerCase();
      out = out.filter((d) => `${d.codigo_teste} ${d.nome_teste}`.toLowerCase().includes(k));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const statusRank: Record<string, number> = { mais_lento: 0, igual: 1, mais_rapido: 2 };
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "codigo": cmp = (a.codigo_teste || "").localeCompare(b.codigo_teste || "", undefined, { numeric: true }); break;
        case "nome": cmp = (a.nome_teste || "").localeCompare(b.nome_teste || ""); break;
        case "status": cmp = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9); break;
        case "base": cmp = parseTimeToSec(a.tempo_padrao) - parseTimeToSec(b.tempo_padrao); break;
        case "atual": cmp = parseTimeToSec(a.tempo_atual) - parseTimeToSec(b.tempo_atual); break;
        case "diff": cmp = Math.abs(a.delay_segundos) - Math.abs(b.delay_segundos); break;
        case "var": cmp = Math.abs(a.variacao_pct) - Math.abs(b.variacao_pct); break;
      }
      return cmp * dir;
    });
    return out;
  }, [data, debouncedQ, statusFilter, caseFilter, groupFilter, sortKey, sortDir]);



  if (data.length === 0) {
    return (
      <Card className="glass-card p-12 text-center">
        <Gauge className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-semibold">Nenhum dado de performance encontrado para esta rodagem.</h3>
        <p className="text-sm text-muted-foreground mt-1">Quando o Codex enviar dados de performance, eles aparecerão aqui.</p>
      </Card>
    );
  }

  const stats = useMemo(() => {
    const slow: AtrasoRodagem[] = [];
    const fast: AtrasoRodagem[] = [];
    const equal: AtrasoRodagem[] = [];
    const casesSet = new Set<string>();
    const groupsSet = new Set<string>();
    let totalAdded = 0;
    let totalSaved = 0;
    let maxDelay: AtrasoRodagem | null = null;
    let maxGain: AtrasoRodagem | null = null;
    let hasName = false;
    for (const d of data) {
      if (d.status === "mais_lento") {
        slow.push(d);
        totalAdded += d.delay_segundos;
        if (!maxDelay || d.delay_segundos > maxDelay.delay_segundos) maxDelay = d;
      } else if (d.status === "mais_rapido") {
        fast.push(d);
        totalSaved += Math.abs(d.delay_segundos);
        if (!maxGain || d.delay_segundos < maxGain.delay_segundos) maxGain = d;
      } else if (d.status === "igual") {
        equal.push(d);
      }
      if (d.codigo_teste) casesSet.add(d.codigo_teste);
      const g = groupOf(d.codigo_teste);
      if (g) groupsSet.add(g);
      if (!hasName && d.nome_teste && d.nome_teste.trim()) hasName = true;
    }
    const topSlow = [...slow].sort((a, b) => b.delay_segundos - a.delay_segundos).slice(0, 10);
    const topFast = [...fast].sort((a, b) => a.delay_segundos - b.delay_segundos).slice(0, 10);
    const sortNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    return {
      slow, fast, equal, maxDelay, maxGain, totalAdded, totalSaved,
      topSlow, topFast,
      cases: Array.from(casesSet).sort(sortNum),
      groups: Array.from(groupsSet).sort(sortNum),
      hasName,
    };
  }, [data]);


  const { slow, fast, equal, maxDelay, maxGain, totalAdded, totalSaved, topSlow, topFast, cases, groups, hasName } = stats;

  const cards = useMemo(() => {
    const netDelta = totalAdded - totalSaved; // >0 mais lento no total; <0 mais rápido
    const netTone = netDelta > 0 ? "text-destructive" : netDelta < 0 ? "text-success" : "text-muted-foreground";
    const withSign = (sign: "+" | "-", txt: string) => (
      <><span className="font-sans mr-1">{sign}</span>{txt}</>
    );
    const netValue = netDelta === 0
      ? formatDuration(0)
      : withSign(netDelta > 0 ? "+" : "-", formatDuration(Math.abs(netDelta)));
    return ([
      { label: "Registros", value: data.length, tone: "" },
      { label: "Mais lentos", value: slow.length, tone: "text-destructive" },
      { label: "Mais rápidos", value: fast.length, tone: "text-success" },
      { label: "Maior atraso", value: maxDelay ? withSign("+", formatDuration(maxDelay.delay_segundos)) : "—", tone: "text-destructive" },
      { label: "Maior ganho", value: maxGain ? withSign("-", formatDuration(Math.abs(maxGain.delay_segundos))) : "—", tone: "text-success" },
      { label: "Diferença de tempo total", value: netValue, tone: netTone },


    ] as { label: string; value: any; tone: string }[]);
  }, [data.length, slow.length, fast.length, maxDelay, maxGain, totalAdded, totalSaved]);


  const distData = useMemo(() => ([
    { name: "Mais lentos", value: slow.length, color: "hsl(var(--destructive))" },
    { name: "Mais rápidos", value: fast.length, color: "hsl(var(--success))" },
    { name: "Sem variação", value: equal.length, color: "hsl(var(--muted-foreground))" },
  ].filter((d) => d.value > 0)), [slow.length, fast.length, equal.length]);

  const topSlowChart = useMemo(
    () => topSlow.map((d) => ({ name: d.codigo_teste || d.id, value: d.delay_segundos, label: formatDuration(d.delay_segundos) })),
    [topSlow],
  );
  const topFastChart = useMemo(
    () => topFast.map((d) => ({ name: d.codigo_teste || d.id, value: Math.abs(d.delay_segundos), label: formatDuration(Math.abs(d.delay_segundos)) })),
    [topFast],
  );


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
        {topFastChart.length > 0 && (
          <Card className="glass-card p-6 md:col-span-3">
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


      <Card className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome do caso..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: todos</SelectItem>
              <SelectItem value="mais_lento">Mais lento</SelectItem>
              <SelectItem value="mais_rapido">Mais rápido</SelectItem>
              
            </SelectContent>
          </Select>
          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="h-9 w-[180px] text-xs bg-background"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">Grupo: todos</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>[{g}]</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

      </Card>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <SortableTH label="Código" k="codigo" active={sortKey} dir={sortDir} onClick={toggleSort} />
              {hasName && <SortableTH label="Caso de teste" k="nome" active={sortKey} dir={sortDir} onClick={toggleSort} />}
              <SortableTH label="Status" k="status" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTH label="Tempo base" k="base" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Tempo atual" k="atual" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Diferença" k="diff" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Variação" k="var" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={hasName ? 7 : 6} className="text-center text-sm text-muted-foreground py-12">Nenhum registro corresponde aos filtros.</TableCell></TableRow>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

    </div>
  );
}

function SortableTH<K extends string>({
  label, k, active, dir, onClick, align = "left",
}: { label: string; k: K; active: K; dir: "asc" | "desc"; onClick: (k: K) => void; align?: "left" | "right" }) {
  const isActive = active === k;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${align === "right" ? "flex-row-reverse" : ""} ${isActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
      >
        <span>{label}</span>
        {isActive
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

