// Aba Comparar: o que mudou entre duas rodagens do modulo (falhas novas,
// persistentes e resolvidas), com o tipo da falha antes e depois.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Falha, Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowRight, GitCompare, RefreshCw, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { compareRuns, executedCountsDiffer, orderRuns, type CaseComparison, type CaseStatus } from "@/lib/runComparison";
import { useDebounce } from "@/hooks/useDebounce";
import { useRunFailures } from "@/services/queries";
import { failureDescription } from "./caseText";
import { TipoBadge } from "./common";

type Filtro = "todos" | CaseStatus | "tipo_mudou";

const STATUS_META: Record<CaseStatus, { label: string; badge: string; card: string }> = {
  nova: { label: "Nova", badge: "bg-destructive/15 text-destructive border-destructive/40", card: "text-destructive" },
  persistente: { label: "Persistente", badge: "bg-warning/15 text-warning border-warning/40", card: "text-warning" },
  resolvida: { label: "Não falhou", badge: "bg-success/15 text-success border-success/40", card: "text-success" },
};

function runLabel(r: Rodagem): string {
  const data = formatDateTime(r.data_inicio_rodagem || r.data_analise);
  const partes = [data, r.maquina, r.versao_sistema].filter((p) => p && p !== "—");
  return `${partes.join(" — ")} · ${r.total_falhas ?? 0} falhas`;
}

function caseMatches(item: CaseComparison, needle: string): boolean {
  if (!needle) return true;
  const corpus = [
    item.caseId,
    item.nome,
    ...[...item.depois, ...item.antes].map((f) => `${failureDescription(f)} ${f.erro_principal || ""} ${f.arquivo_zip || ""}`),
  ]
    .join(" ")
    .toLowerCase();
  return corpus.includes(needle.toLowerCase());
}

export function CompararTab({
  runs,
  currentRunId,
  onOpenFailure,
}: {
  runs: Rodagem[];
  currentRunId: string;
  onOpenFailure: (f: Falha) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);

  // Padrao: rodagem aberta x a imediatamente anterior (historico vem do mais recente ao mais antigo).
  const currentIndex = Math.max(0, runs.findIndex((r) => r.id === currentRunId));
  const defaultPara = runs[currentIndex]?.id;
  const defaultDe = runs[currentIndex + 1]?.id ?? runs.find((r) => r.id !== defaultPara)?.id;
  const paramDe = searchParams.get("de");
  const paramPara = searchParams.get("para");
  const deId = runs.some((r) => r.id === paramDe) ? (paramDe as string) : defaultDe;
  const paraId = runs.some((r) => r.id === paramPara) ? (paramPara as string) : defaultPara;

  const setRun = (param: "de" | "para", id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "comparar");
    next.set("de", param === "de" ? id : deId || "");
    next.set("para", param === "para" ? id : paraId || "");
    setSearchParams(next, { replace: true });
  };

  const runDe = runs.find((r) => r.id === deId) || null;
  const runPara = runs.find((r) => r.id === paraId) || null;
  const mesmaRodagem = !!runDe && runDe.id === runPara?.id;
  const [antiga, recente] = runDe && runPara ? orderRuns(runDe, runPara) : [null, null];

  const antes = useRunFailures(antiga?.id);
  const depois = useRunFailures(recente?.id);
  const carregando = antes.isLoading || depois.isLoading;

  const comparacao = useMemo(
    () => (antes.data && depois.data && !mesmaRodagem ? compareRuns(antes.data, depois.data) : null),
    [antes.data, depois.data, mesmaRodagem],
  );

  const visiveis = useMemo(() => {
    if (!comparacao) return [];
    return comparacao.itens.filter((item) => {
      if (filtro === "tipo_mudou" ? !item.tipoMudou : filtro !== "todos" && item.status !== filtro) return false;
      return caseMatches(item, debouncedQ);
    });
  }, [comparacao, filtro, debouncedQ]);

  if (runs.length < 2) {
    return (
      <Card className="glass-card p-12 text-center">
        <GitCompare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-semibold">É preciso pelo menos duas rodagens para comparar.</h3>
        <p className="text-sm text-muted-foreground mt-1">Este módulo tem apenas uma rodagem registrada.</p>
      </Card>
    );
  }

  const resumoCards: { id: Filtro; label: string; valor: number; tom: string; dica: string }[] = comparacao
    ? [
        { id: "nova", label: "Novas", valor: comparacao.resumo.novas, tom: STATUS_META.nova.card, dica: "Falharam na mais recente e não na anterior." },
        { id: "persistente", label: "Persistentes", valor: comparacao.resumo.persistentes, tom: STATUS_META.persistente.card, dica: "Falharam nas duas rodagens." },
        { id: "resolvida", label: "Não falharam", valor: comparacao.resumo.resolvidas, tom: STATUS_META.resolvida.card, dica: "Falharam na anterior e não aparecem como falha na mais recente." },
        { id: "tipo_mudou", label: "Mudaram de tipo", valor: comparacao.resumo.tipoMudou, tom: "text-primary", dica: "Persistentes que mudaram de natureza (ex.: quebra virou diferença)." },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card className="glass-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <RunSelect label="De" value={deId} runs={runs} onChange={(id) => setRun("de", id)} />
          <ArrowRight className="hidden md:block h-4 w-4 mb-3 text-muted-foreground" />
          <RunSelect label="Para" value={paraId} runs={runs} onChange={(id) => setRun("para", id)} />
        </div>
        {antiga && recente && !mesmaRodagem && runDe?.id !== antiga.id && (
          <p className="text-xs text-muted-foreground">
            A comparação usa a ordem cronológica: de {formatDateTime(antiga.data_inicio_rodagem || antiga.data_analise)} para {formatDateTime(recente.data_inicio_rodagem || recente.data_analise)}.
          </p>
        )}
      </Card>

      {mesmaRodagem ? (
        <Card className="glass-card p-10 text-center text-sm text-muted-foreground">Escolha duas rodagens diferentes.</Card>
      ) : carregando || !comparacao ? (
        <Card className="glass-card p-10 text-center text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin inline mr-2" /> Comparando rodagens...
        </Card>
      ) : (
        <>
          {antiga && recente && executedCountsDiffer(antiga, recente) && (
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <span>
                As rodagens executaram quantidades diferentes de casos ({antiga.total_analisados} e {recente.total_analisados}).
                Casos em "Não falharam" podem simplesmente não ter sido executados na rodagem mais recente.
              </span>
            </div>
          )}

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {resumoCards.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.dica}
                onClick={() => setFiltro((atual) => (atual === c.id ? "todos" : c.id))}
                className={`text-left rounded-xl border p-4 transition-colors glass-card ${filtro === c.id ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/40"}`}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                <div className={`text-2xl font-bold font-mono mt-1 ${c.tom}`}>{c.valor}</div>
              </button>
            ))}
          </div>

          <Card className="glass-card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, nome do caso ou mensagem de erro..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
                className="bg-background flex-1 min-w-[220px] max-sm:min-w-0"
              />
              <span className="text-xs text-muted-foreground">
                {visiveis.length} de {comparacao.itens.length} casos
              </span>
              {filtro !== "todos" && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setFiltro("todos")}>Limpar filtro</Button>
              )}
            </div>
          </Card>

          {comparacao.itens.length === 0 ? (
            <Card className="glass-card p-10 text-center text-sm text-muted-foreground">Nenhuma das duas rodagens tem falhas.</Card>
          ) : visiveis.length === 0 ? (
            <Card className="glass-card p-10 text-center text-sm text-muted-foreground">Nenhum caso para o filtro aplicado.</Card>
          ) : (
            <Card className="glass-card divide-y divide-border/60 overflow-hidden">
              {visiveis.map((item) => (
                <CaseRow key={item.key} item={item} onOpenFailure={onOpenFailure} />
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function RunSelect({ label, value, runs, onChange }: { label: string; value: string | undefined; runs: Rodagem[]; onChange: (id: string) => void }) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-background max-sm:h-auto max-sm:min-h-10 max-sm:text-left max-sm:[&>span]:line-clamp-2" aria-label={`Rodagem ${label}`}>
          <SelectValue placeholder="Escolha a rodagem" />
        </SelectTrigger>
        <SelectContent className="max-sm:max-w-[var(--radix-select-trigger-width)]">
          {runs.map((r) => (
            <SelectItem key={r.id} value={r.id} className="max-sm:whitespace-normal">{runLabel(r)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CaseRow({ item, onOpenFailure }: { item: CaseComparison; onOpenFailure: (f: Falha) => void }) {
  const meta = STATUS_META[item.status];
  // Detalhes: a falha da rodagem mais recente; para "Nao falhou", a da anterior.
  const referencia = item.depois[0] || item.antes[0];
  const resumo = referencia ? failureDescription(referencia) : "";
  const ocorrencias = Math.max(item.antes.length, item.depois.length);

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 hover:bg-secondary/40 cursor-pointer md:flex-row md:items-center md:gap-4"
      role="button"
      tabIndex={0}
      onClick={() => referencia && onOpenFailure(referencia)}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && referencia) { e.preventDefault(); onOpenFailure(referencia); } }}
    >
      <div className="flex items-center gap-2 shrink-0 md:w-56">
        <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${meta.badge}`}>{meta.label}</Badge>
        {item.caseId && <Badge variant="outline" className="font-mono text-[11px]">#{item.caseId}</Badge>}
        {ocorrencias > 1 && <span className="text-[10px] text-muted-foreground">{ocorrencias}x</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{item.nome || "Caso sem nome no MDS"}</div>
        {/* Sem mensagem de erro, a descricao cai no proprio nome do caso: nao repete. */}
        {resumo && resumo !== item.nome && <div className="text-xs text-muted-foreground line-clamp-1">{resumo}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {item.tipoAntes ? <TipoBadge tipo={item.tipoAntes} /> : <span className="text-[10px] text-muted-foreground">sem falha</span>}
        <ArrowRight className={`h-3 w-3 ${item.tipoMudou ? "text-primary" : "text-muted-foreground"}`} />
        {item.tipoDepois ? <TipoBadge tipo={item.tipoDepois} /> : <span className="text-[10px] text-muted-foreground">sem falha</span>}
      </div>
    </div>
  );
}
