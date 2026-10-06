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

export type RunPresetMode = "simplificada" | "configurada";

/** Pre-definicao de rodagem Jenkins salva na API (compartilhada entre usuarios). */
export interface RunPreset {
  id: string;
  name: string;
  mode: RunPresetMode;
  config_json: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveRunPresetPayload {
  nome?: string;
  modo?: RunPresetMode;
  config?: Record<string, unknown>;
}

/** Diferenca de uma rodagem e se pode ser regravada (GET /runs/:id/regravacao). */
export interface RegravacaoItem {
  difference_id: string;
  occurrence_id: string | null;
  id_caso_teste: string | null;
  arquivo_base: string | null;
  arquivo_atual: string | null;
  base_evidence_id: string | null;
  current_evidence_id: string | null;
  caminho_base: string | null;
  linhas_alteradas: number | null;
  regravavel: boolean;
  motivo: string | null;
  motivo_texto: string | null;
}

export interface RegravacaoCandidatos {
  run_id: string;
  repository_url: string | null;
  repository_revision: string | null;
  itens: RegravacaoItem[];
}

export interface RegravacaoResultadoItem {
  difference_id: string;
  arquivo_atual?: string | null;
  caminho_base?: string | null;
  status: string;
  mensagem?: string | null;
}

/** Pedido de regravacao (executado pelo RegravacaoBridge na D01). */
export interface RegravacaoPedido {
  id: string;
  run_id: string;
  status: "solicitado" | "processando" | "concluido" | "erro" | "cancelado" | string;
  requested_by: string | null;
  repository_url: string;
  commit_message: string | null;
  items_json: { difference_id: string; id_caso_teste: string | null; arquivo_atual: string | null; caminho_base: string }[];
  result_json: { itens?: RegravacaoResultadoItem[]; simulacao?: boolean; revisao_conferida?: string; conflito?: boolean } | null;
  svn_revision: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface CreateRegravacaoPayload {
  run_id: string;
  difference_ids: string[];
  mensagem?: string;
}

/** Branch do projeto do TC (lista enviada pelo MergeBridge). "trunk" = principal (Unico). */
export interface SvnBranch {
  name: string;
  url: string;
  kind: "trunk" | "branch";
  last_revision?: string | null;
  last_author?: string | null;
  last_date?: string | null;
}

export interface MergeBranches {
  branches: SvnBranch[];
  updated_at: string | null;
}

export interface MergeRevisao {
  revisao: string;
  autor: string | null;
  data: string | null;
  mensagem: string;
}

export interface MergeArquivo {
  caminho: string;
  acao: string;
}

export interface MergeConflito {
  caminho: string;
  tipo: string;
}

/** Previa do merge (dry-run feito pelo MergeBridge). */
export interface MergePreview {
  source_revision?: string;
  target_revision?: string;
  gerada_em?: string;
  revisoes?: MergeRevisao[];
  total_revisoes?: number;
  arquivos?: MergeArquivo[];
  total_arquivos?: number;
  conflitos?: MergeConflito[];
  mensagem_padrao?: string;
}

/** Pedido de merge entre branches (executado pelo MergeBridge na D01). */
export interface MergePedido {
  id: string;
  status: string;
  requested_by: string | null;
  source_url: string;
  source_name: string | null;
  target_url: string;
  target_name: string | null;
  target_kind: string | null;
  commit_message: string | null;
  preview_json: MergePreview | null;
  result_json: { conflitos?: MergeConflito[]; arquivos?: MergeArquivo[]; total_arquivos?: number; simulacao?: boolean; retomado?: boolean } | null;
  svn_revision: string | null;
  error_message: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** Merge direto (sem previa): mensagem e confirmacao da principal vao junto com o pedido. */
export interface CreateMergePayload {
  source_url: string;
  target_url: string;
  direto?: boolean;
  mensagem?: string;
  confirma_trunk?: boolean;
}

export interface ConfirmMergePayload {
  mensagem?: string;
  confirma_trunk?: boolean;
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

  // Pre-definicoes de rodagem (Jenkins)
  fetchRunPresets(): Promise<RunPreset[]>;
  createRunPreset(payload: SaveRunPresetPayload): Promise<RunPreset>;
  updateRunPreset(id: string, payload: SaveRunPresetPayload): Promise<RunPreset>;
  deleteRunPreset(id: string): Promise<void>;

  // Regravacao de bases (SVN)
  fetchRegravacaoCandidatos(runId: string): Promise<RegravacaoCandidatos>;
  fetchRegravacoes(runId?: string): Promise<RegravacaoPedido[]>;
  createRegravacao(payload: CreateRegravacaoPayload): Promise<RegravacaoPedido>;
  cancelRegravacao(id: string): Promise<void>;

  // Merge entre branches do TC (SVN)
  fetchMergeBranches(): Promise<MergeBranches>;
  fetchMerges(): Promise<MergePedido[]>;
  createMerge(payload: CreateMergePayload): Promise<MergePedido>;
  confirmMerge(id: string, payload: ConfirmMergePayload): Promise<MergePedido>;
  cancelMerge(id: string): Promise<void>;
}
