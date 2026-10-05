// =====================================================================
// Ponto de entrada da camada de dados.
//
//   import { fetchModules } from "@/services/data";
//
// Telas devem preferir os hooks com cache de @/services/queries.
// =====================================================================
import { ApiQaDataSource } from "./apiSource";
import type { QaDataSource } from "./types";

export const qaData: QaDataSource = ApiQaDataSource;

export type {
  QaDataSource, CreateRerunPayload, ModuleLatestRun, RunPreset, RunPresetMode, SaveRunPresetPayload,
} from "./types";
export { ApiQaDataSource } from "./apiSource";
export { getDataConfig } from "./config";
export type {
  TestcaseHierarchyNode,
  RerunRequest,
  RodagemListItem,
  CasoReexecutavel,
} from "@/services/qa";
export {
  extractVmName,
  formatNowBr,
  formatNowMinusOneMinuteBr,
} from "@/services/qa";

export const fetchModules = () => qaData.fetchModules();
export const fetchLatestRunsByModule = () => qaData.fetchLatestRunsByModule();
export const fetchApiHealth = () => qaData.fetchApiHealth();
export const fetchRunsByModule = (slug: string) => qaData.fetchRunsByModule(slug);
export const fetchRunById = (id: string) => qaData.fetchRunById(id);
export const fetchAllRuns = () => qaData.fetchAllRuns();
export const fetchFailuresByRun = (runId: string) => qaData.fetchFailuresByRun(runId);
export const fetchEvidenceByRun = (runId: string) => qaData.fetchEvidenceByRun(runId);
export const fetchEvidenceByFailure = (failureId: string) => qaData.fetchEvidenceByFailure(failureId);
export const fetchGroupsByRun = (runId: string) => qaData.fetchGroupsByRun(runId);
export const fetchGroupLinksByRun = (runId: string) => qaData.fetchGroupLinksByRun(runId);
export const fetchNextStepsByRun = (runId: string) => qaData.fetchNextStepsByRun(runId);
export const fetchPerformanceByRun = (runId: string) => qaData.fetchPerformanceByRun(runId);
export const fetchTestcaseHierarchy = (slug: string) => qaData.fetchTestcaseHierarchy(slug);
export const fetchCasosReexecutaveis = (runId: string) => qaData.fetchCasosReexecutaveis(runId);
export const fetchRerunRequests = (limit?: number) => qaData.fetchRerunRequests(limit);
export const createRerunRequest = (payload: import("./types").CreateRerunPayload) =>
  qaData.createRerunRequest(payload);
export const cancelRerunRequest = (id: string, reason?: string) =>
  qaData.cancelRerunRequest(id, reason);
export const fetchRunPresets = () => qaData.fetchRunPresets();
export const createRunPreset = (payload: import("./types").SaveRunPresetPayload) => qaData.createRunPreset(payload);
export const updateRunPreset = (id: string, payload: import("./types").SaveRunPresetPayload) =>
  qaData.updateRunPreset(id, payload);
export const deleteRunPreset = (id: string) => qaData.deleteRunPreset(id);
