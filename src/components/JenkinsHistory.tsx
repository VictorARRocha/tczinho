import { memo, useId, useMemo, useState } from "react";
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
import { Copy, ExternalLink, ChevronDown, Info, XCircle } from "lucide-react";
import { cancelRerunRequest, type RerunRequest } from "@/services/data";
import { invalidateRerunRequests, useRerunRequests } from "@/services/queries";
import { hasActiveRerun } from "@/lib/rerunStatus";
import { metaDoStatus, statusDoPedido } from "@/lib/statusPedido";
import { Paginacao } from "@/pages/module/common";
import { ConfirmarAcao } from "@/components/ConfirmarAcao";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissao } from "@/hooks/use-permissao";
import { useAuth } from "@/contexts/AuthContext";
import { mensagemDaApi } from "@/lib/apiErro";
import { modulosDosCasos, podeNoModulo } from "@/lib/permissoes";
import { cn } from "@/lib/utils";

/** Pedidos por pagina nos historicos do Jenkins. */
export const HISTORICO_POR_PAGINA = 10;

const TIPO_LABEL: Record<string, string> = {
  rodagem_completa: "Rodagem completa",
  reexecucao: "Reexecução",
};
const MODO_LABEL: Record<string, string> = {
  simplificada: "Simplificada",
  configurada: "Configurada",
  casos_quebrados: "Casos quebrados",
};

const CANCELABLE_STATUSES = new Set<string>([
  "solicitado", "processando", "enviado_jenkins", "na_fila", "rodando", "erro_monitoramento",
]);

const CANCEL_PENDING_STATUSES = new Set<string>(["cancel_requested", "cancelando"]);

function resolveProgress(r: RerunRequest, status: string): { value: number; indeterminate: boolean } {
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
    case "finalizado_ocorrencias":
    case "cancelado":
    case "erro_envio":
    case "erro_monitoramento":
    case "erro":
      return { value: 100, indeterminate: false };
    default:
      return { value: hasReal ? value : 0, indeterminate: false };
  }
}

/** Barra com papel e valor para o leitor de tela; "em andamento" sem valor conhecido. */
function ProgressBar({ value, color, indeterminate, rotulo }: { value: number; color: string; indeterminate?: boolean; rotulo: string }) {
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuetext={indeterminate ? "em andamento" : undefined}
      className="relative h-2 w-full overflow-hidden rounded-full bg-secondary/60"
    >
      {indeterminate ? (
        <div className={`absolute inset-y-0 w-1/3 ${color} animate-progresso-indeterminado`} />
      ) : (
        <div
          className={`h-full ${color} transition-[width] duration-300 ease-out-strong`}
          style={{ width: `${value}%` }}
        />
      )}
    </div>
  );
}

function Progresso({ r, status }: { r: RerunRequest; status: string }) {
  const meta = metaDoStatus(status);
  const prog = resolveProgress(r, status);
  return (
    <div className="flex flex-col gap-1">
      <ProgressBar value={prog.value} color={meta.barra} indeterminate={prog.indeterminate} rotulo={`Progresso: ${meta.label}`} />
      <div className="text-[10px] text-muted-foreground" aria-hidden>
        {meta.label}{prog.indeterminate ? " — em andamento" : ` — ${Math.round(prog.value)}%`}
      </div>
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

function copiarConfig(r: RerunRequest) {
  navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
  toast.success("Configuração copiada");
}

function SeloStatus({ status }: { status: string }) {
  const meta = metaDoStatus(status);
  return <Badge variant="outline" className={meta.selo}>{meta.label}</Badge>;
}

/** Status que ainda andam: mostram a barra de progresso; os encerrados mostram so o selo. */
const EM_ANDAMENTO = new Set<string>(["solicitado", "processando", "enviado_jenkins", "na_fila", "rodando", "cancel_requested", "cancelando"]);

function StatusOuProgresso({ r, status }: { r: RerunRequest; status: string }) {
  return EM_ANDAMENTO.has(status) ? <Progresso r={r} status={status} /> : <SeloStatus status={status} />;
}

const CANCELANDO = (
  <span className="inline-flex items-center gap-1 text-[11px] text-warning">
    <XCircle className="h-3.5 w-3.5" aria-hidden /> Cancelando…
  </span>
);

// memo: a tabela (ate `limit` linhas com tooltips) nao re-renderiza a cada tecla
// digitada no formulario da pagina; so quando os dados ou o estado dela mudam.
// `filtro` tem que ser estavel (funcao de fora do componente) para o memo valer.
export const JenkinsHistory = memo(function JenkinsHistory({
  title = "Histórico Jenkins",
  limit = 50,
  defaultExpanded = false,
  filtro,
}: { title?: string; limit?: number; defaultExpanded?: boolean; filtro?: (r: RerunRequest) => boolean }) {
  // Consulta compartilhada: atualiza a cada 10s com pedido ativo, senao a cada minuto.
  const { data } = useRerunRequests(limit);
  // A API pode devolver mais que o pedido; a tela mostra no maximo `limit`.
  // Cada um ve os pedidos dos seus modulos (pedido so com rotinas gerais [0.x] aparece para todos).
  const { profile, isAdmin } = useAuth();
  const history = useMemo(
    () => (data || [])
      .filter((r) => modulosDosCasos(r.casos_teste).every((slug) => podeNoModulo(profile, isAdmin, slug)))
      .filter((r) => !filtro || filtro(r))
      .slice(0, limit),
    [data, limit, profile, isAdmin, filtro],
  );
  const hasActive = hasActiveRerun(history);
  const [page, setPage] = useState(1);
  const paginaAtual = Math.min(page, Math.max(1, Math.ceil(history.length / HISTORICO_POR_PAGINA)));
  const pedidosDaPagina = history.slice((paginaAtual - 1) * HISTORICO_POR_PAGINA, paginaAtual * HISTORICO_POR_PAGINA);
  const [detail, setDetail] = useState<RerunRequest | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [paraCancelar, setParaCancelar] = useState<RerunRequest | null>(null);
  const [cancelandoAgora, setCancelandoAgora] = useState(false);
  const isMobile = useIsMobile();
  const conteudoId = useId();
  // Cancelar uma rodagem exige a mesma permissao de pedir.
  const podeCancelar = usePermissao("rodagem");

  const cancelar = async () => {
    if (!paraCancelar) return;
    setCancelandoAgora(true);
    try {
      await cancelRerunRequest(paraCancelar.id, "Cancelamento solicitado pelo dashboard.");
      toast.success("Cancelamento pedido", { description: "O Jenkins confirma em instantes." });
      invalidateRerunRequests();
      setParaCancelar(null);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível cancelar", { description: mensagemDaApi(err) });
    } finally {
      setCancelandoAgora(false);
    }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          {hasActive && (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
              Atualizando ao vivo
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-11 md:h-9"
          aria-expanded={expanded}
          aria-controls={conteudoId}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform duration-200 ease-out-strong", expanded && "rotate-180")} aria-hidden />
          {expanded ? "Minimizar" : "Expandir"}
        </Button>
      </div>
      <div id={conteudoId}>
      {expanded && isMobile && (
        <Card className="glass-card overflow-hidden">
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma solicitação ainda.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {pedidosDaPagina.map((r) => {
                const status = statusDoPedido(r);
                const erro = safeError(r.erro);
                return (
                  <li key={r.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-mono">{r.vm_name}</span> · {r.versao} · {r.modulo_nome || r.modulo_codigo || "—"}
                    </p>
                    {r.casos_teste && <p className="break-all text-[11px] text-muted-foreground">Casos: {r.casos_teste}</p>}
                    {r.data_hora && <p className="text-[11px] text-muted-foreground">Agendado: <span className="font-mono">{r.data_hora}</span></p>}
                    {erro && <p className="break-words text-[11px] text-destructive">{erro}</p>}
                    <StatusOuProgresso r={r} status={status} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-11 flex-1" onClick={() => setDetail(r)}>
                        <Info className="h-3.5 w-3.5 mr-1" aria-hidden /> Detalhes
                      </Button>
                      {r.build_url && (
                        <Button size="sm" variant="outline" className="h-11 flex-1" asChild>
                          <a href={r.build_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" aria-hidden /> Build
                          </a>
                        </Button>
                      )}
                      {podeCancelar && CANCELABLE_STATUSES.has(status) ? (
                        <Button size="sm" variant="outline" className="h-11 flex-1 text-destructive border-destructive/30" onClick={() => setParaCancelar(r)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden /> Cancelar
                        </Button>
                      ) : CANCEL_PENDING_STATUSES.has(status) ? CANCELANDO : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {expanded && !isMobile && (
        <Card className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>VM</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Casos</TableHead>
                  <TableHead>Agendado</TableHead>
                  <TableHead className="min-w-[180px]">Status</TableHead>
                  <TableHead className="w-px whitespace-nowrap text-center">Cancelar</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma solicitação ainda.</TableCell></TableRow>
                ) : pedidosDaPagina.map((r) => {
                  const status = statusDoPedido(r);
                  const erro = safeError(r.erro);
                  const quando = new Date(r.created_at).toLocaleString("pt-BR");
                  // Linha clicavel com o mouse; pelo teclado, o botao "Detalhes" da coluna Acoes.
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                      <TableCell className="text-xs">{quando}</TableCell>
                      <TableCell className="text-xs font-mono">{r.vm_name}</TableCell>
                      <TableCell className="text-xs">{r.versao}</TableCell>
                      <TableCell className="text-xs">{r.modulo_nome || r.modulo_codigo || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={r.casos_teste}>{r.casos_teste}</TableCell>
                      <TableCell className="text-xs font-mono">{r.data_hora || "—"}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <StatusOuProgresso r={r} status={status} />
                        {erro && <p className="mt-1 truncate text-xs text-destructive" title={erro}>{erro}</p>}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {podeCancelar && CANCELABLE_STATUSES.has(status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setParaCancelar(r)}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden /> Cancelar
                          </Button>
                        ) : CANCEL_PENDING_STATUSES.has(status) ? CANCELANDO : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" aria-label={`Detalhes do pedido de ${quando}`} onClick={() => setDetail(r)}>
                                <Info className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Detalhes</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" aria-label="Copiar a configuração enviada" onClick={() => copiarConfig(r)}>
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copiar a configuração enviada</TooltipContent>
                          </Tooltip>
                          {r.build_url && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {/* O link e o proprio botao (antes era um botao dentro do link: dois alvos de foco). */}
                                <Button size="sm" variant="ghost" asChild>
                                  <a href={r.build_url} target="_blank" rel="noreferrer" aria-label="Abrir o build no Jenkins">
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir o build no Jenkins</TooltipContent>
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
      )}
      {expanded && (
        <div className="mt-3">
          <Paginacao page={paginaAtual} pageSize={HISTORICO_POR_PAGINA} total={history.length} onChange={setPage} />
        </div>
      )}
      </div>

      <DetailDialog request={detail} onClose={() => setDetail(null)} />
      <ConfirmarAcao
        aberto={!!paraCancelar}
        titulo="Cancelar esta rodagem?"
        descricao="O Jenkins para a execução na VM. Não dá para desfazer."
        acao="Cancelar rodagem"
        ocupado={cancelandoAgora}
        onConfirmar={cancelar}
        onFechar={() => setParaCancelar(null)}
      >
        {paraCancelar && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
            <dt className="text-muted-foreground">VM</dt><dd className="font-mono">{paraCancelar.vm_name}</dd>
            <dt className="text-muted-foreground">Versão</dt><dd>{paraCancelar.versao}</dd>
            <dt className="text-muted-foreground">Casos</dt><dd className="break-all font-mono text-xs">{paraCancelar.casos_teste}</dd>
          </dl>
        )}
      </ConfirmarAcao>
    </TooltipProvider>
  );
});

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
          <DialogTitle>Detalhes do pedido</DialogTitle>
          <DialogDescription>Tudo o que foi pedido ao Jenkins e o que ele respondeu.</DialogDescription>
        </DialogHeader>
        {r && (() => {
          const status = statusDoPedido(r);
          const monErr = safeError(r.monitor_error);
          const subErr = safeError(r.erro);
          const rows: [string, React.ReactNode][] = [
            ["Pedido", <span className="font-mono text-xs">{r.id}</span>],
            ["Criado em", new Date(r.created_at).toLocaleString("pt-BR")],
            ["Tipo", TIPO_LABEL[r.tipo_solicitacao || ""] || r.tipo_solicitacao || "—"],
            ["Modo", MODO_LABEL[r.modo_configuracao || ""] || r.modo_configuracao || "—"],
            ["VM", r.vm_name || "—"],
            ["Versão", r.versao || "—"],
            ["Módulo", r.modulo_nome || r.modulo_codigo || "—"],
            ["Casos", <span className="font-mono text-xs break-all">{r.casos_teste || "—"}</span>],
            ["Agendado", r.data_hora || "—"],
            ["Status", <SeloStatus status={status} />],
            ["Resultado no Jenkins", r.execution_result || "—"],
            ["Número do build", r.build_number ? String(r.build_number) : (r.jenkins_build_number || "—")],
            ["Link do build", r.build_url ? (
              <a href={r.build_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs break-all">
                {r.build_url} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            ) : "—"],
            ["Início", r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"],
            ["Fim", r.finished_at ? new Date(r.finished_at).toLocaleString("pt-BR") : "—"],
            ["Duração", formatDuration(r.duration_ms)],
            ["Duração estimada", formatDuration(r.estimated_duration_ms)],
            ["Última checagem", r.last_checked_at ? new Date(r.last_checked_at).toLocaleString("pt-BR") : "—"],
            ["Erro", subErr || "—"],
            ["Erro de acompanhamento", monErr || "—"],
          ];
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-2 text-sm">
                {rows.map(([k, v], i) => (
                  <FragmentRow key={i} label={k as string} value={v} />
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Configuração enviada</div>
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
