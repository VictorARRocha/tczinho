// Pecas visuais pequenas compartilhadas pelas abas do modulo.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OccurrenceType } from "@/lib/occurrence";

export function isMeaningful(v: unknown) {
  if (v == null) return false;
  if (typeof v === "string") { const s = v.trim(); return s !== "" && s !== "—" && s.toLowerCase() !== "sem informação"; }
  return true;
}

export function StatCard({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${tone}`}>{value ?? 0}</div>
    </Card>
  );
}

export function Empty({ text = "Sem dados.", onClear, clearLabel = "Limpar busca e filtros" }: { text?: string; onClear?: () => void; clearLabel?: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <p>{text}</p>
      {onClear && (
        <button type="button" onClick={onClear} className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent">
          {clearLabel}
        </button>
      )}
    </div>
  );
}

/** Rodape de paginacao das listas longas (Historico, Performance). */
export function Paginacao({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const atual = Math.min(page, totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-muted-foreground">
        Mostrando {(atual - 1) * pageSize + 1}–{Math.min(atual * pageSize, total)} de {total}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" disabled={atual <= 1} onClick={() => onChange(atual - 1)}>Anterior</button>
        <span className="font-mono text-xs text-muted-foreground">{atual} / {totalPages}</span>
        <button type="button" className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" disabled={atual >= totalPages} onClick={() => onChange(atual + 1)}>Próxima</button>
      </div>
    </div>
  );
}

/** Mensagem padrao quando busca/filtros nao encontram nada. */
/** Botao de alternar (ex.: Arvore / Lista). */
export function ToggleChip({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 md:h-8 px-3 rounded-md border text-xs inline-flex items-center gap-1.5 transition-[color,background-color,border-color,transform] duration-150 ease-out-strong active:scale-[0.97] ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
    >
      {icon}{label}
    </button>
  );
}

export const SEM_RESULTADO = "Nada encontrado com essa busca e esses filtros.";

/**
 * Cor de cada tipo de ocorrencia, num lugar so (selo, contadores, filtros, resumo).
 * Tokens com variante clara e escura: quebra = destructive, diferenca = warning, as duas = mixed.
 */
export const TIPO_COR: Record<OccurrenceType, { texto: string; ponto: string; selo: string; rotulo: string }> = {
  quebra: { texto: "text-destructive", ponto: "bg-destructive", selo: "bg-destructive/10 text-destructive border-destructive/30", rotulo: "Quebra" },
  diferenca: { texto: "text-warning", ponto: "bg-warning", selo: "bg-warning/10 text-warning border-warning/35", rotulo: "Diferença" },
  quebra_diferenca: { texto: "text-mixed", ponto: "bg-mixed", selo: "bg-mixed/10 text-mixed border-mixed/30", rotulo: "Quebra + Diferença" },
};

/** Selo do tipo da ocorrencia (Quebra / Diferenca / Quebra + Diferenca). */
export function TipoBadge({ tipo }: { tipo: OccurrenceType }) {
  const cor = TIPO_COR[tipo];
  return (
    <Badge variant="outline" className={`text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full border ${cor.selo}`}>
      {cor.rotulo}
    </Badge>
  );
}
