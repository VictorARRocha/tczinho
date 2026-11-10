import type { RerunRequest } from "@/services/data";
import { rerunStatusKey } from "@/lib/rerunStatus";

/**
 * Status dos pedidos ao Jenkins, num lugar so (Rodagem completa e Reexecucao).
 * Cores em tokens com variante clara e escura: em andamento = primary, terminou bem = success,
 * precisa de acao (conflito, cancelando) = warning, falha/erro = destructive, encerrado sem nada = muted.
 */
export type MetaStatus = { label: string; selo: string; barra: string; animado?: boolean };

/** Tons dos selos de status, os mesmos no Jenkins, no Merge e na Regravacao. */
export const TOM_STATUS = {
  espera: "bg-muted text-muted-foreground border-border",
  andamento: "bg-primary/10 text-primary border-primary/30",
  sucesso: "bg-success/10 text-success border-success/30",
  aviso: "bg-warning/10 text-warning border-warning/35",
  erro: "bg-destructive/10 text-destructive border-destructive/30",
} as const;

const ESPERA = TOM_STATUS.espera;
const ANDAMENTO = TOM_STATUS.andamento;
const SUCESSO = TOM_STATUS.sucesso;
const AVISO = TOM_STATUS.aviso;
const ERRO = TOM_STATUS.erro;

export const STATUS_PEDIDO: Record<string, MetaStatus> = {
  solicitado: { label: "Solicitado", selo: ESPERA, barra: "bg-muted-foreground/40" },
  // So na tela: pedido ainda nao terminado com o data_hora no futuro (o Jenkins espera ate la).
  aguardando_horario: { label: "Aguardando horário agendado", selo: ESPERA, barra: "bg-muted-foreground/40" },
  processando: { label: "Processando", selo: ANDAMENTO, barra: "bg-primary", animado: true },
  enviado_jenkins: { label: "Enviado ao Jenkins", selo: ANDAMENTO, barra: "bg-primary" },
  na_fila: { label: "Na fila", selo: ANDAMENTO, barra: "bg-primary" },
  rodando: { label: "Rodando", selo: ANDAMENTO, barra: "bg-primary", animado: true },
  finalizado_sucesso: { label: "Finalizado", selo: SUCESSO, barra: "bg-success" },
  // Foi ate o fim com quebras ou diferencas (UNSTABLE no Jenkins): o normal de uma rodagem.
  finalizado_ocorrencias: { label: "Finalizado", selo: SUCESSO, barra: "bg-success" },
  finalizado_falha: { label: "Falhou", selo: ERRO, barra: "bg-destructive" },
  cancelado: { label: "Cancelado", selo: ESPERA, barra: "bg-muted-foreground/40" },
  cancel_requested: { label: "Cancelamento solicitado", selo: AVISO, barra: "bg-warning", animado: true },
  cancelando: { label: "Cancelando", selo: AVISO, barra: "bg-warning", animado: true },
  erro_envio: { label: "Erro no envio", selo: ERRO, barra: "bg-destructive" },
  erro_monitoramento: { label: "Erro no acompanhamento", selo: ERRO, barra: "bg-destructive" },
  erro: { label: "Erro", selo: ERRO, barra: "bg-destructive" },
};

/** Status desconhecido (versao nova da API): mostra o texto sem o "_" e na cor neutra. */
export function metaDoStatus(status: string): MetaStatus {
  return STATUS_PEDIDO[status] || { label: status.replace(/_/g, " "), selo: ESPERA, barra: "bg-muted-foreground/40" };
}

/** Estados de espera ou execucao que viram "aguardando horario" enquanto o agendamento nao chega. */
const ANTES_DO_INICIO = new Set(["solicitado", "processando", "enviado_jenkins", "na_fila", "rodando"]);

/** data_hora do pedido (dd/MM/yyyy HH:mm:ss, hora local) em milissegundos; invalida = NaN. */
function horarioAgendado(dataHora: string | null | undefined): number {
  const m = (dataHora || "").match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime() : NaN;
}

export function statusDoPedido(r: RerunRequest, agora: number = Date.now()): string {
  const status = rerunStatusKey(r);
  return ANTES_DO_INICIO.has(status) && horarioAgendado(r.data_hora) > agora ? "aguardando_horario" : status;
}
