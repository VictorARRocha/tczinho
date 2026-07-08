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

type ApiRow = Record<string, any>;

function asObject(value: unknown): ApiRow {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ApiRow : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as ApiRow : {};
}

function firstValue(...values: any[]) {
  return values.find((v) => v !== null && v !== undefined);
}

function textValue(...values: any[]): string {
  const value = firstValue(...values);
  return value === null || value === undefined ? "" : String(value);
}

function normalizeJenkinsConfig(row: ApiRow) {
  const config = asObject(row.config_json);
  return {
    vm_name: textValue(config.vm_name, row.vm_name),
    versao: textValue(config.versao, row.versao, row.version),
    casos_teste: textValue(config.casos_teste, row.casos_teste, row.test_cases),
    paralelo: textValue(config.paralelo, row.paralelo, row.parallel),
    ct_desmarcar: textValue(config.ct_desmarcar, row.ct_desmarcar, "[0.3]"),
    data_hora: textValue(config.data_hora, row.data_hora),
    branch: textValue(config.branch, row.branch),
  };
}

function normalizeExecutionStatus(row: ApiRow): string {
  const raw = textValue(row.execution_status, row.status, "solicitado").toLowerCase().trim();
  const map: Record<string, string> = {
    requested: "solicitado",
    queued: "na_fila",
    running: "rodando",
    completed: "finalizado_sucesso",
    success: "finalizado_sucesso",
    failed: "finalizado_falha",
    failure: "finalizado_falha",
    unstable: "finalizado_falha",
    canceled: "cancelado",
    cancelled: "cancelado",
    error: "erro",
  };
  return map[raw] || raw || "solicitado";
}

function knownRequestType(value: any): string | null {
  const raw = textValue(value).toLowerCase().trim();
  return raw === "rodagem_completa" || raw === "reexecucao" ? raw : null;
}

function knownConfigurationMode(value: any): string | null {
  const raw = textValue(value).toLowerCase().trim();
  return raw === "simplificada" || raw === "configurada" || raw === "casos_quebrados" ? raw : null;
}

function deriveModuleFromCases(cases: string): { codigo: string | null; nome: string | null } {
  const prefixes = new Set<string>();
  for (const match of cases.matchAll(/\[(\d+)/g)) prefixes.add(match[1]);
  if (prefixes.size === 0) {
    const loose = cases.match(/^\s*(\d+)/);
    if (loose) prefixes.add(loose[1]);
  }
  if (prefixes.size === 0) return { codigo: null, nome: null };

  const names = new Set<string>();
  prefixes.forEach((prefix) => {
    if (prefix === "1") names.add("Folha");
    else if (prefix === "2") names.add("Fiscal");
    else if (["3", "4", "7"].includes(prefix)) names.add("Contábil");
    else if (prefix === "5") names.add("Financeiro");
    else if (prefix === "6") names.add("Geral");
    else if (prefix === "9") names.add("Gestão");
    else if (prefix === "16") names.add("Suprema");
    else if (prefix === "19") names.add("Practice");
  });

  return {
    codigo: cases || Array.from(prefixes).map((p) => `[${p}]`).join(", "),
    nome: names.size ? Array.from(names).join(" / ") : null,
  };
}

function normalizeRerunRequest(row: ApiRow): RerunRequest {
  const config = normalizeJenkinsConfig(row);
  const module = deriveModuleFromCases(config.casos_teste);
  const buildUrl = firstValue(row.build_url, row.jenkins_build_url, row.jenkins_url) ?? null;
  const buildNumber = firstValue(row.build_number, row.jenkins_build_number) ?? null;
  const errorMessage = firstValue(row.erro, row.error_message) ?? null;
  const executionStatus = normalizeExecutionStatus(row);

  return {
    id: textValue(row.id),
    fk_rodagem: firstValue(row.fk_rodagem, row.source_run_id) ?? null,
    vm_name: config.vm_name,
    versao: config.versao,
    casos_teste: config.casos_teste,
    paralelo: config.paralelo || null,
    ct_desmarcar: config.ct_desmarcar || null,
    data_hora: config.data_hora || null,
    branch: config.branch || null,
    config_json: config,
    status: executionStatus,
    jenkins_url: firstValue(row.jenkins_url, buildUrl) ?? null,
    jenkins_queue_url: firstValue(row.jenkins_queue_url, row.queue_url) ?? null,
    jenkins_build_number: buildNumber === null ? null : String(buildNumber),
    erro: errorMessage,
    retorno_jenkins: row.retorno_jenkins ?? null,
    created_at: textValue(row.created_at, row.updated_at, new Date().toISOString()),
    updated_at: textValue(row.updated_at, row.created_at, new Date().toISOString()),
    tipo_solicitacao: knownRequestType(firstValue(row.tipo_solicitacao, row.request_type)),
    modo_configuracao: knownConfigurationMode(firstValue(row.modo_configuracao, row.configuration_mode)),
    modulo_nome: firstValue(row.modulo_nome, row.module_name, module.nome) ?? null,
    modulo_codigo: firstValue(row.modulo_codigo, row.module_code, module.codigo) ?? null,
    solicitado_por: firstValue(row.solicitado_por, row.requested_by) ?? null,
    execution_status: executionStatus,
    execution_result: row.execution_result ?? null,
    progress_percent: row.progress_percent ?? null,
    build_number: buildNumber,
    build_url: buildUrl,
    queue_id: row.queue_id ?? null,
    queue_url: firstValue(row.queue_url, row.jenkins_queue_url) ?? null,
    started_at: row.started_at ?? null,
    finished_at: row.finished_at ?? null,
    duration_ms: row.duration_ms ?? null,
    estimated_duration_ms: row.estimated_duration_ms ?? null,
    last_checked_at: row.last_checked_at ?? null,
    monitor_error: firstValue(row.monitor_error, row.error_message) ?? null,
  };
}

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
    req<ApiRow[]>(`/rerun-requests?limit=${limit}`)
      .then((rows) => rows.map(normalizeRerunRequest))
      .catch(() => { notImplemented("fetchRerunRequests"); return []; }),

  fetchRerunRequestsByModule: (slug, moduleName, limit = 20) => {
    const params = new URLSearchParams({ slug, limit: String(limit) });
    if (moduleName) params.set("module_name", moduleName);
    return req<ApiRow[]>(`/rerun-requests?${params.toString()}`)
      .then((rows) => rows.map(normalizeRerunRequest))
      .catch(() => { notImplemented("fetchRerunRequestsByModule"); return []; });
  },

  createRerunRequest: (payload: CreateRerunPayload) =>
    req<ApiRow>(`/rerun-requests`, { method: "POST", body: JSON.stringify(payload) }).then(normalizeRerunRequest),

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
