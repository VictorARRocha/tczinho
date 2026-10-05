// =====================================================================
// Consultas com cache (React Query) compartilhadas pelas telas.
//
// Mesma chave = mesma busca: a barra lateral e a visao geral nao baixam os
// modulos duas vezes, e a hierarquia de casos fica em cache por modulo.
// Os intervalos de atualizacao pausam com a aba do navegador em segundo plano.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { hasActiveRerun } from "@/lib/rerunStatus";
import {
  fetchAllRuns,
  fetchApiHealth,
  fetchFailuresByRun,
  fetchLatestRunsByModule,
  fetchModules,
  fetchRerunRequests,
  fetchRunPresets,
  fetchRegravacaoCandidatos,
  fetchRegravacoes,
  fetchEvidenceByRun,
  type RegravacaoPedido,
  fetchTestcaseHierarchy,
  type RerunRequest,
} from "@/services/data";

export const queryKeys = {
  modules: ["modules"] as const,
  latestRuns: ["latest-runs"] as const,
  health: ["api-health"] as const,
  allRuns: ["all-runs"] as const,
  hierarchy: (slug: string) => ["testcase-hierarchy", slug] as const,
  runFailures: (runId: string) => ["run-failures", runId] as const,
  rerunRequests: ["rerun-requests"] as const,
  runPresets: ["run-presets"] as const,
  regravacaoCandidatos: (runId: string) => ["regravacao-candidatos", runId] as const,
  regravacoes: (runId: string) => ["regravacoes", runId] as const,
  runEvidences: (runId: string) => ["run-evidences", runId] as const,
};

const MODULES_STALE_MS = 5 * 60_000;
const HIERARCHY_STALE_MS = 10 * 60_000;
/** Checagem de rodagem nova: uma chamada leve (/modules/latest-runs) por minuto. */
export const LATEST_RUNS_POLL_MS = 60_000;
const RERUN_ACTIVE_POLL_MS = 10_000;
const RERUN_IDLE_POLL_MS = 60_000;

export function useModules() {
  return useQuery({ queryKey: queryKeys.modules, queryFn: fetchModules, staleTime: MODULES_STALE_MS });
}

export function useLatestRuns() {
  return useQuery({
    queryKey: queryKeys.latestRuns,
    queryFn: fetchLatestRunsByModule,
    refetchInterval: LATEST_RUNS_POLL_MS,
  });
}

export function useApiHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchApiHealth, refetchInterval: 60_000, retry: 0 });
}

/** Falhas de uma rodagem (a lista de uma rodagem ja importada nao muda; cache de 5 min). */
export function useRunFailures(runId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.runFailures(runId || ""),
    queryFn: () => fetchFailuresByRun(runId as string),
    enabled: !!runId,
    staleTime: 5 * 60_000,
  });
}

export function useAllRuns() {
  return useQuery({ queryKey: queryKeys.allRuns, queryFn: fetchAllRuns, staleTime: 60_000 });
}

/** Historico do Jenkins: 10s enquanto houver pedido ativo, senao 1 minuto. */
export function rerunRefetchInterval(requests: RerunRequest[] | undefined): number {
  return hasActiveRerun(requests) ? RERUN_ACTIVE_POLL_MS : RERUN_IDLE_POLL_MS;
}

export function useRerunRequests(limit = 50) {
  return useQuery({
    queryKey: [...queryKeys.rerunRequests, limit],
    queryFn: () => fetchRerunRequests(limit),
    refetchInterval: (query) => rerunRefetchInterval(query.state.data),
  });
}

export function invalidateRerunRequests() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.rerunRequests });
}

/** Pre-definicoes de rodagem Jenkins (compartilhadas): mudam pouco, recarregam ao salvar. */
export function useRunPresets() {
  return useQuery({ queryKey: queryKeys.runPresets, queryFn: fetchRunPresets, staleTime: 30_000 });
}

export function invalidateRunPresets() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.runPresets });
}

const ACTIVE_REGRAVACAO = new Set(["solicitado", "processando"]);

/** Pedidos de regravacao da rodagem: 10s enquanto houver pedido ativo, senao 1 minuto. */
export function regravacaoRefetchInterval(pedidos: RegravacaoPedido[] | undefined): number {
  return (pedidos || []).some((p) => ACTIVE_REGRAVACAO.has(p.status)) ? 10_000 : 60_000;
}

export function useRegravacaoCandidatos(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.regravacaoCandidatos(runId || ""),
    queryFn: () => fetchRegravacaoCandidatos(runId as string),
    enabled: !!runId,
    staleTime: 30_000,
  });
}

export function useRegravacoes(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.regravacoes(runId || ""),
    queryFn: () => fetchRegravacoes(runId as string),
    enabled: !!runId,
    refetchInterval: (query) => regravacaoRefetchInterval(query.state.data),
  });
}

export function useRunEvidences(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.runEvidences(runId || ""),
    queryFn: () => fetchEvidenceByRun(runId as string),
    enabled: !!runId,
    staleTime: 5 * 60_000,
  });
}

/** Pedido mudou de status (ex.: o Bridge terminou): a situacao dos arquivos muda junto. */
export function invalidateRegravacaoCandidatos(runId: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.regravacaoCandidatos(runId) });
}

/** Depois de criar/cancelar: recarrega pedidos e a situacao dos arquivos da rodagem. */
export function invalidateRegravacao(runId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.regravacoes(runId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.regravacaoCandidatos(runId) }),
  ]);
}

/** Para carregamentos imperativos (ModulePage): usa o cache se ainda estiver valido. */
export function getModulesCached() {
  return queryClient.fetchQuery({ queryKey: queryKeys.modules, queryFn: fetchModules, staleTime: MODULES_STALE_MS });
}

export function getHierarchyCached(slug: string) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.hierarchy(slug),
    queryFn: () => fetchTestcaseHierarchy(slug),
    staleTime: HIERARCHY_STALE_MS,
  });
}
