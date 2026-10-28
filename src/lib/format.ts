import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(parseISO(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return formatDistanceToNow(parseISO(date), { locale: ptBR, addSuffix: true });
  } catch {
    return "—";
  }
}

/** Data e hora completas para dicas (title) ao lado de um tempo relativo. */
export function formatDateTimeLong(date: string | null | undefined): string {
  if (!date) return "";
  try {
    return format(parseISO(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

/**
 * Resultado de uma rodagem: casos rodados, quantos passaram e a taxa de sucesso.
 * Sem total confiavel (menor que as falhas), devolve null em vez de inventar um numero.
 */
export function resultadoRodagem(r: { total_analisados: number | null; total_falhas: number | null }) {
  // Sem um dos dois totais nao da para calcular: total de falhas vazio nao e "nenhuma falha".
  if (r.total_analisados == null || r.total_falhas == null) return null;
  const rodados = r.total_analisados;
  const falhas = r.total_falhas;
  if (rodados <= 0 || rodados < falhas) return null;
  const passaram = rodados - falhas;
  return { rodados, falhas, passaram, taxa: passaram / rodados };
}

/** 0.9464 -> "94,6%". */
export function formatPercent(v: number, digits = 1): string {
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

const classMap: Record<string, { label: string; className: string }> = {
  automacao: { label: "Automação", className: "bg-automation/15 text-automation border-automation/30" },
  automation: { label: "Automação", className: "bg-automation/15 text-automation border-automation/30" },
  massa_dados: { label: "Massa/Dados", className: "bg-data-mass/15 text-data-mass border-data-mass/30" },
  massa: { label: "Massa/Dados", className: "bg-data-mass/15 text-data-mass border-data-mass/30" },
  dados: { label: "Massa/Dados", className: "bg-data-mass/15 text-data-mass border-data-mass/30" },
  ambiente: { label: "Ambiente", className: "bg-environment/15 text-environment border-environment/30" },
  possivel_funcional: { label: "Possível funcional", className: "bg-functional/15 text-functional border-functional/30" },
  funcional: { label: "Funcional", className: "bg-functional/15 text-functional border-functional/30" },
  inconclusivo: { label: "Inconclusivo", className: "bg-inconclusive/15 text-inconclusive border-inconclusive/30" },
};

export function getClassification(c: string | null | undefined) {
  if (!c) return { label: "—", className: "bg-muted text-muted-foreground border-border" };
  const key = c.toLowerCase().replace(/\s+/g, "_").replace(/\//g, "_");
  return classMap[key] || { label: c, className: "bg-muted text-muted-foreground border-border" };
}

export function getSeverity(s: string | null | undefined) {
  const v = (s || "").toLowerCase();
  if (v.includes("alta") || v === "high") return { label: "Alta", className: "bg-destructive/15 text-destructive border-destructive/30" };
  if (v.includes("med")) return { label: "Média", className: "bg-warning/15 text-warning border-warning/30" };
  if (v.includes("baixa") || v === "low") return { label: "Baixa", className: "bg-success/15 text-success border-success/30" };
  return { label: s || "—", className: "bg-muted text-muted-foreground border-border" };
}

export function getHealthStatus(status: string | null | undefined, score?: number | null) {
  const v = (status || "").toLowerCase();
  if (v.includes("saud") || v.includes("ok") || v.includes("heal") || (score != null && score >= 75)) {
    return { label: "Saudável", className: "bg-success/15 text-success border-success/30", dot: "bg-success" };
  }
  if (v.includes("aten") || v.includes("warn") || v.includes("crit") || (score != null && score < 75)) {
    return { label: "Atenção", className: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" };
  }
  return { label: "Sem dados", className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
}

/**
 * Tempo total da rodagem (inicio da pasta ate o pipeline do AgenteTC comecar, logo depois do fim).
 * Rodagens antigas nao tem o fim; valor estranho (negativo ou mais de 2 dias) fica de fora.
 */
export function tempoTotalRodagem(r: { data_inicio_rodagem?: string | null; data_fim_rodagem?: string | null }): number | null {
  if (!r.data_inicio_rodagem || !r.data_fim_rodagem) return null;
  const segundos = (Date.parse(r.data_fim_rodagem) - Date.parse(r.data_inicio_rodagem)) / 1000;
  if (!Number.isFinite(segundos) || segundos <= 0 || segundos > 48 * 3600) return null;
  return Math.round(segundos);
}

/** Rodagem anterior do modulo (comecou antes desta) que tem tempo total, para comparar. */
export function rodagemAnteriorComTempo<T extends { id: string; data_inicio_rodagem?: string | null; data_fim_rodagem?: string | null }>(
  atual: T,
  historico: T[],
): T | null {
  const inicio = Date.parse(atual.data_inicio_rodagem || "");
  if (!Number.isFinite(inicio)) return null;
  let melhor: T | null = null;
  let melhorInicio = -Infinity;
  for (const r of historico) {
    const t = Date.parse(r.data_inicio_rodagem || "");
    if (r.id === atual.id || !Number.isFinite(t) || t >= inicio || tempoTotalRodagem(r) == null) continue;
    if (t > melhorInicio) { melhor = r; melhorInicio = t; }
  }
  return melhor;
}

/** Variacao do tempo total em relacao a outra rodagem (0.082 = 8,2% mais demorada). */
export function variacaoTempo(atual: number, anterior: number): number | null {
  return anterior > 0 ? (atual - anterior) / anterior : null;
}

/** 36000 -> "10h00min", 2820 -> "47min", 30 -> "menos de 1min". */
export function formatarTempoTotal(segundos: number): string {
  const min = Math.floor(segundos / 60);
  if (min < 1) return "menos de 1min";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}min` : `${min}min`;
}
