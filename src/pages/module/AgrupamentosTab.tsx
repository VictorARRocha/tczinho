// Aba Agrupamentos: grupos da IA (ou agrupamento local) e painel de agrupamento por IA.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Falha, Agrupamento } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, RefreshCw } from "lucide-react";
import { SeverityBadge } from "@/components/Badges";
import { toast } from "sonner";
import { fixMojibake } from "./caseText";
import { Empty } from "./common";

/** Agrupamento ja resolvido para exibicao (grupo da IA ou agrupamento local por campo). */
export type AgrupamentoCardItem = {
  id: string;
  titulo: string;
  tipo: string | null;
  descricao: string | null;
  quantidade: number;
  classificacao_predominante: string | null;
  severidade_predominante: string | null;
  acao_recomendada: string | null;
  casos: Falha[];
  semVinculo?: boolean;
  isVisual?: boolean;
};

export function AgrupamentosTab({ runId, grupos, falhas, links, onSelect, onReload }: { runId: string; grupos: Agrupamento[]; falhas: Falha[]; links: Record<string, string[]>; onSelect: (f: Falha) => void; onReload: () => void | Promise<void> }) {
  const indices = useMemo(() => {
    const byId = new Map<string, Falha>();
    const byCaso = new Map<string, Falha[]>();
    const byZip = new Map<string, Falha>();
    falhas.forEach((f) => {
      if (f.id) byId.set(String(f.id).toLowerCase(), f);
      if (f.id_caso_teste) {
        const k = String(f.id_caso_teste).toLowerCase();
        const arr = byCaso.get(k) || [];
        arr.push(f);
        byCaso.set(k, arr);
      }
      if (f.arquivo_zip) byZip.set(String(f.arquivo_zip).toLowerCase(), f);
    });
    return { byId, byCaso, byZip };
  }, [falhas]);

  const resolveCasos = (rel: unknown): Falha[] => {
    if (!Array.isArray(rel)) return [];
    const out: Falha[] = [];
    const seen = new Set<string>();
    rel.forEach((r) => {
      const k = String(r ?? "").toLowerCase().trim();
      if (!k) return;
      const matches: Falha[] = [];
      const a = indices.byId.get(k); if (a) matches.push(a);
      const b = indices.byCaso.get(k); if (b) matches.push(...b);
      const c = indices.byZip.get(k); if (c) matches.push(c);
      matches.forEach((m) => { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } });
    });
    return out;
  };

  type Item = AgrupamentoCardItem;

  const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const items: Item[] = useMemo(() => {
    if (grupos.length > 0) {
      return grupos.map((g) => {
        // FONTE PRIMÁRIA: agrupamentos_falhas (com fallback fk_cluster no service)
        const linkedIds = links[String(g.id)] || [];
        let casos = resolveCasos(linkedIds);

        // FALLBACK: arquivos_relacionados
        let semVinculo = false;
        if (casos.length === 0) {
          const rel = Array.isArray(g.arquivos_relacionados)
            ? g.arquivos_relacionados.map((x: unknown) => String(x)).filter(Boolean)
            : [];
          casos = resolveCasos(rel);
          if (casos.length === 0) semVinculo = true;
        }

        const cls = new Map<string, number>(); const sevs = new Map<string, number>();
        casos.forEach((f) => {
          if (f.classificacao) cls.set(f.classificacao, (cls.get(f.classificacao) || 0) + 1);
          if (f.severidade) sevs.set(f.severidade, (sevs.get(f.severidade) || 0) + 1);
        });
        const quantidade = casos.length || (typeof g.quantidade === "number" && g.quantidade > 0 ? g.quantidade : 0);
        return {
          id: g.id,
          titulo: g.titulo || "Agrupamento",
          tipo: g.tipo,
          descricao: g.descricao,
          quantidade,
          classificacao_predominante: g.classificacao_predominante || top(cls),
          severidade_predominante: g.severidade_predominante || top(sevs),
          acao_recomendada: g.acao_recomendada,
          casos,
          semVinculo,
        };
      });
    }
    // Sem agrupamentos no DB: gera direto a partir das falhas
    const agg = new Map<string, { titulo: string; tipo: string; casos: Falha[]; classes: Map<string, number>; sevs: Map<string, number> }>();
    falhas.forEach((f) => {
      const key = f.grupo || f.classificacao || f.severidade || f.rotina_funcional || "Outros";
      const tipo = f.grupo ? "Grupo" : f.classificacao ? "Classificação" : f.severidade ? "Severidade" : f.rotina_funcional ? "Rotina funcional" : "Outros";
      const cur = agg.get(key) || { titulo: key, tipo, casos: [] as Falha[], classes: new Map<string, number>(), sevs: new Map<string, number>() };
      cur.casos.push(f);
      if (f.classificacao) cur.classes.set(f.classificacao, (cur.classes.get(f.classificacao) || 0) + 1);
      if (f.severidade) cur.sevs.set(f.severidade, (cur.sevs.get(f.severidade) || 0) + 1);
      agg.set(key, cur);
    });
    return Array.from(agg.values())
      .sort((a, b) => b.casos.length - a.casos.length)
      .map((g) => ({
        id: g.titulo,
        titulo: g.titulo,
        tipo: g.tipo,
        descricao: null,
        quantidade: g.casos.length,
        classificacao_predominante: top(g.classes),
        severidade_predominante: top(g.sevs),
        acao_recomendada: null,
        casos: g.casos,
        isVisual: true,
      }));
  }, [grupos, falhas, links, indices]);

  const filteredItems = useMemo(() => items.filter((g) => g.quantidade > 1), [items]);

  const [aiGrouped, setAiGrouped] = useState(false);
  const [aiError, setAiError] = useState(false);

  return (
    <div className="space-y-4">
      <AiGroupingPanel runId={runId} onReload={onReload} onGroupedChange={setAiGrouped} onErrorChange={setAiError} />

      {!aiGrouped ? (
        aiError ? null : <Empty text="Use “Agrupar falhas” para a IA juntar as falhas parecidas desta rodagem." />
      ) : filteredItems.length === 0 ? (
        <Empty text="Sem agrupamentos com múltiplos casos." />
      ) : (
        <>
          {filteredItems.map((g) => (
            <AgrupamentoCard key={g.id} g={g} onSelect={onSelect} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Erro do agrupamento em linguagem de gente. O texto cru do provedor (ex.: "Gemini HTTP 503: [{...}]")
 * fica so nos detalhes tecnicos.
 */
export function mensagemErroIa(raw: string): string {
  const t = raw.toLowerCase();
  if (/\b503\b|high demand|overload|unavailable|sobrecarreg/.test(t)) return "O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.";
  if (/\b429\b|quota|rate limit|resource_exhausted/.test(t)) return "O limite de uso da IA foi atingido. Tente de novo mais tarde.";
  if (/\b40[13]\b|api key|permission|unauthori/.test(t)) return "A IA está sem acesso configurado. Avise a equipe de automação.";
  if (/timeout|timed out|deadline/.test(t)) return "A IA demorou demais para responder. Tente de novo.";
  // Mensagem ja amigavel (vinda da propria tela) passa direto; texto tecnico vira generico.
  if (/[{}[\]]|http|error|exception/i.test(raw)) return "Não foi possível agrupar as falhas da última vez. Tente de novo.";
  return raw;
}

function AiGroupingPanel({ runId, onReload, onGroupedChange, onErrorChange }: { runId: string; onReload: () => void | Promise<void>; onGroupedChange?: (grouped: boolean) => void; onErrorChange?: (hasError: boolean) => void }) {
  const [status, setStatus] = useState<import("@/services/aiGrouping").AiGroupStatus | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const statusAnterior = useRef<string | null>(null);

  useEffect(() => { onGroupedChange?.(grouped); }, [grouped, onGroupedChange]);
  useEffect(() => { onErrorChange?.(!!errorMsg); }, [errorMsg, onErrorChange]);

  // silencioso: a consulta periodica nao troca o botao para "Carregando...".
  const refreshStatus = async (silencioso = false) => {
    try {
      if (!silencioso) setLoadingStatus(true);
      const { fetchAiGroupStatus } = await import("@/services/aiGrouping");
      const s = await fetchAiGroupStatus(runId);
      const anterior = statusAnterior.current;
      statusAnterior.current = s.status;
      setStatus(s.status);
      // Terminou enquanto a tela estava aberta (pedido por outra pessoa ou antes de recarregar): traz os grupos.
      if (anterior === "running" && s.status === "completed") await onReload();
      setGrouped(s.grouped === true || s.status === "completed");
      if ((s.status === "failed" || s.status === "invalid_response") && s.error_message) setErrorMsg(s.error_message);
      else setErrorMsg(null);
    } catch (e) {
      // Falha ao consultar status não deve quebrar a tela
      setStatus(null);
      setGrouped(false);
      setErrorMsg(null);
      console.warn("[ai-group-status]", (e as Error)?.message || e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!runId) return;
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Agrupamento ja em andamento ao abrir a aba: consulta de novo a cada 5s ate terminar.
  useEffect(() => {
    if (status !== "running" || submitting) return;
    const t = window.setInterval(() => { void refreshStatus(true); }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, submitting, runId]);


  const running = status === "running" || submitting;

  const handleClick = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { requestAiGrouping } = await import("@/services/aiGrouping");
      await requestAiGrouping(runId, false);
      await onReload();
      await refreshStatus();
      toast.success("Falhas agrupadas pela IA");
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const code = (e as { code?: string })?.code;
      if (status === 401) {
        setErrorMsg("Sessão expirada ou sem permissão. Faça login novamente.");
      } else if (status === 409 && code === "already_grouped") {
        await onReload();
        await refreshStatus();
      } else if (status === 409 && code === "already_processing") {
        setErrorMsg("Agrupamento já está em andamento.");
        await refreshStatus();
      } else if (status === 503 && (code === "ai_provider_not_configured" || code === "openai_not_configured")) {
        setErrorMsg("O agrupamento por IA não está disponível no momento. Avise a equipe de automação.");
      } else if (status === 422 || code === "invalid_ai_response") {
        setErrorMsg("Não foi possível agrupar as falhas agora. Tente novamente.");
      } else {
        setErrorMsg((e as Error)?.message || "Não foi possível solicitar o agrupamento.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  let label = errorMsg ? "Tentar de novo" : "Agrupar falhas";
  let disabled = false;
  if (loadingStatus) { label = "Carregando..."; disabled = true; }
  else if (grouped) { label = "Falhas agrupadas"; disabled = true; }
  else if (running) { label = "Agrupando..."; disabled = true; }
  const erroAmigavel = errorMsg ? mensagemErroIa(errorMsg) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Agrupamento por IA</p>
        <div aria-live="polite">
        {erroAmigavel && (
          <div className="mt-0.5 text-sm text-destructive">
            <p>{erroAmigavel}</p>
            {erroAmigavel !== errorMsg && (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">Detalhes técnicos</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono">{errorMsg}</pre>
              </details>
            )}
          </div>
        )}
        {!errorMsg && grouped && <p className="text-xs text-muted-foreground mt-0.5">As falhas desta rodagem já foram agrupadas.</p>}
        {!errorMsg && !grouped && !running && <p className="text-xs text-muted-foreground mt-0.5">Junta as falhas parecidas para você analisar cada problema uma vez só.</p>}
        {!errorMsg && running && <p className="text-xs text-muted-foreground mt-0.5">Agrupando as falhas. Isso pode levar alguns instantes.</p>}
        </div>
      </div>
      <Button size="sm" onClick={handleClick} disabled={disabled} className="shrink-0 max-sm:w-full">
        {running && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

function AgrupamentoCard({ g, onSelect }: { g: AgrupamentoCardItem; onSelect: (f: Falha) => void }) {
  const [open, setOpen] = useState(false);
  const rawTitulo = fixMojibake(g.titulo || "");
  const rawDescricao = fixMojibake(g.descricao || "");
  const tituloParecePlaceholder = /informacaoerro/i.test(rawTitulo) || /^erro t[eé]cnico/i.test(rawTitulo);
  const displayTitulo = tituloParecePlaceholder && rawDescricao ? rawDescricao : rawTitulo;
  const displayDescricao = tituloParecePlaceholder && rawDescricao ? "" : rawDescricao;
  const acao = fixMojibake(g.acao_recomendada || "");

  return (
    <Card
      className="p-4 sm:p-5 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => g.casos.length > 0 && setOpen((v) => !v)}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{displayTitulo}</h2>
        </div>
        <Badge variant="outline" className="font-mono shrink-0">×{g.quantidade}</Badge>
      </div>
      {displayDescricao && <p className="text-sm text-muted-foreground mb-3">{displayDescricao}</p>}
      <div className="flex flex-wrap gap-2 mb-4">
        {g.severidade_predominante && <SeverityBadge value={g.severidade_predominante} />}
      </div>
      {acao && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs mb-4">
          {acao}
        </div>
      )}

      {g.casos.length > 0 ? (
        <GroupCasesList casos={g.casos} onSelect={onSelect} open={open} setOpen={setOpen} />
      ) : g.semVinculo ? (
        <p className="text-xs text-muted-foreground italic">
          Os casos deste grupo ainda não foram vinculados.
        </p>
      ) : null}
    </Card>
  );
}

const CASOS_POR_VEZ = 20;

function GroupCasesList({ casos, onSelect, open, setOpen }: { casos: Falha[]; onSelect: (f: Falha) => void; open: boolean; setOpen: (v: boolean | ((p: boolean) => boolean)) => void }) {
  const [mostrando, setMostrando] = useState(CASOS_POR_VEZ);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Casos neste grupo <span className="font-mono">{casos.length}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-11 md:h-9" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar casos" : "Ver casos"}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          {casos.slice(0, mostrando).map((f) => {
            const nome = f.caso_teste_provavel || f.erro_titulo || "Caso";
            const idCaso = f.id_caso_teste || "";
            const titulo = `${idCaso ? `[${idCaso}] ` : ""}${nome}`;
            return (
              <button
                key={f.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-secondary/40 p-3 text-left transition-[background-color,transform] duration-150 ease-out-strong hover:bg-secondary/70 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelect(f)}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate" title={titulo}>{titulo}</span>
                  {f.grupo && (
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      {f.grupo}{f.subgrupo ? ` / ${f.subgrupo}` : ""}
                    </span>
                  )}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
                  Ver detalhe <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            );
          })}
          {casos.length > mostrando && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setMostrando((n) => n + CASOS_POR_VEZ)}>
              Mostrar mais {Math.min(CASOS_POR_VEZ, casos.length - mostrando)} de {casos.length - mostrando}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
