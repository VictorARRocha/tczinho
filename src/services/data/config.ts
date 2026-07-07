// =====================================================================
// Configuração do provider de dados.
//
// Variáveis (arquivo .env na raiz do projeto):
//   VITE_DATA_PROVIDER   = "supabase" | "api"   (default: "supabase")
//   VITE_AGENT_TC_API_URL = "http://localhost:8000"  (usado quando provider="api")
//
// IMPORTANTE:
//   - Nunca coloque service_role key no frontend.
//   - Apenas chaves públicas/anon podem existir aqui.
// =====================================================================
export type DataProvider = "supabase" | "api";

export interface DataConfig {
  provider: api;
  apiBaseUrl: string;
}

export function getDataConfig(): DataConfig {
  const raw = (import.meta.env.VITE_DATA_PROVIDER as string | undefined)?.toLowerCase();
  const provider: DataProvider = raw === "api" ? "api" : "supabase";
  const apiBaseUrl = (import.meta.env.VITE_AGENT_TC_API_URL as string | undefined) ?? "http://192.168.9.201:8000";
  return { provider, apiBaseUrl };
}
