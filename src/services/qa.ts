// =====================================================================
// qa.ts — utilitários puros compartilhados pelo dashboard.
//
// IMPORTANTE:
// Toda leitura de dados de QA passa pela API Agent TC.
// Este arquivo mantem apenas tipos e helpers puros usados pela UI.
// =====================================================================

// =====================================================================
// TESTCASE HIERARCHY (tipo mantido para a UI; leitura é feita pelo API source)
// =====================================================================
export interface TestcaseHierarchyNode {
  node_id: string;
  parent_node_id: string | null;
  node_name: string;
  node_type: string | null;
  full_path_ids: string | null;
  full_path_names: string | null;
  full_path_label: string | null;
  script_name: string | null;
  procedure_name: string | null;
  modulo_codigo: string | null;
  modulo_nome: string | null;
  sistema: string | null;
  /** Descricao do caso/grupo no .mds (vazia nas rodagens anteriores a ela ser guardada). */
  descricao?: string | null;
}

// =====================================================================
// RERUN REQUESTS (tipos mantidos; persistência via API)
// =====================================================================
export interface RerunRequest {
  id: string;
  fk_rodagem: string | null;
  vm_name: string;
  versao: string;
  casos_teste: string;
  paralelo: string | null;
  ct_desmarcar: string | null;
  data_hora: string | null;
  branch: string | null;
  config_json: unknown;
  status: "solicitado" | "processando" | "enviado_jenkins" | "erro" | string;
  jenkins_url: string | null;
  jenkins_queue_url: string | null;
  jenkins_build_number: string | null;
  erro: string | null;
  retorno_jenkins: unknown;
  created_at: string;
  updated_at: string;
  tipo_solicitacao?: string | null;
  modo_configuracao?: string | null;
  modulo_nome?: string | null;
  modulo_codigo?: string | null;
  solicitado_por?: string | null;
  execution_status?: string | null;
  execution_result?: string | null;
  progress_percent?: number | null;
  build_number?: string | number | null;
  build_url?: string | null;
  queue_id?: string | number | null;
  queue_url?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  estimated_duration_ms?: number | null;
  last_checked_at?: string | null;
  monitor_error?: string | null;
}

export interface RodagemListItem {
  id_rodagem: string;
  sistema: string | null;
  versao: string | null;
  vm_name: string | null;
  data_inicio: string | null;
  caminho_logs: string | null;
  total_falhas: number | null;
  total_clusters: number | null;
  created_at: string | null;
  modulo_slug?: string | null;
  /** URL do SVN em que o projeto do TC estava na VM durante a rodagem (branch do TC). */
  repository_url?: string | null;
}

export interface CasoReexecutavel {
  id_falha: string;
  id_caso_teste: string | null;
  nome_mds: string | null;
  grupo: string | null;
  arquivo_origem: string | null;
  cluster_id: string;
  cluster_status: string | null;
  cluster_titulo: string | null;
  cluster_assinatura: string | null;
  tipo_ocorrencia: "quebra" | "diferenca" | "quebra_diferenca" | "outro";
}

// =====================================================================
// Helpers puros
// =====================================================================

/** Extrai VM (ex.: "a07") a partir de id_rodagem ou caminho_logs. */
export function extractVmName(input?: string | null): string | null {
  if (!input) return null;
  const m =
    input.match(/(?:^|[_\-/\\])([Aa]\d{2,3})(?:[_\-/\\]|$)/) ||
    input.match(/\b([Aa]\d{2,3})\b/);
  return m ? m[1].toLowerCase() : null;
}

export function formatNowBr(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Data/hora "agora" para o Jenkins: now - 1 minuto, formato dd/MM/yyyy HH:mm:ss */
export function formatNowMinusOneMinuteBr(): string {
  const d = new Date(Date.now() - 60_000);
  return formatNowBr(d);
}
