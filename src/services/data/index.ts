// =====================================================================
// Ponto de entrada da camada de dados.
//
// Use SEMPRE via `qaData` — nunca importe supabase-js direto nos componentes.
//   import { qaData } from "@/services/data";
//   const modulos = await qaData.fetchModules();
//
// O provider padrão é Supabase. Para trocar para a API REST futura:
//   VITE_DATA_PROVIDER=api
//   VITE_AGENT_TC_API_URL=http://localhost:8000
// =====================================================================
import { getDataConfig } from "./config";
import { SupabaseQaDataSource } from "./supabaseSource";
import { ApiQaDataSource } from "./apiSource";
import type { QaDataSource } from "./types";

function pickProvider(): QaDataSource {
  const { provider } = getDataConfig();
  if (provider === "api") {
    console.info("[data] provider = api");
    return ApiQaDataSource;
  }
  console.info("[data] provider = supabase");
  return SupabaseQaDataSource;
}

export const qaData: QaDataSource = pickProvider();

export type { QaDataSource, CreateRerunPayload, RealtimeTable } from "./types";
export { SupabaseQaDataSource } from "./supabaseSource";
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
  mergeEvidences,
} from "@/services/qa";

export const fetchModules = () => qaData.fetchModules();
export const fetchRunsByModule = (slug: string) => qaData.fetchRunsByModule(slug);
export const fetchLatestRunByModule = (slug: string) => qaData.fetchLatestRunByModule(slug);
export const fetchRunById = (id: string) => qaData.fetchRunById(id);
export const fetchAllRuns = () => qaData.fetchAllRuns();
export const fetchFailuresByRun = (runId: string) => qaData.fetchFailuresByRun(runId);
export const fetchEvidenceByRun = (runId: string) => qaData.fetchEvidenceByRun(runId);
export const fetchEvidenceByFailure = (failureId: string) => qaData.fetchEvidenceByFailure(failureId);
export const fetchGroupsByRun = (runId: string) => qaData.fetchGroupsByRun(runId);
export const fetchGroupLinksByRun = (runId: string) => qaData.fetchGroupLinksByRun(runId);
export const fetchNextStepsByRun = (runId: string) => qaData.fetchNextStepsByRun(runId);
export const fetchPerformanceByRun = (runId: string) => qaData.fetchPerformanceByRun(runId);
export const listStorageFilesByRun = (
  runId: string,
  moduloSlug?: string,
  pastaOrigem?: string | null,
) => qaData.listStorageFilesByRun(runId, moduloSlug, pastaOrigem);
export const fetchTestcaseHierarchy = (slug: string) => qaData.fetchTestcaseHierarchy(slug);
export const fetchCasosReexecutaveis = (runId: string) => qaData.fetchCasosReexecutaveis(runId);
export const fetchRerunRequests = (limit?: number) => qaData.fetchRerunRequests(limit);
export const fetchRerunRequestsByModule = (
  slug: string,
  moduleName?: string | null,
  limit?: number,
) => qaData.fetchRerunRequestsByModule(slug, moduleName, limit);
export const createRerunRequest = (payload: import("./types").CreateRerunPayload) =>
  qaData.createRerunRequest(payload);
export const fetchModuleDashboardData = (slug: string) => qaData.fetchModuleDashboardData(slug);
export const subscribeToTable = (
  table: import("./types").RealtimeTable,
  cb: (payload: any) => void,
) => qaData.subscribeToTable(table, cb);
