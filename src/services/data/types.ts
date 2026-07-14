// =====================================================================
// QaDataSource — camada de dados abstrata do dashboard.
// Implementações: SupabaseQaDataSource (atual) e ApiQaDataSource (futuro).
// Trocada via VITE_DATA_PROVIDER=supabase|api.
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

export type RealtimeTable =
  | "rodagens"
  | "falhas"
  | "evidencias"
  | "agrupamentos"
  | "proximos_passos"
  | "modulos"
  | "rerun_requests";

export interface CreateRerunPayload {
  vm_name: string;
  versao: string;
  casos_teste: string;
  paralelo?: string;
  ct_desmarcar?: string;
  data_hora?: string;
  branch?: string;
}

export interface QaDataSource {
  // Módulos
  fetchModules(): Promise<Modulo[]>;

  // Rodagens
  fetchRunsByModule(slug: string): Promise<Rodagem[]>;
  fetchLatestRunByModule(slug: string): Promise<Rodagem | null>;
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

  // Storage (arquivos brutos de evidências)
  listStorageFilesByRun(
    runId: string,
    moduloSlug?: string,
    pastaOrigem?: string | null,
  ): Promise<Evidencia[]>;

  // Hierarquia de casos de teste
  fetchTestcaseHierarchy(slug: string): Promise<TestcaseHierarchyNode[]>;

  // Casos reexecutáveis
  fetchCasosReexecutaveis(runId: string): Promise<CasoReexecutavel[]>;

  // Rerun requests (Jenkins)
  fetchRerunRequests(limit?: number): Promise<RerunRequest[]>;
  fetchRerunRequestsByModule(
    slug: string,
    moduleName?: string | null,
    limit?: number,
  ): Promise<RerunRequest[]>;
  createRerunRequest(payload: CreateRerunPayload): Promise<RerunRequest>;
  cancelRerunRequest(id: string, reason?: string): Promise<RerunRequest>;

  // Dashboard agregado
  fetchModuleDashboardData(slug: string): Promise<{
    modulo: Modulo | null;
    rodagem: Rodagem | null;
    falhas: Falha[];
    evidencias: Evidencia[];
    grupos: Agrupamento[];
    passos: ProximoPasso[];
    historico: Rodagem[];
  }>;

  // Realtime (opcional para provider REST — pode ser polling)
  subscribeToTable(table: RealtimeTable, cb: (payload: any) => void): () => void;
}
