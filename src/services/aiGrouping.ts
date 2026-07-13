// =====================================================================
// Cliente para os endpoints de agrupamento por IA do Agent TC.
//   GET  /runs/{runId}/ai-group-status
//   POST /runs/{runId}/ai-group
//
// A IA (OpenAI) é chamada pelo backend Python. O frontend apenas
// dispara e atualiza a tela. Nunca chame OpenAI aqui.
// =====================================================================
import { getDataConfig } from "./data/config";
import { supabase } from "@/lib/supabase";

export type AiGroupStatus = "not_requested" | "running" | "completed" | "failed";

export interface AiGroupStatusResponse {
  run_id: string;
  status: AiGroupStatus;
  job_id?: string | null;
  model?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  groups_count?: number;
  grouped?: boolean;
}

export interface AiGroupError {
  status: number;
  code?: string;
  message: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function baseUrl(): string {
  const { apiBaseUrl } = getDataConfig();
  if (!apiBaseUrl) throw new Error("VITE_AGENT_TC_API_URL não configurada");
  return apiBaseUrl.replace(/\/+$/, "");
}

async function parseError(res: Response): Promise<AiGroupError> {
  let code: string | undefined;
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    code = body?.error || body?.code;
    message = body?.message || body?.detail || code || message;
  } catch {
    /* ignore */
  }
  return { status: res.status, code, message };
}

export async function fetchAiGroupStatus(runId: string): Promise<AiGroupStatusResponse> {
  const res = await fetch(`${baseUrl()}/runs/${encodeURIComponent(runId)}/ai-group-status`, {
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AiGroupStatusResponse;
}

export async function requestAiGrouping(runId: string, dryRun = false): Promise<AiGroupStatusResponse> {
  const res = await fetch(`${baseUrl()}/runs/${encodeURIComponent(runId)}/ai-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ dry_run: dryRun }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AiGroupStatusResponse;
}
