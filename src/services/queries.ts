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
  fetchLatestRunsByModule,
  fetchModules,
  fetchRerunRequests,
  fetchTestcaseHierarchy,
  type RerunRequest,
} from "@/services/data";

export const queryKeys = {
  modules: ["modules"] as const,
  latestRuns: ["latest-runs"] as const,
  health: ["api-health"] as const,
  allRuns: ["all-runs"] as const,
  hierarchy: (slug: string) => ["testcase-hierarchy", slug] as const,
  rerunRequests: ["rerun-requests"] as const,
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
