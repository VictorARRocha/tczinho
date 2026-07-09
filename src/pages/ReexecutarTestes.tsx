import { useEffect, useMemo, useState } from "react";
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
  fetchAllRuns,
  fetchCasosReexecutaveis,
  fetchRerunRequests,
  createRerunRequest,
  extractVmName,
  formatNowBr,
  subscribeToTable,
  type RodagemListItem,
  type CasoReexecutavel,
  type RerunRequest,
} from "@/services/data";

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
    return <Badge variant="outline" className="border-amber-500/40 text-amber-400">Diferenças</Badge>;
  if (tipo === "quebra_diferenca")
    return <Badge variant="outline" className="border-purple-500/40 text-purple-400">Quebra com diferença</Badge>;
  return <Badge variant="outline">—</Badge>;
}

type SortKey = "id_caso_teste" | "nome_mds" | "grupo" | "tipo_ocorrencia" | "cluster_titulo" | "arquivo_origem";
type SortDir = "asc" | "desc";

export default function ReexecutarTestes() {
  const [runs, setRuns] = useState<RodagemListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [casos, setCasos] = useState<CasoReexecutavel[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<RerunRequest[]>([]);
  const [loadingCasos, setLoadingCasos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("id_caso_teste");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
      const va = (a as any)[sortKey] ?? "";
      const vb = (b as any)[sortKey] ?? "";
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


  const selectedRun = useMemo(
    () => runs.find((r) => r.id_rodagem === selectedRunId) || null,
    [runs, selectedRunId],
  );

  const loadRuns = async () => {
    try {
      const list = await fetchAllRuns();
      setRuns(list);
      if (!selectedRunId && list.length) setSelectedRunId(list[0].id_rodagem);
    } catch (e: any) {
      console.error("[ReexecutarTestes] loadRuns error", e);
      toast.error("Erro ao carregar rodagens", { description: e?.message });
    }
  };

  const loadHistory = async () => {
    setHistory(await fetchRerunRequests(50));
  };

  useEffect(() => {
    loadRuns();
    loadHistory();
    const off = subscribeToTable("rerun_requests", () => loadHistory());
    const t = setInterval(loadHistory, 10000);
    return () => { off(); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRunId) { setCasos([]); return; }
    setLoadingCasos(true);
    setMarcados(new Set());
    fetchCasosReexecutaveis(selectedRunId)
      .then(setCasos)
      .catch((e) => toast.error("Erro ao carregar casos", { description: e?.message }))
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
    return ids.map((id) => `[${id}]`).join(", ");
  }, [casosSelecionados]);

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
      loadHistory();
    } catch (e: any) {
      toast.error("Falha ao criar solicitação", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-fade-in">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <PlayCircle className="h-3 w-3" />
          Reexecutar Testes
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
          Solicitar nova execução no <span className="gradient-text">Jenkins</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Selecione uma rodagem analisada, marque os casos quebrados ou com diferença e crie uma
          solicitação. O <strong>JenkinsBridge</strong> local lê a tabela{" "}
          <code className="text-xs">rerun_requests</code> e dispara o pipeline — a Lovable nunca
          conversa com o Jenkins diretamente.
        </p>
      </div>

      {/* Seletor de rodagem */}
      <Card className="glass-card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Rodagem
          </h2>
          <Button size="sm" variant="ghost" onClick={loadRuns}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
          </Button>
        </div>
        <Select value={selectedRunId} onValueChange={setSelectedRunId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione uma rodagem analisada" />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r) => {
              const vm = (r.vm_name || extractVmName(r.id_rodagem) || extractVmName(r.caminho_logs) || "—").toLowerCase();
              const dt = r.data_inicio ? new Date(r.data_inicio).toLocaleString("pt-BR") : "—";
              return (
                <SelectItem key={r.id_rodagem} value={r.id_rodagem}>
                  {(r.versao || "—")} — {vm} — {r.modulo_slug || r.sistema || "—"} — {dt} — {r.total_falhas ?? 0} falhas
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {selectedRun && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4 text-sm">
            <Info label="ID da rodagem" value={selectedRun.id_rodagem} mono />
            <Info label="VM" value={vmName || "—"} />
            <Info label="Versão" value={selectedRun.versao || "—"} />
            <Info label="Módulo" value={selectedRun.modulo_slug || selectedRun.sistema || "—"} />
            <Info label="Data/hora" value={selectedRun.data_inicio ? new Date(selectedRun.data_inicio).toLocaleString("pt-BR") : "—"} />
            <Info label="Total de falhas" value={String(selectedRun.total_falhas ?? 0)} />
            <Info label="Total de clusters" value={String(selectedRun.total_clusters ?? 0)} />
            <Info label="Caminho de logs" value={selectedRun.caminho_logs || "—"} mono />
          </div>
        )}
      </Card>

      {/* Filtros */}
      <Card className="glass-card p-5 mb-5">
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Marcar todos</Button>
          <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>Desmarcar todos</Button>
          <span className="w-px h-5 bg-border mx-1" />
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

      {/* Tabela de casos */}
      <Card className="glass-card mb-5 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <SortableHead label="ID" sortKey="id_caso_teste" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Nome" sortKey="nome_mds" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Grupo" sortKey="grupo" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Tipo" sortKey="tipo_ocorrencia" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Causa" sortKey="cluster_titulo" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHead label="Arquivo" sortKey="arquivo_origem" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingCasos ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando casos…</TableCell></TableRow>
            ) : casos.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum caso disponível para esta rodagem.</TableCell></TableRow>
            ) : (
              sortedCasos.map((c) => {
                const checked = marcados.has(c.id_falha);
                return (
                  <TableRow key={c.id_falha} data-state={checked ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleOne(c.id_falha, !!v)}
                        disabled={!c.id_caso_teste}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.id_caso_teste || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={c.nome_mds || ""}>{c.nome_mds || "—"}</TableCell>
                    <TableCell className="text-xs">{c.grupo || "—"}</TableCell>
                    <TableCell><TipoBadge tipo={c.tipo_ocorrencia} /></TableCell>
                    <TableCell className="max-w-xs truncate text-xs" title={c.cluster_titulo || ""}>{c.cluster_titulo || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs font-mono" title={c.arquivo_origem || ""}>{c.arquivo_origem || "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Rodapé: preview + botão */}
      <Card className="glass-card p-5 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="bg-gradient-primary"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {submitting ? "Enviando…" : "Rodar novamente"}
          </Button>
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Histórico de reexecuções</h2>
        <Button size="sm" variant="ghost" onClick={loadHistory}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
        </Button>
      </div>
      <Card className="glass-card overflow-hidden">
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
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma solicitação ainda.</TableCell></TableRow>
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
      </Card>
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
