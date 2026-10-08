import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { findRodagemBySlug, rodagemSlugFor } from "@/lib/rodagemSlug";
import { fetchRunsByModule, fetchRunById, fetchFailuresByRun, fetchEvidenceByRun, fetchGroupsByRun, fetchNextStepsByRun, fetchPerformanceByRun, fetchGroupLinksByRun, type TestcaseHierarchyNode } from "@/services/data";
import { getHierarchyCached, getModulesCached, useLatestRuns } from "@/services/queries";
import type { Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, Modulo, AtrasoRodagem } from "@/types/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Lock, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { type ComparisonPair } from "@/lib/occurrence";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useModulos } from "@/hooks/use-permissao";
import { nomeModulo, SEM_MODULO } from "@/lib/permissoes";
import { AgrupamentosTab } from "./module/AgrupamentosTab";
import { FalhasTab } from "./module/FalhasTab";
import { HistoricoTab } from "./module/HistoricoTab";
import { CompararTab } from "./module/CompararTab";
import { ModuleHeader } from "./module/ModuleHeader";
import { PerformanceTab } from "./module/PerformanceTab";
import { ResumoTab } from "./module/ResumoTab";

const FailureDetailSheet = lazy(() =>
  import("@/components/FailureDetailSheet").then((m) => ({ default: m.FailureDetailSheet }))
);
const FileComparatorDialog = lazy(() =>
  import("@/components/FileComparator").then((m) => ({ default: m.FileComparatorDialog }))
);

export default function ModulePage() {
  const { slug = "", rodagemSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runParam = searchParams.get("run") || undefined;
  const tabParam = searchParams.get("tab");
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
  const [runLoading, setRunLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFalha, setSelectedFalha] = useState<Falha | null>(null);
  const [comparePair, setComparePair] = useState<{ pair: ComparisonPair; falha: Falha } | null>(null);

  // Controle de race condition: cada loadAll incrementa o id; respostas atrasadas são ignoradas
  const requestRef = useRef(0);
  const currentSlugRef = useRef(slug);

  const moduleName = modulo?.nome || slug;
  // Modulo de que a pessoa nao tem acesso (link compartilhado): a API nao entrega nada, entao nem busca.
  const semAcesso = !useModulos().pode(slug);

  // Rodagem nova: a mesma consulta leve da visao geral (cache compartilhado) diz
  // qual e a ultima rodagem do modulo; se ela nao esta no historico carregado, avisa.
  const { data: latestRuns } = useLatestRuns();
  const latestOfModule = latestRuns?.find((item) => item.modulo.slug === slug)?.rodagem ?? null;
  const newerRunAvailable =
    !loading && !!latestOfModule && historico.length > 0 && !historico.some((r) => r.id === latestOfModule.id);

  const clearRunData = () => {
    setFalhas([]); setEvidencias([]); setGrupos([]); setPassos([]);
    setPerformance([]); setGroupLinks({}); setHierarchy([]);
  };

  const loadRunDetails = async (r: Rodagem, targetSlug: string, reqId: number) => {
    const [f, e, g, p, perf, links, hier] = await Promise.all([
      fetchFailuresByRun(r.id), fetchEvidenceByRun(r.id), fetchGroupsByRun(r.id), fetchNextStepsByRun(r.id),
      fetchPerformanceByRun(r.id), fetchGroupLinksByRun(r.id),
      // A hierarquia e do modulo, nao da rodagem: fica em cache entre trocas de rodagem.
      getHierarchyCached(targetSlug).catch((err) => {
        console.warn("[ModulePage] hierarquia indisponivel:", err?.message || err);
        return [] as TestcaseHierarchyNode[];
      }),
    ]);
    if (reqId !== requestRef.current) return;
    setFalhas(f); setEvidencias(e); setGrupos(g); setPassos(p);
    setPerformance(perf); setGroupLinks(links); setHierarchy(hier);
  };

  const loadAll = async (runId?: string, targetSlug: string = slug, runSlug?: string) => {
    const reqId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    try {
      // Fetches independentes rodam em paralelo
      const [mods, runs] = await Promise.all([getModulesCached(), fetchRunsByModule(targetSlug)]);
      if (reqId !== requestRef.current) return;
      setModulo(mods.find((x) => x.slug === targetSlug) || null);
      setHistorico(runs);

      let r: Rodagem | null = null;
      if (runId) {
        r = await fetchRunById(runId);
      } else if (runSlug) {
        r = findRodagemBySlug(runs, runSlug);
        if (!r) {
          if (reqId !== requestRef.current) return;
          setRodagem(null);
          clearRunData();
          setNotFound(true);
          return;
        }
      } else {
        r = runs[0] || null;
      }
      if (reqId !== requestRef.current) return;
      setRodagem(r);
      if (r) {
        if (!runSlug) {
          // reflete a rodagem aberta na URL (link compartilhável) sem empilhar histórico;
          // mantem os parametros (?tab=comparar&de=...&para=...) de um link compartilhado.
          initialRouteRef.current = true;
          navigate(`/modulo/${targetSlug}/${rodagemSlugFor(runs, r)}${window.location.search}`, { replace: true });
        }
        await loadRunDetails(r, targetSlug, reqId);
      } else {
        clearRunData();
      }

    } catch (e) {
      if (reqId !== requestRef.current) return;
      setLoadError((e as Error)?.message || "Erro ao carregar módulo");
      toast.error("Erro ao carregar módulo", { description: (e as Error)?.message });
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  };

  // Troca de rodagem dentro do mesmo módulo (loading leve, sem recarregar a lista)
  const switchRun = async (runSlug: string) => {
    const reqId = ++requestRef.current;
    setNotFound(false);
    setLoadError(null);
    setSelectedFalha(null);
    setComparePair(null);
    const target = findRodagemBySlug(historico, runSlug);
    if (!target) { setRodagem(null); clearRunData(); setNotFound(true); return; }
    setRunLoading(true);
    setRodagem(target);
    try {
      await loadRunDetails(target, slug, reqId);
    } catch (e) {
      if (reqId === requestRef.current) setLoadError((e as Error)?.message || "Erro ao carregar rodagem");
    } finally {
      if (reqId === requestRef.current) setRunLoading(false);
    }
  };

  const goToRun = (run: Rodagem | null | undefined) => {
    if (!run) return;
    navigate(`/modulo/${slug}/${rodagemSlugFor(historico, run)}`);
  };
  const goToRunId = (id: string) => goToRun(historico.find((r) => r.id === id) || null);

  // Carrega módulo (e rodagem inicial) quando o módulo muda
  useEffect(() => {
    currentSlugRef.current = slug;
    requestRef.current++; // cancela respostas em voo do módulo anterior
    setModulo(null);
    setRodagem(null);
    setHistorico([]);
    clearRunData();
    setSelectedFalha(null);
    setComparePair(null);
    setActiveTab("resumo");
    setLoading(true);
    setLoadError(null);
    setNotFound(false);

    if (semAcesso) { setLoading(false); return; }
    loadAll(rodagemSlug ? undefined : runParam, slug, rodagemSlug);
    if (tabParam === "falhas" || tabParam === "comparar") setActiveTab(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, semAcesso]);

  // Rodagem selecionada derivada da rota (navegação/voltar do browser)
  const initialRouteRef = useRef(true);
  const runEffectSlugRef = useRef(slug);
  useEffect(() => {
    if (initialRouteRef.current) { initialRouteRef.current = false; return; }
    // Troca de modulo (ex.: Voltar do navegador de uma rodagem do Contabil para uma
    // da Folha): o loadAll do novo modulo ja resolve a rodagem da URL. Trocar aqui,
    // com o historico do modulo anterior, cancelava esse carregamento e a tela
    // ficava presa em "Carregando modulo".
    if (runEffectSlugRef.current !== slug) { runEffectSlugRef.current = slug; return; }
    if (loading || historico.length === 0) return;
    if (rodagemSlug) {
      const target = findRodagemBySlug(historico, rodagemSlug);
      if (target && target.id === rodagem?.id) return;
      switchRun(rodagemSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodagemSlug]);


  if (semAcesso) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
        <Card className="glass-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Módulo {nomeModulo(slug)}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{SEM_MODULO}</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/">Voltar à visão geral</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in space-y-6">
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-3 w-3" /> Visão geral
      </Link>

      <ModuleHeader modulo={modulo} rodagem={rodagem} runs={historico} onPickRun={goToRunId} />

      {newerRunAvailable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <span>
            Nova rodagem disponível neste módulo
            {latestOfModule?.data_inicio_rodagem ? ` (${formatDateTime(latestOfModule.data_inicio_rodagem)})` : ""}.
          </span>
          <Button size="sm" onClick={() => loadAll(undefined, slug)}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Abrir rodagem mais recente
          </Button>
        </div>
      )}

      {notFound ? (
        <Card className="glass-card p-12 text-center mt-8">
          <h3 className="text-lg font-semibold">Rodagem não encontrada.</h3>
          <p className="mt-2 text-sm text-muted-foreground">O link pode estar desatualizado ou a rodagem foi removida.</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to={`/modulo/${slug}`}>Voltar ao módulo</Link>
          </Button>
        </Card>
      ) : !rodagem ? (
        <Card className="glass-card p-12 text-center mt-8">
          <h3 className="text-lg font-semibold">Nenhuma rodagem encontrada</h3>
          <p className="mt-2 text-sm text-muted-foreground">Os resultados deste módulo aparecem aqui assim que a primeira rodagem de testes terminar.</p>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6 sm:mt-8">
          <TabsList className="bg-card border border-border max-w-full overflow-x-auto sm:overflow-y-hidden justify-start max-sm:h-auto max-sm:flex-wrap max-sm:overflow-x-visible">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="falhas">Falhas <span className="ml-1.5 text-xs opacity-60">({falhas.length})</span></TabsTrigger>
            <TabsTrigger value="agrupamentos">Agrupamentos</TabsTrigger>
            <TabsTrigger value="performance">Performance{performance.length > 0 && <span className="ml-1.5 text-xs opacity-60">({performance.length})</span>}</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="comparar">Comparar</TabsTrigger>
          </TabsList>

          {runLoading && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> Carregando rodagem...
            </div>
          )}

          <TabsContent value="resumo" className="mt-6"><ResumoTab rodagem={rodagem} falhas={falhas} evidencias={evidencias} performance={performance} onOpenPerformance={() => setActiveTab("performance")} onOpenFalhas={(sub) => { setFalhasSubTab(sub); setActiveTab("falhas"); }} /></TabsContent>
          <TabsContent value="falhas" className="mt-6"><FalhasTab moduloNome={modulo?.nome || ""} falhas={falhas} evidencias={evidencias} hierarchy={hierarchy} subTab={falhasSubTab} setSubTab={setFalhasSubTab} onSelect={setSelectedFalha} onCompare={(pair, falha) => setComparePair({ pair, falha })} /></TabsContent>
          <TabsContent value="agrupamentos" className="mt-6"><AgrupamentosTab runId={rodagem.id} grupos={grupos} falhas={falhas} links={groupLinks} onSelect={setSelectedFalha} onReload={() => loadAll(rodagem.id)} /></TabsContent>
          <TabsContent value="performance" className="mt-6"><PerformanceTab data={performance} /></TabsContent>
          <TabsContent value="historico" className="mt-6"><HistoricoTab runs={historico} currentId={rodagem.id} onPick={goToRunId} /></TabsContent>
          <TabsContent value="comparar" className="mt-6"><CompararTab runs={historico} currentRunId={rodagem.id} onOpenFailure={setSelectedFalha} /></TabsContent>

        </Tabs>
      )}

      {selectedFalha && (
        <Suspense fallback={null}>
          <FailureDetailSheet
            falha={selectedFalha}
            open={!!selectedFalha}
            onClose={() => setSelectedFalha(null)}
            linkRegravar
            evidencias={evidencias.filter((e) => {
              if (e.falha_id && e.falha_id === selectedFalha.id) return true;
              // falhas sintéticas: id "storage:{folder}" → evidências cujo path está dentro do folder
              if (selectedFalha.id?.startsWith("storage:")) {
                const folder = selectedFalha.id.replace(/^storage:/, "");
                return (e.storage_path || "").startsWith(folder);
              }
              return false;
            })}
          />
        </Suspense>
      )}
      {comparePair && (
        <Suspense fallback={null}>
          <FileComparatorDialog open={!!comparePair} pair={comparePair.pair} falha={comparePair.falha} onClose={() => setComparePair(null)} />
        </Suspense>
      )}
    </div>
  );
}
