import { ApiError } from "@/services/data/apiSource";

/** Mensagem da API para mostrar ao usuario (ex.: "Voce nao tem acesso ao modulo Fiscal..."), em vez de "[api 403]". */
export function mensagemDaApi(e: unknown): string {
  if (e instanceof ApiError && e.detail) return e.detail;
  return (e as Error)?.message || "Erro desconhecido";
}
