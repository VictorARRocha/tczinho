// =====================================================================
// QaDataSource - contrato da camada de dados do dashboard.
// Implementacao atual: ApiQaDataSource.
// =====================================================================
import type {
  Modulo,
  Rodagem,
  Falha,
  Evidencia,
  Agrupamento,
  ProximoPasso,
  AtrasoRodagem,
} from "@/types/db";
import type {
  TestcaseHierarchyNode,
  RerunRequest,
  RodagemListItem,
  CasoReexecutavel,
} from "@/services/qa";

export interface CreateRerunPayload {
  vm_name: string;
  versao: string;
  casos_teste: string;
  paralelo?: string;
  ct_desmarcar?: string;
  data_hora?: string;
  branch?: string;
}

/** Item de GET /modules/latest-runs: o modulo e sua rodagem mais recente (null se nunca rodou). */
export interface ModuleLatestRun {
  modulo: Modulo;
  rodagem: Rodagem | null;
}

export interface QaDataSource {
  // Módulos e visão geral
  fetchModules(): Promise<Modulo[]>;
  fetchLatestRunsByModule(): Promise<ModuleLatestRun[]>;
  fetchApiHealth(): Promise<boolean>;

  // Rodagens
  fetchRunsByModule(slug: string): Promise<Rodagem[]>;
  fetchRunById(id: string): Promise<Rodagem | null>;
  fetchAllRuns(): Promise<RodagemListItem[]>;

  // Falhas / evidências / agrupamentos / passos
  fetchFailuresByRun(runId: string): Promise<Falha[]>;
  fetchEvidenceByRun(runId: string): Promise<Evidencia[]>;
  fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]>;
  fetchGroupsByRun(runId: string): Promise<Agrupamento[]>;
  fetchGroupLinksByRun(runId: string): Promise<Record<string, string[]>>;
  fetchNextStepsByRun(runId: string): Promise<ProximoPasso[]>;
  fetchPerformanceByRun(runId: string): Promise<AtrasoRodagem[]>;

  // Hierarquia de casos de teste
  fetchTestcaseHierarchy(slug: string): Promise<TestcaseHierarchyNode[]>;

  // Casos reexecutáveis
  fetchCasosReexecutaveis(runId: string): Promise<CasoReexecutavel[]>;

  // Rerun requests (Jenkins)
  fetchRerunRequests(limit?: number): Promise<RerunRequest[]>;
  createRerunRequest(payload: CreateRerunPayload): Promise<RerunRequest>;
  cancelRerunRequest(id: string, reason?: string): Promise<RerunRequest>;
}
