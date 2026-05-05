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

export function getConfidence(c: string | null | undefined) {
  const v = (c || "").toLowerCase();
  if (v.includes("alta")) return { label: "Alta", className: "bg-success/15 text-success border-success/30" };
  if (v.includes("med")) return { label: "Média", className: "bg-warning/15 text-warning border-warning/30" };
  if (v.includes("baixa")) return { label: "Baixa", className: "bg-muted text-muted-foreground border-border" };
  return { label: c || "—", className: "bg-muted text-muted-foreground border-border" };
}

export function severityRank(s: string | null | undefined): number {
  const v = (s || "").toLowerCase();
  if (v.includes("alta")) return 3;
  if (v.includes("med")) return 2;
  if (v.includes("baixa")) return 1;
  return 0;
}
