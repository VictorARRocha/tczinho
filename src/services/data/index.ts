// =====================================================================
// Ponto de entrada da camada de dados.
//
// Use SEMPRE via `qaData` — nunca importe supabase-js direto nos componentes.
//   import { qaData } from "@/services/data";
//   const modulos = await qaData.fetchModules();
//
// O provider padrão é Supabase. Para trocar para a API REST futura:
//   VITE_DATA_PROVIDER=api
//   VITE_AGENT_TC_API_URL=http://localhost:8000
// =====================================================================
import { getDataConfig } from "./config";
import { SupabaseQaDataSource } from "./supabaseSource";
import { ApiQaDataSource } from "./apiSource";
import type { QaDataSource } from "./types";

function pickProvider(): QaDataSource {
  const { provider } = getDataConfig();
  if (provider === "api") {
    console.info("[data] provider = api");
    return ApiQaDataSource;
  }
  console.info("[data] provider = supabase");
  return SupabaseQaDataSource;
}

export const qaData: QaDataSource = pickProvider();

export type { QaDataSource, CreateRerunPayload, RealtimeTable } from "./types";
export { SupabaseQaDataSource } from "./supabaseSource";
export { ApiQaDataSource } from "./apiSource";
export { getDataConfig } from "./config";
