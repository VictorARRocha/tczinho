import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SemPermissao } from "@/components/SemPermissao";
import { usePermissao } from "@/hooks/use-permissao";
import { useAuth } from "@/contexts/AuthContext";
import { mensagemDaApi } from "@/lib/apiErro";
import { podeNoModulo } from "@/lib/permissoes";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Copy,
  ChevronDown,
  PlayCircle,
  RefreshCw,
  AlertTriangle,
  GitCompare,
  Layers,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import {
  fetchCasosReexecutaveis,
  createRerunRequest,
  extractVmName,
  formatNowBr,
  type RodagemListItem,
  type CasoReexecutavel,
} from "@/services/data";
import { invalidateRerunRequests, useAllRuns, useRerunRequests } from "@/services/queries";
import { canClearHistory, useHistoryClear, visibleAfterClear } from "@/lib/historyClear";
import { HistoryClearControls } from "@/components/HistoryClearControls";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUS_META: Record<string, { label: string; className: string }> = {
  solicitado: { label: "Solicitado", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  processando: { label: "Processando", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  enviado_jenkins: { label: "Enviado ao Jenkins", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  erro: { label: "Erro", className: "bg-red-500/15 text-red-500 border-red-500/30" },
};

function TipoBadge({ tipo }: { tipo: CasoReexecutavel["tipo_ocorrencia"] }) {
  if (tipo === "quebra")
    return <Badge variant="outline" className="border-red-500/40 text-red-400">Quebra</Badge>;
  if (tipo === "diferenca")
    return <Badge variant="outline" className="border-amber-500/40 text-amber-400">Diferença</Badge>;
  if (tipo === "quebra_diferenca")
    return <Badge variant="outline" className="border-purple-500/40 text-purple-400">Quebra com diferença</Badge>;
  return <Badge variant="outline">—</Badge>;
}

type SortKey = "id_caso_teste" | "nome_mds" | "grupo" | "tipo_ocorrencia" | "cluster_titulo" | "arquivo_origem";
type SortDir = "asc" | "desc";

const SORT_LABEL: Partial<Record<SortKey, string>> = {
  id_caso_teste: "ID", nome_mds: "Nome", tipo_ocorrencia: "Tipo", grupo: "Grupo",
};

export default function ReexecutarTestes() {
  const podeSolicitar = usePermissao("rodagem");
  const { data: todasRodagens = [] } = useAllRuns();
  // So as rodagens dos modulos da pessoa (a API confere de novo no envio).
  const { profile, isAdmin } = useAuth();
  const runs = useMemo(
    () => todasRodagens.filter((r) => podeNoModulo(profile, isAdmin, r.modulo_slug)),
    [todasRodagens, profile, isAdmin],
  );
  const isMobile = useIsMobile();
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [casos, setCasos] = useState<CasoReexecutavel[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // Mesmo cache do JenkinsHistory: 10s com pedido ativo, 1 minuto sem.
  const { data: historyData } = useRerunRequests(50);
  // A API pode devolver mais que o pedido; mostra no maximo 50, como na rodagem completa.
  const allHistory = useMemo(() => (historyData || []).slice(0, 50), [historyData]);
  const historyClear = useHistoryClear("agenttc.jenkins.reexecucoes.ocultas");
  const history = useMemo(() => visibleAfterClear(allHistory, historyClear.hiddenIds), [allHistory, historyClear.hiddenIds]);
  const [loadingCasos, setLoadingCasos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fVm, setFVm] = useState<string>("all");
  const [fModulo, setFModulo] = useState<string>("all");
  const [fVersao, setFVersao] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("id_caso_teste");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [restaurarBase, setRestaurarBase] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedCasos = useMemo(() => {
    const arr = [...casos];
    const dir = sortDir === "asc" ? 1 : -1;
    const numericId = (s: string) =>
      s.split(".").map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : p;
      });
    arr.sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (sortKey === "id_caso_teste") {
        const pa = numericId(String(va));
        const pb = numericId(String(vb));
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
          const x = pa[i], y = pb[i];
          if (x === undefined) return -1 * dir;
          if (y === undefined) return 1 * dir;
          if (x < y) return -1 * dir;
          if (x > y) return 1 * dir;
        }
        return 0;
      }
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
    });
    return arr;
  }, [casos, sortKey, sortDir]);


  const runVm = (r: RodagemListItem) =>
    (r.vm_name || extractVmName(r.id_rodagem) || extractVmName(r.caminho_logs) || "").toLowerCase();
  const runModulo = (r: RodagemListItem) => (r.modulo_slug || r.sistema || "").toString();

  const vmOptions = useMemo(
    () => Array.from(new Set(runs.map(runVm).filter(Boolean))).sort(),
    [runs],
  );
  const moduloOptions = useMemo(
    () => Array.from(new Set(runs.map(runModulo).filter(Boolean))).sort(),
    [runs],
  );
  const versaoOptions = useMemo(
    () => Array.from(new Set(runs.map((r) => (r.versao || "").toString()).filter(Boolean))).sort(),
    [runs],
  );

  const filteredRuns = useMemo(
    () =>
      runs.filter((r) => {
        if (fVm !== "all" && runVm(r) !== fVm) return false;
        if (fModulo !== "all" && runModulo(r) !== fModulo) return false;
        if (fVersao !== "all" && (r.versao || "") !== fVersao) return false;
        return true;
      }),
    [runs, fVm, fModulo, fVersao],
  );

  const selectedRun = useMemo(
    () => runs.find((r) => r.id_rodagem === selectedRunId) || null,
    [runs, selectedRunId],
  );

  // Se o filtro esconder a rodagem selecionada, seleciona a primeira do filtro
  useEffect(() => {
    if (!filteredRuns.length) return;
    if (!filteredRuns.some((r) => r.id_rodagem === selectedRunId)) {
      setSelectedRunId(filteredRuns[0].id_rodagem);
    }
  }, [filteredRuns, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) { setCasos([]); return; }
    setLoadingCasos(true);
    setMarcados(new Set());
    fetchCasosReexecutaveis(selectedRunId)
      .then(setCasos)
      .catch((e) => toast.error("Erro ao carregar casos", { description: (e as Error)?.message }))
      .finally(() => setLoadingCasos(false));
  }, [selectedRunId]);

  const vmName = useMemo(() => {
    if (!selectedRun) return "";
    return (
      selectedRun.vm_name ||
      extractVmName(selectedRun.id_rodagem) ||
      extractVmName(selectedRun.caminho_logs) ||
      ""
    ).toLowerCase();
  }, [selectedRun]);

  const versao = (selectedRun?.versao || "").toLowerCase();

  const toggleAll = (on: boolean) => {
    setMarcados(on ? new Set(casos.map((c) => c.id_falha)) : new Set());
  };
  const toggleByTipo = (tipo: CasoReexecutavel["tipo_ocorrencia"]) => {
    setMarcados(new Set(casos.filter((c) => c.tipo_ocorrencia === tipo).map((c) => c.id_falha)));
  };
  const toggleOne = (id: string, on: boolean) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const casosSelecionados = useMemo(
    () => casos.filter((c) => marcados.has(c.id_falha)),
    [casos, marcados],
  );

  const casosTesteString = useMemo(() => {
    const ids = Array.from(
      new Set(
        casosSelecionados
          .map((c) => (c.id_caso_teste || "").trim())
          .filter(Boolean),
      ),
    );
    const parts = restaurarBase ? ["[0.4]", "[0.5]"] : [];
    parts.push(...ids.map((id) => `[${id}]`));
    return parts.join(", ");
  }, [casosSelecionados, restaurarBase]);

  const configJsonPreview = useMemo(() => ({
    vm_name: vmName,
    versao,
    casos_teste: casosTesteString,
    paralelo: "",
    ct_desmarcar: "[0.3]",
    data_hora: formatNowBr(),
    branch: "",
  }), [vmName, versao, casosTesteString]);

  const canSubmit = !!selectedRun && casosSelecionados.length > 0 && !!vmName && !!versao && !!casosTesteString;

  const handleSubmit = async () => {
    if (!selectedRun) { toast.error("Selecione uma rodagem"); return; }
    if (!vmName) { toast.error("VM não identificada para esta rodagem"); return; }
    if (!versao) { toast.error("Versão ausente na rodagem"); return; }
    if (!casosTesteString) { toast.error("Selecione ao menos um caso de teste"); return; }
    setSubmitting(true);
    try {
      await createRerunRequest({
        vm_name: vmName,
        versao,
        casos_teste: casosTesteString,
        paralelo: "",
        ct_desmarcar: "[0.3]",
        data_hora: configJsonPreview.data_hora,
        branch: "",
      });
      toast.success("Solicitação enviada", {
        description: "O JenkinsBridge local irá disparar o Jenkins.",
      });
      setMarcados(new Set());
      invalidateRerunRequests();
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: mensagemDaApi(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <PlayCircle className="h-3 w-3" />
          Reexecutar Testes
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
          Solicitar nova execução no <span className="gradient-text">Jenkins</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Selecione uma rodagem analisada, marque os casos quebrados ou com diferença e crie uma
          solicitação.
        </p>
      </div>

      {/* Seletor de rodagem */}
      <Card className="glass-card p-4 sm:p-5 mb-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Rodagem
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">VM</label>
            <Select value={fVm} onValueChange={setFVm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {vmOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Módulo</label>
            <Select value={fModulo} onValueChange={setFModulo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {moduloOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Versão</label>
            <Select value={fVersao} onValueChange={setFVersao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {versaoOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Select value={selectedRunId} onValueChange={setSelectedRunId}>
          {/* No celular o texto da rodagem quebra linha em vez de ser cortado. */}
          <SelectTrigger className="w-full max-sm:h-auto max-sm:min-h-10 max-sm:text-left max-sm:[&>span]:line-clamp-2">
            <SelectValue placeholder="Selecione uma rodagem analisada" />
          </SelectTrigger>
          <SelectContent className="max-sm:max-w-[var(--radix-select-trigger-width)]">
            {filteredRuns.map((r) => {
              const vm = (r.vm_name || extractVmName(r.id_rodagem) || extractVmName(r.caminho_logs) || "—").toLowerCase();
              const dt = r.data_inicio ? new Date(r.data_inicio).toLocaleString("pt-BR") : "—";
              return (
                <SelectItem key={r.id_rodagem} value={r.id_rodagem} className="max-sm:whitespace-normal">
                  {(r.versao || "—")} — {vm} — {r.modulo_slug || r.sistema || "—"} — {dt} — {r.total_falhas ?? 0} falhas
                </SelectItem>
              );
            })}
            {filteredRuns.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma rodagem com os filtros atuais.</div>
            )}
          </SelectContent>
        </Select>

        {selectedRun && (
          <>
            <div className="mt-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Caminho de logs</div>
              <div
                className="text-sm font-mono whitespace-nowrap overflow-x-auto"
                title={selectedRun.caminho_logs || "—"}
              >
                {selectedRun.caminho_logs || "—"}
              </div>
            </div>
            {(selectedRun.modulo_slug || selectedRun.sistema) && (
              <div className="mt-4">
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={`/modulo/${selectedRun.modulo_slug || selectedRun.sistema}?run=${encodeURIComponent(selectedRun.id_rodagem)}&tab=falhas`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Ver falhas desta rodagem
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <Checkbox
            id="restaurar-base"
            checked={restaurarBase}
            onCheckedChange={(v) => setRestaurarBase(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="restaurar-base" className="cursor-pointer select-none">
            <div className="text-sm font-medium">Restaurar base</div>
            <div className="text-[11px] text-muted-foreground">
              Quando habilitado, adiciona <code className="text-xs">[0.4]</code> e{" "}
              <code className="text-xs">[0.5]</code> ao campo <code className="text-xs">casos_teste</code>.
            </div>
          </label>
        </div>
      </Card>

      {/* Filtros */}
      <Card className="glass-card p-4 sm:p-5 mb-5">
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Marcar todos</Button>
          <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>Desmarcar todos</Button>
          <span className="w-px h-5 bg-border mx-1 max-sm:hidden" />
          <Button size="sm" variant="outline" onClick={() => toggleByTipo("diferenca")}>
            <GitCompare className="h-3.5 w-3.5 mr-1" /> Apenas diferenças
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleByTipo("quebra")}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Apenas quebras
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleByTipo("quebra_diferenca")}>
            <Layers className="h-3.5 w-3.5 mr-1" /> Quebra com diferença
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {casosSelecionados.length} selecionado(s) de {casos.length}
          </div>
        </div>
      </Card>

      {/* Tabela de casos (cartoes no celular) */}
      <Card className="glass-card mb-5 overflow-hidden">
        {isMobile ? (
          <>
            <div className="flex items-center gap-2 border-b border-border/60 p-3">
              <Select value={sortKey} onValueChange={(v) => { setSortKey(v as SortKey); setSortDir("asc"); }}>
                <SelectTrigger className="h-9 flex-1 text-xs" aria-label="Ordenar por"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>Ordenar por {SORT_LABEL[k]!.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0"
                aria-label={sortDir === "asc" ? "Ordem crescente" : "Ordem decrescente"}
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            {loadingCasos ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando casos…</p>
            ) : casos.length === 0 ? (
              <p className="py-8 px-4 text-center text-sm text-muted-foreground">Nenhum caso disponível para esta rodagem.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {sortedCasos.map((c) => {
                  const checked = marcados.has(c.id_falha);
                  return (
                    <li
                      key={c.id_falha}
                      onClick={() => c.id_caso_teste && toggleOne(c.id_falha, !checked)}
                      className={`flex gap-3 p-3 ${checked ? "bg-muted/40" : ""} ${c.id_caso_teste ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                    >
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="h-5 w-5"
                          checked={checked}
                          onCheckedChange={(v) => toggleOne(c.id_falha, !!v)}
                          disabled={!c.id_caso_teste}
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs">{c.id_caso_teste || "—"}</span>
                          <TipoBadge tipo={c.tipo_ocorrencia} />
                        </div>
                        <p className="text-sm break-words">{c.nome_mds || "—"}</p>
                        {c.grupo && <p className="text-[11px] text-muted-foreground">{c.grupo}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <SortableHead label="ID" sortKey="id_caso_teste" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Nome" sortKey="nome_mds" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Tipo" sortKey="tipo_ocorrencia" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Grupo" sortKey="grupo" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingCasos ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando casos…</TableCell></TableRow>
            ) : casos.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum caso disponível para esta rodagem.</TableCell></TableRow>
            ) : (
              sortedCasos.map((c) => {
                const checked = marcados.has(c.id_falha);
                return (
                  <TableRow
                    key={c.id_falha}
                    data-state={checked ? "selected" : undefined}
                    onClick={() => c.id_caso_teste && toggleOne(c.id_falha, !checked)}
                    className={c.id_caso_teste ? "cursor-pointer" : "cursor-not-allowed opacity-70"}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleOne(c.id_falha, !!v)}
                        disabled={!c.id_caso_teste}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.id_caso_teste || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={c.nome_mds || ""}>{c.nome_mds || "—"}</TableCell>
                    <TableCell><TipoBadge tipo={c.tipo_ocorrencia} /></TableCell>
                    <TableCell className="text-xs">{c.grupo || "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        )}
      </Card>

      {/* Rodapé: preview + botão */}
      <Card className="glass-card p-4 sm:p-5 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || !podeSolicitar}
            className="bg-gradient-primary max-sm:w-full"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {submitting ? "Enviando…" : "Rodar novamente"}
          </Button>
          {!podeSolicitar && <SemPermissao permissao="rodagem" className="w-full" />}
          <div className="text-xs text-muted-foreground">
            Cria um registro em <code>rerun_requests</code> com status <strong>solicitado</strong>.
          </div>
        </div>

        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronDown className={`h-3.5 w-3.5 mr-1 transition-transform ${previewOpen ? "rotate-180" : ""}`} />
              Preview do CONFIG_JSON
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto">
{JSON.stringify(configJsonPreview, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Histórico */}
      <Collapsible>
        <div className="mb-3 flex items-center justify-between max-sm:flex-wrap max-sm:gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group -ml-2">
              <ChevronDown className="h-4 w-4 mr-1 transition-transform group-data-[state=open]:rotate-180" />
              <h2 className="text-base sm:text-lg font-semibold">Histórico de reexecuções</h2>
            </Button>
          </CollapsibleTrigger>
          <HistoryClearControls
            hiddenCount={allHistory.length - history.length}
            canClear={canClearHistory(history)}
            onClear={() => historyClear.clear(history)}
            onRestore={historyClear.restore}
          />
        </div>
        <CollapsibleContent>
          <Card className="glass-card overflow-hidden">
            {isMobile ? (
              history.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {allHistory.length > 0 ? "Nenhuma solicitação desde a última limpeza." : "Nenhuma solicitação ainda."}
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {history.map((r) => {
                    const meta = STATUS_META[r.status] || { label: r.status, className: "" };
                    return (
                      <li key={r.id} className="space-y-1.5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </div>
                        <p className="text-sm">
                          <span className="font-mono">{r.vm_name}</span> · {r.versao}
                          {r.jenkins_build_number && <> · build <span className="font-mono">{r.jenkins_build_number}</span></>}
                        </p>
                        {r.casos_teste && <p className="break-all text-[11px] text-muted-foreground">Casos: {r.casos_teste}</p>}
                        {r.erro && <p className="break-words text-[11px] text-red-400">{r.erro}</p>}
                        <div className="flex gap-2">
                          {r.jenkins_queue_url && (
                            <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                              <a href={r.jenkins_queue_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Queue
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
                            toast.success("CONFIG_JSON copiado");
                          }}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar JSON
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>VM</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Casos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jenkins</TableHead>
                  <TableHead>Build</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{allHistory.length > 0 ? "Nenhuma solicitação desde a última limpeza." : "Nenhuma solicitação ainda."}</TableCell></TableRow>
                ) : (
                  history.map((r) => {
                    const meta = STATUS_META[r.status] || { label: r.status, className: "" };
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs font-mono">{r.vm_name}</TableCell>
                        <TableCell className="text-xs">{r.versao}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={r.casos_teste}>{r.casos_teste}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {r.jenkins_queue_url ? (
                            <a href={r.jenkins_queue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              Queue <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.jenkins_build_number || "—"}</TableCell>
                        <TableCell className="text-xs text-red-400 max-w-xs truncate" title={r.erro || ""}>{r.erro || "—"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
                              toast.success("CONFIG_JSON copiado");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm truncate ${mono ? "font-mono" : ""}`} title={value}>{value}</div>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}
