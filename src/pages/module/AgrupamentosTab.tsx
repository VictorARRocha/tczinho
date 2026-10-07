// Aba Agrupamentos: grupos da IA (ou agrupamento local) e painel de agrupamento por IA.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useEffect, useMemo, useState } from "react";
import type { Falha, Agrupamento } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <AiGroupingPanel runId={runId} onReload={onReload} onGroupedChange={setAiGrouped} />

      {!aiGrouped ? (
        <Empty text="Clique em 'Agrupar falhas' para que a IA agrupe as falhas desta rodagem." />
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

function AiGroupingPanel({ runId, onReload, onGroupedChange }: { runId: string; onReload: () => void | Promise<void>; onGroupedChange?: (grouped: boolean) => void }) {
  const [status, setStatus] = useState<import("@/services/aiGrouping").AiGroupStatus | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => { onGroupedChange?.(grouped); }, [grouped, onGroupedChange]);

  const refreshStatus = async () => {
    try {
      setLoadingStatus(true);
      const { fetchAiGroupStatus } = await import("@/services/aiGrouping");
      const s = await fetchAiGroupStatus(runId);
      setStatus(s.status);
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

  let label = "Agrupar falhas";
  let disabled = false;
  if (loadingStatus) { label = "Carregando..."; disabled = true; }
  else if (grouped) { label = "Falhas agrupadas"; disabled = true; }
  else if (running) { label = "Agrupando..."; disabled = true; }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">Agrupamento por IA</p>
        {errorMsg && <p className="text-xs text-destructive mt-0.5 truncate" title={errorMsg}>{errorMsg}</p>}
        {!errorMsg && grouped && <p className="text-xs text-muted-foreground mt-0.5">As falhas desta rodagem já foram agrupadas.</p>}
        {!errorMsg && !grouped && !running && <p className="text-xs text-muted-foreground mt-0.5">Junta as falhas parecidas para você analisar cada problema uma vez só.</p>}
        {!errorMsg && running && <p className="text-xs text-muted-foreground mt-0.5">Agrupando as falhas. Isso pode levar alguns instantes.</p>}
      </div>
      <Button size="sm" onClick={handleClick} disabled={disabled}>
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
      className="glass-card p-4 sm:p-5 cursor-pointer hover:bg-secondary/20 transition-smooth"
      onClick={() => g.casos.length > 0 && setOpen((v) => !v)}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{displayTitulo}</h3>
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

function GroupCasesList({ casos, onSelect, open, setOpen }: { casos: Falha[]; onSelect: (f: Falha) => void; open: boolean; setOpen: (v: boolean | ((p: boolean) => boolean)) => void }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Casos vinculados a esta quebra ({casos.length})
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar casos" : "Ver casos"}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          {casos.map((f) => {
            const nome = f.caso_teste_provavel || f.erro_titulo || "Caso";
            const idCaso = f.id_caso_teste || "";
            return (
              <div
                key={f.id}
                className="rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-smooth p-3 cursor-pointer"
                onClick={() => onSelect(f)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {idCaso ? `[${idCaso}] ` : ""}{nome}
                    </div>
                    {f.grupo && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {f.grupo}{f.subgrupo ? ` / ${f.subgrupo}` : ""}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSelect(f); }}>Ver detalhe</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
