// =====================================================================
// ApiQaDataSource — cliente REST da API Agent TC.
//
// Endpoints usados:
//   GET  /health
//   GET  /modules
//   GET  /modules/latest-runs
//   GET  /modules/:slug/runs
//   GET  /runs  |  /runs/:id  |  /runs/:id/{failures,evidences,groups,group-links,
//                                  next-steps,performance,reexecutable-cases}
//   GET  /failures/:id/evidences
//   GET  /testcase-hierarchy?module=contabil
//   GET  /rerun-requests  |  POST /rerun-requests  |  POST /rerun-requests/:id/cancel
//   GET  /run-presets  |  POST /run-presets  |  PATCH /run-presets/:id  |  POST /run-presets/:id/delete
//   GET  /runs/:id/regravacao  |  GET /regravacoes?run_id=  |  POST /regravacoes  |  POST /regravacoes/:id/cancel
//
// Toda chamada envia o token de sessao; 401 leva ao login (notifySessionExpired).
// =====================================================================
import type {
  QaDataSource, CreateRerunPayload, ModuleLatestRun, RunPreset, SaveRunPresetPayload,
  RegravacaoCandidatos, RegravacaoPedido, CreateRegravacaoPayload,
} from "./types";
import type {
  Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, AtrasoRodagem,
} from "@/types/db";
import type {
  TestcaseHierarchyNode, RerunRequest, RodagemListItem, CasoReexecutavel,
} from "@/services/qa";
import { getDataConfig } from "./config";
import { getAuthHeader, notifySessionExpired } from "@/services/authApi";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl } = getDataConfig();
  if (!apiBaseUrl) throw new Error("VITE_AGENT_TC_API_URL não configurada");
  const url = `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) notifySessionExpired();
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`[api ${status}] ${path}`);
    this.name = "ApiError";
  }
}

// Leituras de detalhe devolvem vazio quando a API falha, para a tela nao quebrar;
// o motivo real fica no console. Sessao expirada (401) ja leva ao login em req().
// Modulos, resumo e hierarquia propagam o erro: ficam em cache (React Query) e
// um vazio guardado por engano esconderia dados por varios minutos.
const logFallback = (name: string, error: unknown) => {
  console.warn(`[ApiQaDataSource.${name}] falhou, retornando vazio:`, (error as Error)?.message || error);
};

// JSON cru da API: normalizado nas funcoes abaixo antes de chegar as telas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function firstValue<T>(...values: T[]): T | undefined {
  return values.find((v) => v !== null && v !== undefined);
}

function textValue(...values: unknown[]): string {
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
    cancel_requested: "cancel_requested",
    cancelamento_solicitado: "cancel_requested",
    canceling: "cancelando",
    cancelling: "cancelando",
    cancelando: "cancelando",
  };
  return map[raw] || raw || "solicitado";
}

function knownRequestType(value: unknown): string | null {
  const raw = textValue(value).toLowerCase().trim();
  return raw === "rodagem_completa" || raw === "reexecucao" ? raw : null;
}

function knownConfigurationMode(value: unknown): string | null {
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

// Extrai o ID do caso a partir do nome do arquivo compactado.
// Formatos aceitos: "[19.600.3.3] - 9001 082020 PC - ....RAR" e
// "19.700.1 - 25-08-2026 01_45_44.RAR".
function caseIdFromArchiveName(name: string): string | null {
  if (!name) return null;
  const bracket = name.match(/\[(\d+(?:\.\d+)*)\]/);
  if (bracket) return bracket[1];
  const prefix = name.match(/^\s*(\d+(?:\.\d+)*)\s*[-_ ]/);
  if (prefix) return prefix[1];
  return null;
}

// O analyzer às vezes devolve id_caso_teste = "ID invalido" quando não
// consegue parsear o nome do arquivo (ex.: ID entre colchetes). Nesses
// casos, recuperamos o ID a partir do nome do arquivo de origem.
function normalizeFailure<T extends object>(row: T): T {
  if (!row) return row;
  const rec = row as Record<string, unknown>;
  const raw = textValue(rec.id_caso_teste).trim();
  if (!raw || !/\d/.test(raw)) {
    const recovered =
      caseIdFromArchiveName(textValue(rec.arquivo_origem)) ||
      caseIdFromArchiveName(textValue(rec.arquivo_zip)) ||
      caseIdFromArchiveName(textValue(rec.source_archive_name));
    if (recovered) rec.id_caso_teste = recovered;
  }
  return row;
}

function normalizeRun<T extends object>(row: T | null): T | null {
  if (!row) return row;
  const rec = row as Record<string, unknown>;
  const executed = rec.total_executed ?? rec.total_analisados ?? rec.total_casos;
  if (executed != null) rec.total_analisados = Number(executed) || 0;
  return row;
}

export const ApiQaDataSource: QaDataSource = {
  fetchModules: () => req<Modulo[]>("/modules"),

  async fetchLatestRunsByModule() {
    try {
      const list = await req<ModuleLatestRun[]>("/modules/latest-runs");
      return (list || []).map((item) => ({ modulo: item.modulo, rodagem: normalizeRun(item.rodagem) as Rodagem | null }));
    } catch (e) {
      // API anterior ao endpoint de resumo: monta o mesmo resultado modulo a modulo.
      if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 501)) throw e;
      const modulos = await this.fetchModules();
      return Promise.all(
        modulos.map(async (modulo) => ({ modulo, rodagem: (await this.fetchRunsByModule(modulo.slug))[0] || null })),
      );
    }
  },

  async fetchApiHealth() {
    try {
      const res = await req<{ ok?: boolean }>("/health");
      return res?.ok === true;
    } catch {
      return false;
    }
  },

  fetchRunsByModule: (slug) =>
    req<Rodagem[]>(`/modules/${encodeURIComponent(slug)}/runs`)
      .then((list) => (list || []).map((r) => normalizeRun(r) as Rodagem))
      .catch((e) => { logFallback("fetchRunsByModule", e); return []; }),

  fetchRunById: (id) =>
    req<Rodagem | null>(`/runs/${encodeURIComponent(id)}`)
      .then((r) => normalizeRun(r))
      .catch((e) => { logFallback("fetchRunById", e); return null; }),

  fetchAllRuns: () => req<RodagemListItem[]>(`/runs`).catch((e) => { logFallback("fetchAllRuns", e); return []; }),

  fetchFailuresByRun: (runId) =>
    req<Falha[]>(`/runs/${encodeURIComponent(runId)}/failures`)
      .then((list) => (list || []).map((f) => normalizeFailure(f)))
      .catch((e) => { logFallback("fetchFailuresByRun", e); return []; }),

  fetchEvidenceByRun: (runId) =>
    req<Evidencia[]>(`/runs/${encodeURIComponent(runId)}/evidences`).catch((e) => { logFallback("fetchEvidenceByRun", e); return []; }),

  fetchEvidenceByFailure: (failureId) =>
    req<Evidencia[]>(`/failures/${encodeURIComponent(failureId)}/evidences`).catch((e) => { logFallback("fetchEvidenceByFailure", e); return []; }),

  fetchGroupsByRun: (runId) =>
    req<Agrupamento[]>(`/runs/${encodeURIComponent(runId)}/groups`).catch((e) => { logFallback("fetchGroupsByRun", e); return []; }),

  fetchGroupLinksByRun: (runId) =>
    req<Record<string, string[]>>(`/runs/${encodeURIComponent(runId)}/group-links`).catch((e) => { logFallback("fetchGroupLinksByRun", e); return {}; }),

  fetchNextStepsByRun: (runId) =>
    req<ProximoPasso[]>(`/runs/${encodeURIComponent(runId)}/next-steps`).catch((e) => { logFallback("fetchNextStepsByRun", e); return []; }),

  fetchPerformanceByRun: (runId) =>
    req<AtrasoRodagem[]>(`/runs/${encodeURIComponent(runId)}/performance`).catch((e) => { logFallback("fetchPerformanceByRun", e); return []; }),

  fetchTestcaseHierarchy: (slug) =>
    req<TestcaseHierarchyNode[]>(`/testcase-hierarchy?module=${encodeURIComponent(slug)}`),

  fetchCasosReexecutaveis: (runId) =>
    req<CasoReexecutavel[]>(`/runs/${encodeURIComponent(runId)}/reexecutable-cases`)
      .then((list) => (list || []).map((c) => normalizeFailure(c) as CasoReexecutavel))
      .catch((e) => { logFallback("fetchCasosReexecutaveis", e); return []; }),

  fetchRerunRequests: (limit = 50) =>
    req<ApiRow[]>(`/rerun-requests?limit=${limit}`)
      .then((rows) => rows.map(normalizeRerunRequest))
      .catch((e) => { logFallback("fetchRerunRequests", e); return []; }),

  createRerunRequest: (payload: CreateRerunPayload) =>
    req<ApiRow>(`/rerun-requests`, { method: "POST", body: JSON.stringify(payload) }).then(normalizeRerunRequest),

  cancelRerunRequest: (id: string, reason?: string) =>
    req<ApiRow>(`/rerun-requests/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "Cancelamento solicitado pelo dashboard." }),
    }).then((res) => normalizeRerunRequest((res && (res as ApiRow).rerun_request) ?? res)),

  fetchRunPresets: () => req<RunPreset[]>(`/run-presets`),

  createRunPreset: (payload: SaveRunPresetPayload) =>
    req<RunPreset>(`/run-presets`, { method: "POST", body: JSON.stringify(payload) }),

  updateRunPreset: (id: string, payload: SaveRunPresetPayload) =>
    req<RunPreset>(`/run-presets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteRunPreset: (id: string) =>
    req<unknown>(`/run-presets/${encodeURIComponent(id)}/delete`, { method: "POST", body: "{}" }).then(() => undefined),

  fetchRegravacaoCandidatos: (runId: string) =>
    req<RegravacaoCandidatos>(`/runs/${encodeURIComponent(runId)}/regravacao`),

  fetchRegravacoes: (runId?: string) =>
    req<RegravacaoPedido[]>(`/regravacoes${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`),

  createRegravacao: (payload: CreateRegravacaoPayload) =>
    req<RegravacaoPedido>(`/regravacoes`, { method: "POST", body: JSON.stringify(payload) }),

  cancelRegravacao: (id: string) =>
    req<unknown>(`/regravacoes/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" }).then(() => undefined),
};
