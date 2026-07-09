// =====================================================================
// SupabaseQaDataSource
//
// As tabelas legadas do dashboard (modulos, rodagens, falhas, evidencias,
// agrupamentos, proximos_passos, atrasos_rodagem, rerun_requests,
// testcase_hierarchy) foram descontinuadas. Toda leitura de dados de QA é
// feita agora pelo ApiQaDataSource (agent-tc-api), independente do valor de
// VITE_DATA_PROVIDER.
//
// O Supabase continua sendo usado para:
//   - Auth (login, cadastro, sessão)
//   - Perfis / admin (agent_tc_app_users, agent_tc_admin_audit_log)
//   - Storage (bucket de evidências)
//
// Este arquivo mantém o nome "SupabaseQaDataSource" apenas para compat: se
// alguém setar VITE_DATA_PROVIDER=supabase, continuamos servindo os mesmos
// dados via API + Storage local, sem tocar nas tabelas removidas.
// =====================================================================
import { ApiQaDataSource } from "./apiSource";
import { listStorageFilesByRun } from "@/services/qa";
import type { QaDataSource } from "./types";

export const SupabaseQaDataSource: QaDataSource = {
  ...ApiQaDataSource,
  // Storage do Supabase continua disponível para listar arquivos brutos
  // de evidências quando o backend não retornar tudo pela API.
  listStorageFilesByRun,
};
