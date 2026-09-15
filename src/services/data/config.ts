// =====================================================================
// Configuracao da API de dados.
//
// Variaveis (arquivo .env na raiz do projeto):
//   VITE_DATA_PROVIDER=api
//   VITE_AGENT_TC_API_URL=http://localhost:8000
//
// IMPORTANTE:
//   - Nunca coloque service_role key no frontend.
//   - O dashboard deve falar com a API, nao direto com banco/storage.
// =====================================================================
export type DataProvider = "api";

export interface DataConfig {
  provider: DataProvider;
  apiBaseUrl: string;
}

export function getDataConfig(): DataConfig {
  const apiBaseUrl =
    (import.meta.env.VITE_AGENT_TC_API_URL as string | undefined) ?? "https://agent-tc-api.onrender.com";
  return { provider: "api", apiBaseUrl };
}
