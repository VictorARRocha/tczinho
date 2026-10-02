import type { RerunRequest } from "@/services/qa";

/** Estados em que o pedido ainda pode mudar (fila, execucao, cancelamento em curso). */
export const ACTIVE_RERUN_STATUSES = new Set<string>([
  "solicitado", "processando", "enviado_jenkins", "na_fila", "rodando", "erro_monitoramento",
  "cancel_requested", "cancelando",
]);

export function rerunStatusKey(r: RerunRequest): string {
  return (r.execution_status || r.status || "solicitado").toString().toLowerCase().trim();
}

export function hasActiveRerun(requests: RerunRequest[] | undefined): boolean {
  return (requests || []).some((r) => ACTIVE_RERUN_STATUSES.has(rerunStatusKey(r)));
}
