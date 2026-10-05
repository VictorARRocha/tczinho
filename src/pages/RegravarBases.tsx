import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, FileDiff, GitCommitHorizontal, RotateCcw, Upload, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  cancelRegravacao, createRegravacao, extractVmName, type RegravacaoItem, type RegravacaoPedido, type RodagemListItem,
} from "@/services/data";
import { ApiError } from "@/services/data/apiSource";
import {
  invalidateRegravacao, invalidateRegravacaoCandidatos, useAllRuns, useRegravacaoCandidatos, useRegravacoes,
  useRunEvidences, useRunFailures,
} from "@/services/queries";
import {
  caminhoBridge, defaultCommitMessage, destinoLabel, ITEM_STATUS, MOTIVO_CURTO, PEDIDO_STATUS,
} from "@/lib/regravacao";
import type { ComparisonPair } from "@/lib/occurrence";
import type { Falha } from "@/types/db";

const FileComparatorDialog = lazy(() =>
  import("@/components/FileComparator").then((m) => ({ default: m.FileComparatorDialog })),
);
const FailureDetailSheet = lazy(() =>
  import("@/components/FailureDetailSheet").then((m) => ({ default: m.FailureDetailSheet })),
);

const runVm = (r: RodagemListItem) =>
  (r.vm_name || extractVmName(r.id_rodagem) || extractVmName(r.caminho_logs) || "").toLowerCase();
const runModulo = (r: RodagemListItem) => (r.modulo_slug || r.sistema || "").toString();

function apiMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return "Somente administradores podem regravar bases.";
  if (e instanceof ApiError && e.status === 409) return "Algum arquivo já está num pedido em andamento.";
  return (e as Error)?.message || "Erro desconhecido";
}

export default function RegravarBases() {
  const { isAdmin, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: runs = [] } = useAllRuns();
  const [fVm, setFVm] = useState("all");
  const [fModulo, setFModulo] = useState("all");
  const [fVersao, setFVersao] = useState("all");
  const runId = params.get("rodagem") || "";
  const setRunId = (id: string) => setParams(id ? { rodagem: id } : {}, { replace: true });

  const vmOptions = useMemo(() => Array.from(new Set(runs.map(runVm).filter(Boolean))).sort(), [runs]);
  const moduloOptions = useMemo(() => Array.from(new Set(runs.map(runModulo).filter(Boolean))).sort(), [runs]);
  const versaoOptions = useMemo(
    () => Array.from(new Set(runs.map((r) => (r.versao || "").toString()).filter(Boolean))).sort(),
    [runs],
  );
  const filteredRuns = useMemo(
    () => runs.filter((r) =>
      (fVm === "all" || runVm(r) === fVm) &&
      (fModulo === "all" || runModulo(r) === fModulo) &&
      (fVersao === "all" || (r.versao || "") === fVersao)),
    [runs, fVm, fModulo, fVersao],
  );

  const { data: candidatos, isLoading: loadingItens, isError: itensError } = useRegravacaoCandidatos(runId || null);
  const { data: pedidos = [] } = useRegravacoes(runId || null);
  const { data: evidencias = [] } = useRunEvidences(runId || null);
  const { data: falhas = [] } = useRunFailures(runId || null);
  const [casoAberto, setCasoAberto] = useState<Falha | null>(null);
  const evidenciasDoCaso = useMemo(
    () => (casoAberto ? evidencias.filter((e) => e.falha_id === casoAberto.id) : []),
    [casoAberto, evidencias],
  );
  // Mesmo painel da aba Falhas: abre a falha (caso) dona da diferenca.
  const abrirCaso = (item: RegravacaoItem) => {
    const falha = falhas.find((f) => f.id === item.occurrence_id);
    if (!falha) return toast.error("Caso não encontrado nesta rodagem.");
    setCasoAberto(falha);
  };
  const itens = useMemo(() => candidatos?.itens || [], [candidatos]);
  const regravaveis = useMemo(() => itens.filter((i) => i.regravavel), [itens]);

  // Quando um pedido muda de status (o Bridge pegou/terminou), recarrega a situacao dos arquivos.
  const statusPedidos = pedidos.map((p) => p.id + ":" + p.status).join("|");
  const statusAnterior = useRef(statusPedidos);
  useEffect(() => {
    if (statusAnterior.current !== statusPedidos && runId) invalidateRegravacaoCandidatos(runId);
    statusAnterior.current = statusPedidos;
  }, [statusPedidos, runId]);

  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [soRegravaveis, setSoRegravaveis] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [mensagemEditada, setMensagemEditada] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [detalhe, setDetalhe] = useState<RegravacaoPedido | null>(null);
  const [comparar, setComparar] = useState<ComparisonPair | null>(null);

  // Troca de rodagem limpa a selecao e volta a mensagem para o padrao.
  useEffect(() => {
    setMarcados(new Set());
    setMensagemEditada(false);
  }, [runId]);
  // Arquivo que deixou de ser regravavel (ex.: entrou num pedido) sai da selecao.
  useEffect(() => {
    setMarcados((prev) => {
      const ok = new Set(regravaveis.map((i) => i.difference_id));
      const next = new Set([...prev].filter((id) => ok.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [regravaveis]);

  const selecionados = useMemo(() => itens.filter((i) => marcados.has(i.difference_id)), [itens, marcados]);
  const padrao = useMemo(
    () => defaultCommitMessage(runId, profile?.username || null, selecionados),
    [runId, profile?.username, selecionados],
  );
  // Enquanto nao editada, a mensagem acompanha a selecao.
  useEffect(() => {
    if (!mensagemEditada) setMensagem(padrao);
  }, [padrao, mensagemEditada]);

  const visiveis = soRegravaveis ? regravaveis : itens;
  const toggle = (id: string) =>
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const abrirComparacao = (item: RegravacaoItem) => {
    const base = evidencias.find((e) => e.id === item.base_evidence_id);
    const atual = evidencias.find((e) => e.id === item.current_evidence_id);
    if (!base || !atual) return toast.error("Evidências desta diferença não encontradas.");
    setComparar({ key: item.difference_id, base, atual });
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      await createRegravacao({ run_id: runId, difference_ids: [...marcados], mensagem });
      toast.success("Pedido de regravação enviado", { description: "O RegravacaoBridge da D01 vai conferir e gravar no SVN." });
      setConfirmOpen(false);
      setMarcados(new Set());
      setMensagemEditada(false);
      await invalidateRegravacao(runId);
    } catch (e) {
      toast.error("Não foi possível enviar o pedido", { description: apiMessage(e) });
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (pedido: RegravacaoPedido) => {
    if (!window.confirm("Cancelar este pedido de regravação?")) return;
    try {
      await cancelRegravacao(pedido.id);
      toast.success("Pedido cancelado");
      await invalidateRegravacao(runId);
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: apiMessage(e) });
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-4 sm:mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/jenkins" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Jenkins
        </Link>
      </div>
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <Upload className="h-3 w-3" /> Regravar arquivos
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
          Regravar <span className="gradient-text">arquivos</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Substitui no SVN o arquivo base (Stores\Files) pelo arquivo atual de diferenças esperadas. O commit é feito pelo
          RegravacaoBridge da D01, que antes confere se a base ainda é a mesma da rodagem.
        </p>
      </div>

      {/* Rodagem */}
      <Card className="glass-card backdrop-filter-none p-4 sm:p-5 mb-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Rodagem</h2>
        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          {[
            { label: "VM", value: fVm, set: setFVm, options: vmOptions, all: "Todas" },
            { label: "Módulo", value: fModulo, set: setFModulo, options: moduloOptions, all: "Todos" },
            { label: "Versão", value: fVersao, set: setFVersao, options: versaoOptions, all: "Todas" },
          ].map((f) => (
            <div key={f.label}>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</label>
              <Select value={f.value} onValueChange={f.set}>
                <SelectTrigger aria-label={f.label}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{f.all}</SelectItem>
                  {f.options.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <Select value={runId} onValueChange={setRunId}>
          <SelectTrigger className="w-full" aria-label="Rodagem">
            <SelectValue placeholder="Selecione uma rodagem analisada" />
          </SelectTrigger>
          <SelectContent>
            {filteredRuns.map((r) => (
              <SelectItem key={r.id_rodagem} value={r.id_rodagem}>
                {r.versao || "—"} — {runVm(r) || "—"} — {runModulo(r) || "—"} —{" "}
                {r.data_inicio ? new Date(r.data_inicio).toLocaleString("pt-BR") : "—"} — {r.total_falhas ?? 0} falhas
              </SelectItem>
            ))}
            {filteredRuns.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma rodagem com os filtros atuais.</div>
            )}
          </SelectContent>
        </Select>
        {candidatos && (
          <p className="mt-3 text-xs text-muted-foreground">
            Destino no SVN:{" "}
            {candidatos.repository_url ? (
              <>
                <strong className="text-foreground">{destinoLabel(candidatos.repository_url)}</strong>{" "}
                <span className="font-mono break-all">{candidatos.repository_url}</span>
                {candidatos.repository_revision && <> (rodagem na revisão {candidatos.repository_revision})</>}
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                esta rodagem não registrou a origem SVN da VM; não é possível regravar.
              </span>
            )}
          </p>
        )}
      </Card>

      {/* Arquivos */}
      {runId && (
        <Card className="glass-card backdrop-filter-none overflow-hidden mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={!regravaveis.length}
                onClick={() => setMarcados(new Set(regravaveis.map((i) => i.difference_id)))}>
                Marcar regraváveis
              </Button>
              <Button size="sm" variant="outline" disabled={!marcados.size} onClick={() => setMarcados(new Set())}>
                Desmarcar
              </Button>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={soRegravaveis} onCheckedChange={(v) => setSoRegravaveis(v === true)} />
                Só regraváveis
              </label>
            </div>
            <span className="text-xs text-muted-foreground">
              {marcados.size} selecionado(s) · {regravaveis.length} de {itens.length} regravável(is)
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Caso</TableHead>
                  <TableHead>Arquivo atual</TableHead>
                  <TableHead>Base no repositório</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingItens ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : itensError ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-red-500">Não foi possível carregar as diferenças desta rodagem.</TableCell></TableRow>
                ) : visiveis.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {itens.length ? "Nenhum arquivo regravável nesta rodagem." : "Esta rodagem não tem diferenças de arquivo."}
                  </TableCell></TableRow>
                ) : visiveis.map((item) => (
                  <TableRow key={item.difference_id} className={item.regravavel ? "" : "opacity-70"}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Selecionar ${item.arquivo_atual}`}
                        disabled={!item.regravavel}
                        checked={marcados.has(item.difference_id)}
                        onCheckedChange={() => toggle(item.difference_id)}
                      />
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        title="Abrir o caso"
                        onClick={() => abrirCaso(item)}
                      >
                        {item.id_caso_teste}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={item.arquivo_atual || ""}>{item.arquivo_atual}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[320px] truncate" title={item.caminho_base || ""}>
                      {item.caminho_base ? caminhoBridge(item.caminho_base) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right">{item.linhas_alteradas ?? "—"}</TableCell>
                    <TableCell>
                      {item.regravavel ? (
                        <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400">Regravável</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400" title={item.motivo_texto || ""}>
                          {MOTIVO_CURTO[item.motivo || ""] || item.motivo}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => abrirComparacao(item)}>
                        <FileDiff className="h-3.5 w-3.5 mr-1" /> Comparar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Mensagem + envio */}
      {runId && regravaveis.length > 0 && (
        <Card className="glass-card backdrop-filter-none p-4 sm:p-5 mb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Mensagem do commit</h2>
            <div className="flex items-center gap-2">
              {mensagemEditada && (
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">Editada</Badge>
              )}
              <Button size="sm" variant="ghost" disabled={!mensagemEditada} onClick={() => setMensagemEditada(false)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar padrão
              </Button>
            </div>
          </div>
          <Textarea
            aria-label="Mensagem do commit"
            value={mensagem}
            onChange={(e) => { setMensagem(e.target.value); setMensagemEditada(true); }}
            spellCheck={false}
            className="min-h-[170px] font-mono text-xs"
            maxLength={4000}
          />
          <p className="text-[11px] text-muted-foreground">
            <code>{"{pedido}"}</code> é trocado pelo número do pedido no commit. Enquanto não for editada, a mensagem acompanha
            os arquivos selecionados.
          </p>
          <Button
            size="lg"
            className="w-full bg-gradient-primary"
            disabled={!isAdmin || !marcados.size || !mensagem.trim()}
            title={!isAdmin ? "Somente administradores podem regravar bases." : undefined}
            onClick={() => setConfirmOpen(true)}
          >
            <GitCommitHorizontal className="h-4 w-4 mr-2" />
            {isAdmin ? `Regravar ${marcados.size} arquivo(s)` : "Somente administradores podem regravar"}
          </Button>
        </Card>
      )}

      {/* Pedidos da rodagem */}
      {runId && (
        <div>
          <h2 className="mb-3 text-base sm:text-lg font-semibold">Pedidos de regravação desta rodagem</h2>
          <Card className="glass-card backdrop-filter-none overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/hora</TableHead>
                    <TableHead>Solicitado por</TableHead>
                    <TableHead>Arquivos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Revisão</TableHead>
                    <TableHead className="w-40 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum pedido ainda.</TableCell></TableRow>
                  ) : pedidos.map((p) => {
                    const meta = PEDIDO_STATUS[p.status] || { label: p.status, className: "" };
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{new Date(p.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs">{p.requested_by || "—"}</TableCell>
                        <TableCell className="text-xs">{p.items_json?.length ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                          {p.result_json?.simulacao && <span className="ml-2 text-[10px] text-muted-foreground">simulação</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{p.svn_revision ? `r${p.svn_revision}` : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetalhe(p)}>Detalhes</Button>
                            {isAdmin && p.status === "solicitado" && (
                              <Button size="sm" variant="ghost" className="text-red-500" onClick={() => cancelar(p)}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar
                              </Button>
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
        </div>
      )}

      {/* Confirmacao */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !enviando && setConfirmOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Regravar {selecionados.length} arquivo(s)?</DialogTitle>
            <DialogDescription>
              Destino: {destinoLabel(candidatos?.repository_url || null)}. Se alguma base tiver mudado no SVN desde a rodagem,
              nada é gravado.
            </DialogDescription>
          </DialogHeader>
          <ul className="rounded-md border border-border px-3 py-2 text-xs space-y-1">
            {selecionados.map((i) => (
              <li key={i.difference_id} className="break-all">
                <span className="font-mono">{i.id_caso_teste}</span> — {caminhoBridge(i.caminho_base)}
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Mensagem do commit</p>
            <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 text-xs">{mensagem}</pre>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={enviando} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Confirmar regravação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhes do pedido */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedido de regravação</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{detalhe?.id}</DialogDescription>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <p>
                Status: <strong>{PEDIDO_STATUS[detalhe.status]?.label || detalhe.status}</strong>
                {detalhe.svn_revision && <> · revisão <span className="font-mono">r{detalhe.svn_revision}</span></>}
              </p>
              {detalhe.error_message && <p className="text-red-500 text-xs">{detalhe.error_message}</p>}
              <ul className="rounded-md border border-border px-3 py-2 text-xs space-y-1">
                {(detalhe.items_json || []).map((item) => {
                  const resultado = detalhe.result_json?.itens?.find((r) => r.difference_id === item.difference_id);
                  return (
                    <li key={item.difference_id} className="break-all">
                      <span className="font-mono">{item.id_caso_teste}</span> — {item.caminho_base}
                      {resultado && (
                        <span className="ml-1 text-muted-foreground">
                          · {ITEM_STATUS[resultado.status] || resultado.status}
                          {resultado.mensagem ? ` (${resultado.mensagem})` : ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Mensagem do commit</p>
                <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 text-xs">
                  {detalhe.commit_message || "(padrão)"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {casoAberto && (
        <Suspense fallback={null}>
          <FailureDetailSheet
            falha={casoAberto}
            open={!!casoAberto}
            onClose={() => setCasoAberto(null)}
            evidencias={evidenciasDoCaso}
          />
        </Suspense>
      )}

      {comparar && (
        <Suspense fallback={null}>
          <FileComparatorDialog open={!!comparar} pair={comparar} onClose={() => setComparar(null)} />
        </Suspense>
      )}
    </div>
  );
}
