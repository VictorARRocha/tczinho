// Pecas visuais pequenas compartilhadas pelas abas do modulo.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
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
    <Card className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${tone}`}>{value ?? 0}</div>
    </Card>
  );
}

export function Empty({ text = "Sem dados." }: { text?: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

/** Selo do tipo da ocorrencia (Quebra / Diferenca / Quebra + Diferenca). */
export function TipoBadge({ tipo }: { tipo: OccurrenceType }) {
  const base = "text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full border";
  if (tipo === "quebra")
    return <Badge variant="outline" className={`${base} bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30`}>Quebra</Badge>;
  if (tipo === "diferenca")
    return <Badge variant="outline" className={`${base} bg-amber-500/15 text-amber-800 border-amber-600/40 dark:bg-amber-900/25 dark:text-amber-200/90 dark:border-amber-700/40`}>Diferença</Badge>;
  return <Badge variant="outline" className={`${base} bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30`}>Quebra + Diferença</Badge>;
}
