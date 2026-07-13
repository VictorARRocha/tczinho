// =====================================================================
// Cliente para os endpoints de agrupamento por IA do Agent TC.
//   GET  /runs/{runId}/ai-group-status
//   POST /runs/{runId}/ai-group
//
// A IA (OpenAI) é chamada pelo backend Python. O frontend apenas
// dispara e atualiza a tela. Nunca chame OpenAI aqui.
//
// Autenticação: SEMPRE enviar Authorization: Bearer {session.access_token}
// obtido via supabase.auth.getSession(). Nunca usar service_role nem anon
// key como Bearer.
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

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token ?? null;
  const expiresAt = data.session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  // Se expirado ou prestes a expirar (<30s), tenta renovar.
  if (!token || (expiresAt && expiresAt - nowSec < 30)) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token ?? token;
    } catch {
      /* ignore — cai no fluxo de "sem token" abaixo */
    }
  }
  return token;
}

async function authHeaders(required: boolean): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) {
    if (required) {
      const err: AiGroupError = {
        status: 401,
        code: "not_authenticated",
        message: "Sessão expirada ou sem permissão. Faça login novamente.",
      };
      throw err;
    }
    return {};
  }
  return { Authorization: `Bearer ${token}` };
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
    headers: { "Content-Type": "application/json", ...(await authHeaders(true)) },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AiGroupStatusResponse;
}

export async function requestAiGrouping(runId: string, dryRun = false): Promise<AiGroupStatusResponse> {
  // Auth obrigatória — não chama a API sem Bearer.
  const auth = await authHeaders(true);
  const res = await fetch(`${baseUrl()}/runs/${encodeURIComponent(runId)}/ai-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ dry_run: dryRun }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AiGroupStatusResponse;
}
