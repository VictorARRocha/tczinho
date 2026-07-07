// =====================================================================
// SupabaseQaDataSource — implementação atual, delega para src/services/qa.ts.
// =====================================================================
import * as qa from "@/services/qa";
import type { QaDataSource, CreateRerunPayload, RealtimeTable } from "./types";

export const SupabaseQaDataSource: QaDataSource = {
  fetchModules: qa.fetchModules,

  fetchRunsByModule: qa.fetchRunsByModule,
  fetchLatestRunByModule: qa.fetchLatestRunByModule,
  fetchRunById: qa.fetchRunById,
  fetchAllRuns: qa.fetchAllRuns,

  fetchFailuresByRun: qa.fetchFailuresByRun,
  fetchEvidenceByRun: qa.fetchEvidenceByRun,
  fetchEvidenceByFailure: qa.fetchEvidenceByFailure,
  fetchGroupsByRun: qa.fetchGroupsByRun,
  fetchGroupLinksByRun: qa.fetchGroupLinksByRun,
  fetchNextStepsByRun: qa.fetchNextStepsByRun,
  fetchPerformanceByRun: qa.fetchPerformanceByRun,

  listStorageFilesByRun: qa.listStorageFilesByRun,

  fetchTestcaseHierarchy: qa.fetchTestcaseHierarchy,

  fetchCasosReexecutaveis: qa.fetchCasosReexecutaveis,

  fetchRerunRequests: qa.fetchRerunRequests,
  fetchRerunRequestsByModule: qa.fetchRerunRequestsByModule,
  createRerunRequest: (payload: CreateRerunPayload) => qa.createRerunRequest(payload),

  fetchModuleDashboardData: qa.fetchModuleDashboardData,

  subscribeToTable: (table: RealtimeTable, cb) => qa.subscribeToTable(table, cb),
};
