import { getDataConfig } from "./data/config";

export type AppUserStatus = "pending" | "approved" | "rejected" | "disabled";
export type AppUserRole = "user" | "admin";

export interface AppUserProfile {
  id: string;
  auth_user_id?: string | null;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: AppUserRole;
  status: AppUserStatus;
  rejection_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  disabled_at?: string | null;
  last_login_at?: string | null;
  must_change_password?: boolean | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  disabled_by?: string | null;
  locked_until?: string | null;
  failed_login_attempts?: number | null;
  /** Acoes liberadas pelo admin: "rodagem", "merge", "regravar" (admin pode tudo, sem depender da lista). */
  permissions?: string[];
  /** Modulos em que pode agir: slugs ("folha", ...) ou ["*"] = todos. Ausente (API antiga) = todos. */
  modules?: string[];
}

export interface LocalAuthSession {
  id?: string;
  user_id?: string;
  created_at?: string;
  expires_at?: string;
  last_seen_at?: string;
}

export interface LocalLoginResponse {
  ok?: boolean;
  token: string;
  session?: LocalAuthSession;
  user: AppUserProfile;
}

export interface LocalAuthError extends Error {
  status?: number;
  code?: string;
}

const TOKEN_KEY = "agent_tc_auth_token";

export function normalizeUsername(username: string) {
  return username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export const SESSION_EXPIRED_EVENT = "agent-tc:session-expired";

/** Chamado quando uma rota autenticada responde 401: a sessao expirou ou foi revogada. */
export function notifySessionExpired() {
  if (typeof window === "undefined") return;
  // Varias chamadas em paralelo podem receber 401; so a primeira avisa o app.
  if (!getAuthToken()) return;
  clearAuthToken();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function getAuthHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function baseUrl(): string {
  const { apiBaseUrl } = getDataConfig();
  if (!apiBaseUrl) throw new Error("VITE_AGENT_TC_API_URL nao configurada");
  return apiBaseUrl.replace(/\/+$/, "");
}

async function parseError(res: Response): Promise<LocalAuthError> {
  let code: string | undefined;
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    code = body?.error || body?.code;
    message = body?.message || body?.detail || code || message;
  } catch {
    // Mantem a mensagem HTTP padrao.
  }
  const err = new Error(message) as LocalAuthError;
  err.status = res.status;
  err.code = code;
  return err;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export const authApi = {
  register(data: { username: string; first_name: string; last_name: string; password: string; modules?: string[] }) {
    return request<{ ok?: boolean; user: AppUserProfile }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...data, username: normalizeUsername(data.username) }),
    });
  },

  login(username: string, password: string) {
    return request<LocalLoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: normalizeUsername(username), password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      headers: getAuthHeader(),
    });
  },

  me() {
    return request<{ ok?: boolean; user: AppUserProfile }>("/auth/me", {
      headers: getAuthHeader(),
    });
  },

  users() {
    return request<{ ok?: boolean; users: AppUserProfile[] }>("/auth/users", {
      headers: getAuthHeader(),
    });
  },

  updateUser(userId: string, data: Partial<Pick<AppUserProfile, "role" | "status" | "first_name" | "last_name" | "email" | "rejection_reason" | "permissions" | "modules">>) {
    return request<{ ok?: boolean; user: AppUserProfile }>(`/auth/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
  },
};
