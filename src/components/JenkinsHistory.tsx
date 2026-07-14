import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, ExternalLink, RefreshCw, AlertTriangle, Info, XCircle } from "lucide-react";
import { fetchRerunRequests, cancelRerunRequest, subscribeToTable, type RerunRequest } from "@/services/data";

// ---------- Status mapping ----------
type StatusKey =
  | "solicitado" | "processando" | "enviado_jenkins" | "na_fila" | "rodando"
  | "finalizado_sucesso" | "finalizado_falha" | "cancelado"
  | "cancel_requested" | "cancelando"
  | "erro_envio" | "erro_monitoramento" | "erro";

const STATUS_META: Record<string, { label: string; badge: string; bar: string; animated?: boolean }> = {
  solicitado:         { label: "Solicitado",            badge: "bg-muted text-muted-foreground border-border",                 bar: "bg-muted-foreground/40" },
  processando:        { label: "Processando",           badge: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",       bar: "bg-yellow-500", animated: true },
  enviado_jenkins:    { label: "Enviado ao Jenkins",    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",             bar: "bg-blue-500" },
  na_fila:            { label: "Na fila",               badge: "bg-sky-500/15 text-sky-400 border-sky-500/30",                bar: "bg-sky-400" },
  rodando:            { label: "Rodando",               badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",       bar: "bg-purple-500", animated: true },
  finalizado_sucesso: { label: "Finalizado",            badge: "bg-green-500/15 text-green-500 border-green-500/30",          bar: "bg-green-500" },
  finalizado_falha:   { label: "Falhou",                badge: "bg-red-500/15 text-red-500 border-red-500/30",                bar: "bg-red-500" },
  cancelado:          { label: "Cancelado",             badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",       bar: "bg-orange-500" },
  cancel_requested:   { label: "Cancelamento solicitado", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",         bar: "bg-amber-500", animated: true },
  cancelando:         { label: "Cancelando",             badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",      bar: "bg-orange-500", animated: true },
  erro_envio:         { label: "Erro no envio",         badge: "bg-red-500/15 text-red-500 border-red-500/30",                bar: "bg-red-500" },
  erro_monitoramento: { label: "Erro no monitoramento", badge: "bg-red-500/15 text-red-500 border-red-500/30",                bar: "bg-red-500" },
  erro:               { label: "Erro",                  badge: "bg-red-500/15 text-red-500 border-red-500/30",                bar: "bg-red-500" },
};

const TIPO_LABEL: Record<string, string> = {
  rodagem_completa: "Rodagem completa",
  reexecucao: "Reexecução",
};
const MODO_LABEL: Record<string, string> = {
  simplificada: "Simplificada",
  configurada: "Configurada",
  casos_quebrados: "Casos quebrados",
};

const ACTIVE_STATUSES = new Set<string>([
  "solicitado", "processando", "enviado_jenkins", "na_fila", "rodando", "erro_monitoramento",
  "cancel_requested", "cancelando",
]);

const CANCELABLE_STATUSES = new Set<string>([
  "solicitado", "processando", "enviado_jenkins", "na_fila", "rodando", "erro_monitoramento",
]);

const CANCEL_PENDING_STATUSES = new Set<string>(["cancel_requested", "cancelando"]);

function resolveStatus(r: RerunRequest): StatusKey {
  const raw = (r.execution_status || r.status || "solicitado").toString().toLowerCase().trim();
  if (STATUS_META[raw]) return raw as StatusKey;
  // fallback antigos
  if (raw === "erro") return "erro";
  return (raw as StatusKey);
}

function resolveProgress(r: RerunRequest, status: StatusKey): { value: number; indeterminate: boolean } {
  const raw = r.progress_percent;
  const hasReal = raw !== null && raw !== undefined && !Number.isNaN(Number(raw));
  const value = hasReal ? Math.max(0, Math.min(100, Number(raw))) : NaN;
  switch (status) {
    case "solicitado":          return { value: 0, indeterminate: false };
    case "processando":         return { value: hasReal ? value : 1, indeterminate: !hasReal };
    case "enviado_jenkins":     return { value: hasReal ? value : 5, indeterminate: false };
    case "na_fila":             return { value: hasReal ? value : 10, indeterminate: false };
    case "rodando":             return { value: hasReal ? value : 50, indeterminate: !hasReal };
    case "cancel_requested":    return { value: hasReal ? value : 0, indeterminate: !hasReal };
    case "cancelando":          return { value: hasReal ? value : 0, indeterminate: !hasReal };
    case "finalizado_sucesso":
    case "finalizado_falha":
    case "cancelado":
    case "erro_envio":
    case "erro_monitoramento":
    case "erro":
      return { value: 100, indeterminate: false };
    default:
      return { value: hasReal ? value : 0, indeterminate: false };
  }
}

function ProgressBar({ value, color, indeterminate }: { value: number; color: string; indeterminate?: boolean }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary/60">
      {indeterminate ? (
        <div className={`absolute inset-y-0 w-1/3 ${color} animate-[progress-indeterminate_1.4s_ease-in-out_infinite]`} />
      ) : (
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      )}
    </div>
  );
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}min ${rs}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}

function safeError(s?: string | null): string | null {
  if (!s) return null;
  // Não expor tokens/secrets
  return s.replace(/(authorization|apikey|service[_-]?role|bearer\s+\S+|token=\S+)/gi, "[redacted]");
}

export function JenkinsHistory({ title = "Histórico Jenkins", limit = 50 }: { title?: string; limit?: number }) {
  const [history, setHistory] = useState<RerunRequest[]>([]);
  const [detail, setDetail] = useState<RerunRequest | null>(null);
  const pollingRef = useRef<number | null>(null);

  const load = async () => setHistory(await fetchRerunRequests(limit));

  const hasActive = useMemo(
    () => history.some((r) => ACTIVE_STATUSES.has(resolveStatus(r))),
    [history],
  );

  // realtime + carga inicial
  useEffect(() => {
    load();
    const off = subscribeToTable("rerun_requests", () => load());
    return () => { off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polling apenas quando há registros ativos
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (!hasActive) return;
    pollingRef.current = window.setInterval(() => load(), 10000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  return (
    <TooltipProvider delayDuration={150}>
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          {hasActive && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">
              Atualizando ao vivo
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
        </Button>
      </div>
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>

          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>VM</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Casos</TableHead>
              <TableHead>Agendado</TableHead>
              <TableHead>Status da rodagem</TableHead>
              <TableHead className="min-w-[180px]">Progresso</TableHead>
              <TableHead className="w-32 text-center">Cancelar</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhuma solicitação ainda.</TableCell></TableRow>
            ) : history.map((r) => {
              const status = resolveStatus(r);
              const meta = STATUS_META[status] || { label: status, badge: "", bar: "bg-muted-foreground/40" };
              const prog = resolveProgress(r, status);
              const buildUrl = r.build_url || null;
              const monErr = safeError(r.monitor_error);
              const subErr = safeError(r.erro);
              const errText = monErr || subErr;
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-xs">{TIPO_LABEL[r.tipo_solicitacao || ""] || r.tipo_solicitacao || "—"}</TableCell>
                  <TableCell className="text-xs">{MODO_LABEL[r.modo_configuracao || ""] || r.modo_configuracao || "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.vm_name}</TableCell>
                  <TableCell className="text-xs">{r.versao}</TableCell>
                  <TableCell className="text-xs">{r.modulo_nome || r.modulo_codigo || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate" title={r.casos_teste}>{r.casos_teste}</TableCell>
                  <TableCell className="text-xs font-mono">{r.data_hora || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <ProgressBar value={prog.value} color={meta.bar} indeterminate={prog.indeterminate || meta.animated && status === "rodando" && prog.indeterminate} />
                      <div className="text-[10px] text-muted-foreground">
                        {meta.label}{prog.indeterminate ? " — em andamento" : ` — ${Math.round(prog.value)}%`}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {CANCELABLE_STATUSES.has(status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm("Cancelar esta rodagem Jenkins?")) return;
                          try {
                            await cancelRerunRequest(r.id, "Cancelamento solicitado pelo dashboard.");
                            toast.success("Cancelamento solicitado", {
                              description: "O Bridge irá confirmar o cancelamento no Jenkins.",
                            });
                            load();
                          } catch (err) {
                            console.error(err);
                            toast.error("Falha ao solicitar cancelamento");
                          }
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar
                      </Button>
                    ) : CANCEL_PENDING_STATUSES.has(status) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                        <XCircle className="h-3.5 w-3.5" /> Cancelando…
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Detalhes</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
                            toast.success("CONFIG_JSON copiado");
                          }}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copiar CONFIG_JSON</TooltipContent>
                      </Tooltip>
                      {buildUrl && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={buildUrl} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Abrir build</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
        </div>
      </Card>


      <DetailDialog request={detail} onClose={() => setDetail(null)} />
    </TooltipProvider>
  );
}

function FragmentRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </>
  );
}

function DetailDialog({ request, onClose }: { request: RerunRequest | null; onClose: () => void }) {
  const r = request;
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da solicitação</DialogTitle>
          <DialogDescription>Dados completos lidos do Supabase.</DialogDescription>
        </DialogHeader>
        {r && (() => {
          const status = resolveStatus(r);
          const meta = STATUS_META[status] || { label: status, badge: "" };
          const monErr = safeError(r.monitor_error);
          const subErr = safeError(r.erro);
          const rows: [string, React.ReactNode][] = [
            ["ID da solicitação", <span className="font-mono text-xs">{r.id}</span>],
            ["Data de criação", new Date(r.created_at).toLocaleString("pt-BR")],
            ["Tipo", TIPO_LABEL[r.tipo_solicitacao || ""] || r.tipo_solicitacao || "—"],
            ["Modo", MODO_LABEL[r.modo_configuracao || ""] || r.modo_configuracao || "—"],
            ["VM", r.vm_name || "—"],
            ["Versão", r.versao || "—"],
            ["Módulo", r.modulo_nome || r.modulo_codigo || "—"],
            ["Casos", <span className="font-mono text-xs break-all">{r.casos_teste || "—"}</span>],
            ["Agendado", r.data_hora || "—"],
            ["Status operacional", <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>],
            ["Resultado Jenkins", r.execution_result || "—"],
            ["Build number", r.build_number ? String(r.build_number) : (r.jenkins_build_number || "—")],
            ["Build URL", r.build_url ? (
              <a href={r.build_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                {r.build_url} <ExternalLink className="h-3 w-3" />
              </a>
            ) : "—"],
            ["Início da execução", r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"],
            ["Fim da execução", r.finished_at ? new Date(r.finished_at).toLocaleString("pt-BR") : "—"],
            ["Duração", formatDuration(r.duration_ms)],
            ["Duração estimada", formatDuration(r.estimated_duration_ms)],
            ["Última checagem", r.last_checked_at ? new Date(r.last_checked_at).toLocaleString("pt-BR") : "—"],
            ["Erro", subErr || "—"],
            ["Monitor error", monErr || "—"],
          ];
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
                {rows.map(([k, v], i) => (
                  <FragmentRow key={i} label={k as string} value={v} />
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Config JSON</div>
                <pre className="text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto">
{JSON.stringify(r.config_json, null, 2)}
                </pre>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
