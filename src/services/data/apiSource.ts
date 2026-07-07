// =====================================================================
// ApiQaDataSource — implementação REST (agente TC futuro).
//
// Endpoints previstos:
//   GET  /modules
//   GET  /modules/:slug/runs
//   GET  /runs/:id
//   GET  /runs/:id/failures
//   GET  /runs/:id/evidences
//   GET  /runs/:id/groups
//   GET  /runs/:id/next-steps
//   GET  /runs/:id/performance
//   GET  /testcase-hierarchy?module=contabil
//   GET  /rerun-requests
//   POST /rerun-requests
//
// NOTA: esta implementação é um esqueleto — os payloads da API real ainda
// não estão definidos. Os métodos fazem fetch e retornam o JSON como está;
// quando a API existir, adicionar normalização equivalente à de qa.ts.
// Nunca use service_role key aqui — apenas o token público do agente.
// =====================================================================
import type { QaDataSource, CreateRerunPayload, RealtimeTable } from "./types";
import type {
  Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, AtrasoRodagem,
} from "@/types/db";
import type {
  TestcaseHierarchyNode, RerunRequest, RodagemListItem, CasoReexecutavel,
} from "@/services/qa";
import { getDataConfig } from "./config";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl } = getDataConfig();
  if (!apiBaseUrl) throw new Error("VITE_AGENT_TC_API_URL não configurada");
  const url = `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`[api ${res.status}] ${path}`);
  return (await res.json()) as T;
}

const notImplemented = (name: string) => {
  console.warn(`[ApiQaDataSource.${name}] endpoint ainda não implementado — retornando vazio`);
};

export const ApiQaDataSource: QaDataSource = {
  fetchModules: () => req<Modulo[]>("/modules").catch(() => { notImplemented("fetchModules"); return []; }),

  fetchRunsByModule: (slug) =>
    req<Rodagem[]>(`/modules/${encodeURIComponent(slug)}/runs`).catch(() => { notImplemented("fetchRunsByModule"); return []; }),

  async fetchLatestRunByModule(slug) {
    const list = await this.fetchRunsByModule(slug);
    return list[0] || null;
  },

  fetchRunById: (id) =>
    req<Rodagem | null>(`/runs/${encodeURIComponent(id)}`).catch(() => { notImplemented("fetchRunById"); return null; }),

  fetchAllRuns: () => req<RodagemListItem[]>(`/runs`).catch(() => { notImplemented("fetchAllRuns"); return []; }),

  fetchFailuresByRun: (runId) =>
    req<Falha[]>(`/runs/${encodeURIComponent(runId)}/failures`).catch(() => { notImplemented("fetchFailuresByRun"); return []; }),

  fetchEvidenceByRun: (runId) =>
    req<Evidencia[]>(`/runs/${encodeURIComponent(runId)}/evidences`).catch(() => { notImplemented("fetchEvidenceByRun"); return []; }),

  fetchEvidenceByFailure: (failureId) =>
    req<Evidencia[]>(`/failures/${encodeURIComponent(failureId)}/evidences`).catch(() => { notImplemented("fetchEvidenceByFailure"); return []; }),

  fetchGroupsByRun: (runId) =>
    req<Agrupamento[]>(`/runs/${encodeURIComponent(runId)}/groups`).catch(() => { notImplemented("fetchGroupsByRun"); return []; }),

  fetchGroupLinksByRun: (runId) =>
    req<Record<string, string[]>>(`/runs/${encodeURIComponent(runId)}/group-links`).catch(() => { notImplemented("fetchGroupLinksByRun"); return {}; }),

  fetchNextStepsByRun: (runId) =>
    req<ProximoPasso[]>(`/runs/${encodeURIComponent(runId)}/next-steps`).catch(() => { notImplemented("fetchNextStepsByRun"); return []; }),

  fetchPerformanceByRun: (runId) =>
    req<AtrasoRodagem[]>(`/runs/${encodeURIComponent(runId)}/performance`).catch(() => { notImplemented("fetchPerformanceByRun"); return []; }),

  async listStorageFilesByRun(_runId, _slug, _pasta) {
    // No provider REST local, as evidencias ja chegam por /runs/:id/evidences.
    // A listagem direta de Storage fica vazia para evitar duplicidade no merge.
    return [];
  },

  fetchTestcaseHierarchy: (slug) =>
    req<TestcaseHierarchyNode[]>(`/testcase-hierarchy?module=${encodeURIComponent(slug)}`).catch(() => { notImplemented("fetchTestcaseHierarchy"); return []; }),

  fetchCasosReexecutaveis: (runId) =>
    req<CasoReexecutavel[]>(`/runs/${encodeURIComponent(runId)}/reexecutable-cases`).catch(() => { notImplemented("fetchCasosReexecutaveis"); return []; }),

  fetchRerunRequests: (limit = 50) =>
    req<RerunRequest[]>(`/rerun-requests?limit=${limit}`).catch(() => { notImplemented("fetchRerunRequests"); return []; }),

  fetchRerunRequestsByModule: (slug, moduleName, limit = 20) => {
    const params = new URLSearchParams({ slug, limit: String(limit) });
    if (moduleName) params.set("module_name", moduleName);
    return req<RerunRequest[]>(`/rerun-requests?${params.toString()}`).catch(() => { notImplemented("fetchRerunRequestsByModule"); return []; });
  },

  createRerunRequest: (payload: CreateRerunPayload) =>
    req<RerunRequest>(`/rerun-requests`, { method: "POST", body: JSON.stringify(payload) }),

  async fetchModuleDashboardData(slug) {
    const [modulos, runs] = await Promise.all([this.fetchModules(), this.fetchRunsByModule(slug)]);
    const modulo = modulos.find((m) => m.slug === slug) || null;
    const rodagem = runs[0] || null;
    if (!rodagem) return { modulo, rodagem: null, falhas: [], evidencias: [], grupos: [], passos: [], historico: runs };
    const [falhas, evidencias, grupos, passos] = await Promise.all([
      this.fetchFailuresByRun(rodagem.id),
      this.fetchEvidenceByRun(rodagem.id),
      this.fetchGroupsByRun(rodagem.id),
      this.fetchNextStepsByRun(rodagem.id),
    ]);
    return { modulo, rodagem, falhas, evidencias, grupos, passos, historico: runs };
  },

  // REST não tem realtime — usamos polling leve (30s) como fallback.
  subscribeToTable(_table: RealtimeTable, cb) {
    const id = window.setInterval(() => cb({ eventType: "POLL" }), 30_000);
    return () => window.clearInterval(id);
  },
};
