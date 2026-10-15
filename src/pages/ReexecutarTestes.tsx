import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SemPermissao } from "@/components/SemPermissao";
import { usePermissao } from "@/hooks/use-permissao";
import { useAuth } from "@/contexts/AuthContext";
import { mensagemDaApi } from "@/lib/apiErro";
import { modulosDosCasos, nomeModulo, podeNoModulo } from "@/lib/permissoes";
import { VM_OPTIONS } from "@/lib/branchVm";
import { formatDateTime } from "@/lib/format";
import { formatarVersao, formatarVm, ordenarVersoes } from "@/lib/rodagemTexto";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  AlertTriangle,
  GitCompare,
  Layers,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Circle,
  CircleCheck,
} from "lucide-react";
import {
  fetchCasosReexecutaveis,
  createRerunRequest,
  extractVmName,
  formatNowBr,
  type RodagemListItem,
  type CasoReexecutavel,
  type RerunRequest,
} from "@/services/data";
import { invalidateRerunRequests, useAllRuns, useRerunRequests } from "@/services/queries";
import { HISTORICO_POR_PAGINA } from "@/components/JenkinsHistory";
import { Paginacao } from "./module/common";
import { useIsMobile } from "@/hooks/use-mobile";

// Mesmas cores do historico da Rodagem completa (JenkinsHistory).
const STATUS_META: Record<string, { label: string; className: string }> = {
  solicitado: { label: "Solicitado", className: "bg-muted text-muted-foreground border-border" },
  processando: { label: "Processando", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  enviado_jenkins: { label: "Enviado ao Jenkins", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  erro: { label: "Erro", className: "bg-red-500/15 text-red-500 border-red-500/30" },
};

const TIPOS: { tipo: CasoReexecutavel["tipo_ocorrencia"]; label: string; Icon: typeof AlertTriangle }[] = [
  { tipo: "quebra", label: "Quebras", Icon: AlertTriangle },
  { tipo: "diferenca", label: "Diferenças", Icon: GitCompare },
  { tipo: "quebra_diferenca", label: "Quebra + diferença", Icon: Layers },
];

// Quantas rodagens aparecem antes do "Mostrar mais".
const RODAGENS_VISIVEIS = 8;

type Etapa = 1 | 2 | 3;
const ETAPAS: { n: Etapa; label: string }[] = [
  { n: 1, label: "Rodagem" },
  { n: 2, label: "Casos" },
  { n: 3, label: "Confirmar" },
];

function TipoBadge({ tipo }: { tipo: CasoReexecutavel["tipo_ocorrencia"] }) {
  if (tipo === "quebra")
    return <Badge variant="outline" className="border-destructive/40 text-destructive">Quebra</Badge>;
  if (tipo === "diferenca")
    return <Badge variant="outline" className="border-warning/40 text-warning">Diferença</Badge>;
  if (tipo === "quebra_diferenca")
    return <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400">Quebra + diferença</Badge>;
  return <Badge variant="outline">—</Badge>;
}

/** Versao legivel num selo; a versao completa (a que vai no pedido) fica na dica. */
function VersaoSelo({ versao }: { versao: string | null | undefined }) {
  if (!versao) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="inline-block max-w-full truncate rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-xs"
      title={versao}
    >
      {formatarVersao(versao)}
    </span>
  );
}

function Resumo({ label, children, destaque }: { label: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("truncate text-sm font-medium", destaque && "text-warning")}>{children}</div>
    </div>
  );
}

type SortKey = "id_caso_teste" | "nome_mds" | "grupo" | "tipo_ocorrencia" | "cluster_titulo" | "arquivo_origem";
type SortDir = "asc" | "desc";

const SORT_LABEL: Partial<Record<SortKey, string>> = {
  id_caso_teste: "ID", nome_mds: "Nome", tipo_ocorrencia: "Tipo", grupo: "Grupo",
};

const runVm = (r: RodagemListItem) =>
  (r.vm_name || extractVmName(r.id_rodagem) || extractVmName(r.caminho_logs) || "").toLowerCase();
const runModulo = (r: RodagemListItem) => (r.modulo_slug || r.sistema || "").toString();

/** Modulo de um pedido do historico: o informado pela API ou o dos casos pedidos. */
function moduloDoPedido(r: RerunRequest): string {
  if (r.modulo_nome) return r.modulo_nome;
  const slugs = modulosDosCasos(r.casos_teste);
  return slugs.length ? slugs.map(nomeModulo).join(", ") : "—";
}

/** Casos pedidos, sem as rotinas de base [0.x]. */
function totalCasosDoPedido(casos: string | null | undefined): number {
  return Array.from((casos || "").matchAll(/\[([^[\]]*)\]/g)).filter((m) => !m[1].trim().startsWith("0.")).length;
}

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
  const [etapa, setEtapa] = useState<Etapa>(1);
  // ?run= : volta do "Ver falhas desta rodagem" com a mesma rodagem selecionada.
  const [searchParams] = useSearchParams();
  const [selectedRunId, setSelectedRunId] = useState<string>(() => searchParams.get("run") || "");
  const [casos, setCasos] = useState<CasoReexecutavel[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // Mesmo cache do JenkinsHistory: 10s com pedido ativo, 1 minuto sem.
  const { data: historyData } = useRerunRequests(50);
  // A API pode devolver mais que o pedido; mostra no maximo 50, como na rodagem completa.
  const history = useMemo(() => (historyData || []).slice(0, 50), [historyData]);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPaginaAtual = Math.min(historyPage, Math.max(1, Math.ceil(history.length / HISTORICO_POR_PAGINA)));
  const historyDaPagina = history.slice((historyPaginaAtual - 1) * HISTORICO_POR_PAGINA, historyPaginaAtual * HISTORICO_POR_PAGINA);
  const [loadingCasos, setLoadingCasos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fVm, setFVm] = useState<string>("all");
  const [fModulo, setFModulo] = useState<string>("all");
  const [fVersao, setFVersao] = useState<string>("all");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("id_caso_teste");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // A rodagem ja restaura e atualiza a base sozinha; "Manter base atual" desmarca as rotinas [0.4] e [0.5].
  const [manterBase, setManterBase] = useState(false);
  // Opcao avancada (quase nunca usada): manda o pedido para outra VM. Comeca desligada e desliga ao trocar de rodagem.
  const [avancadasOpen, setAvancadasOpen] = useState(false);
  const [outraVm, setOutraVm] = useState(false);
  const [vmEscolhida, setVmEscolhida] = useState("");
  // Mesma ideia para a versao (ex.: rodar na "clientes" os casos que deram problema numa versao especifica).
  const [outraVersao, setOutraVersao] = useState(false);
  const [versaoEscolhida, setVersaoEscolhida] = useState("");

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

  const vmOptions = useMemo(
    () => Array.from(new Set(runs.map(runVm).filter(Boolean))).sort(),
    [runs],
  );
  const moduloOptions = useMemo(
    () => Array.from(new Set(runs.map(runModulo).filter(Boolean))).sort(),
    [runs],
  );
  // Versoes so das rodagens da VM (e do modulo) escolhidos: a A08 so mostra o que a A08 ja rodou.
  const versaoOptions = useMemo(
    () =>
      ordenarVersoes(
        Array.from(
          new Set(
            runs
              .filter((r) => (fVm === "all" || runVm(r) === fVm) && (fModulo === "all" || runModulo(r) === fModulo))
              .map((r) => (r.versao || "").toString())
              .filter(Boolean),
          ),
        ),
      ),
    [runs, fVm, fModulo],
  );
  // Versao escolhida que a VM nova nunca rodou volta para "todas".
  useEffect(() => {
    if (fVersao !== "all" && !versaoOptions.includes(fVersao)) setFVersao("all");
  }, [fVersao, versaoOptions]);

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

  const runsVisiveis = useMemo(() => {
    if (mostrarTodas || filteredRuns.length <= RODAGENS_VISIVEIS) return filteredRuns;
    const primeiras = filteredRuns.slice(0, RODAGENS_VISIVEIS);
    // A selecionada continua aparecendo mesmo se estiver depois do corte.
    const sel = filteredRuns.find((r) => r.id_rodagem === selectedRunId);
    return sel && !primeiras.includes(sel) ? [...primeiras, sel] : primeiras;
  }, [filteredRuns, mostrarTodas, selectedRunId]);

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
    // A troca de VM e de versao vale so para o pedido da rodagem em que foi ligada.
    setOutraVm(false);
    setVmEscolhida("");
    setOutraVersao(false);
    setVersaoEscolhida("");
    if (!selectedRunId) { setCasos([]); return; }
    setLoadingCasos(true);
    setMarcados(new Set());
    fetchCasosReexecutaveis(selectedRunId)
      .then(setCasos)
      .catch((e) => toast.error("Erro ao carregar casos", { description: (e as Error)?.message }))
      .finally(() => setLoadingCasos(false));
  }, [selectedRunId]);

  const vmName = useMemo(() => (selectedRun ? runVm(selectedRun) : ""), [selectedRun]);
  // VM que vai no pedido: a da rodagem, ou a escolhida nas opcoes avancadas.
  const vmPedido = outraVm ? vmEscolhida : vmName;
  const outrasVms = useMemo(() => VM_OPTIONS.filter((v) => v !== vmName), [vmName]);

  const versaoDaRodagem = (selectedRun?.versao || "").toLowerCase();
  // Versao que vai no pedido: a da rodagem, ou a digitada nas opcoes avancadas.
  const versao = outraVersao ? versaoEscolhida.trim().toLowerCase() : versaoDaRodagem;
  // Sugestoes: as versoes que ja rodaram (Proxima e Pre-clientes primeiro), menos a da rodagem.
  const outrasVersoes = useMemo(
    () => ordenarVersoes(Array.from(new Set(runs.map((r) => (r.versao || "").toString()).filter(Boolean))))
      .filter((v) => v.toLowerCase() !== versaoDaRodagem),
    [runs, versaoDaRodagem],
  );
  const trocas = [outraVm && "a VM", outraVersao && "a versão"].filter(Boolean) as string[];

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

  const totalPorTipo = useMemo(() => {
    const total: Record<string, number> = {};
    for (const c of casos) total[c.tipo_ocorrencia] = (total[c.tipo_ocorrencia] || 0) + 1;
    return total;
  }, [casos]);

  const casosSelecionados = useMemo(
    () => casos.filter((c) => marcados.has(c.id_falha)),
    [casos, marcados],
  );
  const todosMarcados = casos.length > 0 && casosSelecionados.length === casos.length;

  // Casos que vao no pedido (sem repetir o mesmo caso), na ordem da lista, com o nome para a confirmacao.
  const casosDoPedido = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const c of sortedCasos) {
      const id = (c.id_caso_teste || "").trim();
      if (id && marcados.has(c.id_falha) && !vistos.has(id)) vistos.set(id, c.nome_mds || "");
    }
    return Array.from(vistos, ([id, nome]) => ({ id, nome }));
  }, [sortedCasos, marcados]);

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
  const ctDesmarcar = manterBase ? "[0.3], [0.4], [0.5]" : "[0.3]";

  const configJsonPreview = useMemo(() => ({
    vm_name: vmPedido,
    versao,
    casos_teste: casosTesteString,
    paralelo: "",
    ct_desmarcar: ctDesmarcar,
    data_hora: formatNowBr(),
    branch: "",
  }), [vmPedido, versao, casosTesteString, ctDesmarcar]);

  const canSubmit = !!selectedRun && casosSelecionados.length > 0 && !!vmPedido && !!versao && !!casosTesteString;
  // Ate onde da para ir: casos precisa de rodagem; confirmar precisa de caso marcado.
  const podeIrPara = (n: Etapa) => n === 1 || (n === 2 && !!selectedRun) || (n === 3 && !!selectedRun && casosSelecionados.length > 0);

  const handleSubmit = async () => {
    if (!selectedRun) { toast.error("Selecione uma rodagem"); return; }
    if (outraVm && !vmEscolhida) { toast.error("Escolha a VM nas opções avançadas"); return; }
    if (outraVersao && !versaoEscolhida.trim()) { toast.error("Informe a versão nas opções avançadas"); return; }
    if (!vmPedido) { toast.error("VM não identificada para esta rodagem"); return; }
    if (!versao) { toast.error("Versão ausente na rodagem"); return; }
    if (!casosTesteString) { toast.error("Selecione ao menos um caso de teste"); return; }
    setSubmitting(true);
    try {
      await createRerunRequest({
        vm_name: vmPedido,
        versao,
        casos_teste: casosTesteString,
        paralelo: "",
        ct_desmarcar: ctDesmarcar,
        data_hora: configJsonPreview.data_hora,
        branch: "",
      });
      toast.success("Solicitação enviada", {
        description: "O pedido foi para a fila do Jenkins.",
      });
      setMarcados(new Set());
      setOutraVm(false);
      setVmEscolhida("");
      setOutraVersao(false);
      setVersaoEscolhida("");
      setEtapa(1);
      invalidateRerunRequests();
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: mensagemDaApi(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const copiarJson = (r: RerunRequest) => {
    navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
    toast.success("CONFIG_JSON copiado");
  };

  const contextoRodagem = selectedRun && (
    <span className="text-sm font-normal text-muted-foreground">
      <span className="font-mono">{formatarVm(vmName)}</span> · <span title={selectedRun.versao || ""}>{formatarVersao(selectedRun.versao)}</span>
      {" · "}{nomeModulo(runModulo(selectedRun))} · {formatDateTime(selectedRun.data_inicio)}
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <Link to="/jenkins" className="mb-3 inline-flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Jenkins
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reexecutar rodagens</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Escolha uma rodagem já analisada, marque os casos que quebraram ou deram diferença e peça ao Jenkins para rodar de novo.
        </p>
      </div>

      {!podeSolicitar && <SemPermissao permissao="rodagem" className="mb-5" />}

      {/* Etapas */}
      <nav aria-label="Etapas" className="mb-4">
        <ol className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          {ETAPAS.map(({ n, label }, i) => {
            const atual = etapa === n;
            const feita = n < etapa;
            return (
              <li key={n} className={cn("flex items-center gap-2", i < ETAPAS.length - 1 && "flex-1")}>
                <button
                  type="button"
                  onClick={() => podeIrPara(n) && setEtapa(n)}
                  disabled={!podeIrPara(n)}
                  aria-current={atual ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed",
                    atual ? "font-semibold text-foreground" : "text-muted-foreground enabled:hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      atual && "border-primary bg-primary text-primary-foreground",
                      feita && "border-primary/40 bg-primary/10 text-primary",
                      !atual && !feita && "border-border",
                    )}
                  >
                    {feita ? <Check className="h-3.5 w-3.5" /> : n}
                  </span>
                  {label}
                </button>
                {i < ETAPAS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 1. Rodagem */}
      {etapa === 1 && (
        <Card className="p-4 sm:p-5 mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Escolha a rodagem</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={fVm} onValueChange={setFVm}>
                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Filtrar por VM"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as VMs</SelectItem>
                  {vmOptions.map((v) => <SelectItem key={v} value={v}>{formatarVm(v)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fVersao} onValueChange={setFVersao}>
                <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Filtrar por versão"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas as versões</SelectItem>
                  {versaoOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {moduloOptions.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por módulo">
              {["all", ...moduloOptions].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={fModulo === m}
                  onClick={() => setFModulo(m)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    fModulo === m
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "all" ? "Todos" : nomeModulo(m)}
                </button>
              ))}
            </div>
          )}

          {filteredRuns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma rodagem com os filtros atuais.</p>
          ) : (
            <>
              <div className="hidden px-3 pb-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[20px_130px_64px_minmax(0,180px)_minmax(0,1fr)_auto] sm:gap-3">
                <span /><span>Data</span><span>VM</span><span>Versão</span><span>Módulo</span><span>Falhas</span>
              </div>
              <div role="radiogroup" aria-label="Rodagem" className="space-y-1">
                {runsVisiveis.map((r) => {
                  const sel = r.id_rodagem === selectedRunId;
                  return (
                    <button
                      key={r.id_rodagem}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setSelectedRunId(r.id_rodagem)}
                      onDoubleClick={() => { setSelectedRunId(r.id_rodagem); setEtapa(2); }}
                      className={cn(
                        "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors sm:grid sm:grid-cols-[20px_130px_64px_minmax(0,180px)_minmax(0,1fr)_auto]",
                        sel ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/50",
                      )}
                    >
                      {sel
                        ? <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />}
                      <span className="tabular-nums">{formatDateTime(r.data_inicio)}</span>
                      <span className="font-mono text-xs">{formatarVm(runVm(r)) || "—"}</span>
                      <span className="min-w-0"><VersaoSelo versao={r.versao} /></span>
                      <span className="min-w-0 truncate">{nomeModulo(runModulo(r)) || "—"}</span>
                      <Badge variant="outline" className="ml-auto border-destructive/30 bg-destructive/10 text-destructive sm:ml-0">
                        {r.total_falhas ?? 0} {(r.total_falhas ?? 0) === 1 ? "falha" : "falhas"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              {filteredRuns.length > RODAGENS_VISIVEIS && (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setMostrarTodas((v) => !v)}>
                  <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", mostrarTodas && "rotate-180")} />
                  {mostrarTodas ? "Mostrar menos" : `Mostrar mais ${filteredRuns.length - RODAGENS_VISIVEIS}`}
                </Button>
              )}
            </>
          )}

          {selectedRun && (
            <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">Selecionada:</span>
                <span className="font-mono">{formatarVm(vmName) || "—"}</span>
                <span className="text-muted-foreground">· versão</span>
                <span className="font-mono break-all">{selectedRun.versao || "—"}</span>
                <span className="text-muted-foreground">· {nomeModulo(runModulo(selectedRun)) || "—"} · {formatDateTime(selectedRun.data_inicio)}</span>
                {(selectedRun.modulo_slug || selectedRun.sistema) && (
                  <Link
                    to={`/modulo/${selectedRun.modulo_slug || selectedRun.sistema}?run=${encodeURIComponent(selectedRun.id_rodagem)}&tab=falhas&origem=reexecucao`}
                    className="inline-flex items-center gap-1 text-primary hover:underline sm:ml-auto"
                  >
                    Ver falhas desta rodagem <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {selectedRun.caminho_logs && (
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground" title={selectedRun.caminho_logs}>
                    {selectedRun.caminho_logs}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label="Copiar caminho dos logs"
                    title="Copiar caminho dos logs"
                    onClick={() => { navigator.clipboard.writeText(selectedRun.caminho_logs || ""); toast.success("Caminho copiado"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-border/60 pt-4">
            <Button onClick={() => setEtapa(2)} disabled={!selectedRun} className="max-sm:w-full">
              Escolher casos <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* 2. Casos (tabela no computador, cartoes no celular) */}
      {etapa === 2 && (
        <Card className="mb-8 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 sm:px-5">
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-base font-semibold">Marque os casos para rodar de novo</h2>
              {contextoRodagem}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground max-sm:w-full">Marcar só:</span>
              {TIPOS.map(({ tipo, label, Icon }) => (
                <Button
                  key={tipo}
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!totalPorTipo[tipo]}
                  onClick={() => toggleByTipo(tipo)}
                >
                  <Icon className="h-3.5 w-3.5 mr-1" /> {label} ({totalPorTipo[tipo] || 0})
                </Button>
              ))}
            </div>
          </div>
          {isMobile ? (
            <>
              <div className="flex items-center gap-2 border-b border-border/60 p-3">
                <Checkbox
                  className="h-5 w-5"
                  aria-label="Marcar todos"
                  checked={todosMarcados}
                  disabled={casos.length === 0}
                  onCheckedChange={(v) => toggleAll(!!v)}
                />
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
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Marcar todos"
                    checked={todosMarcados}
                    disabled={casos.length === 0}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
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
                      <TableCell className="max-w-md truncate" title={c.nome_mds || ""}>{c.nome_mds || "—"}</TableCell>
                      <TableCell><TipoBadge tipo={c.tipo_ocorrencia} /></TableCell>
                      <TableCell className="text-xs">{c.grupo || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 p-4 sm:px-5">
            <Button variant="ghost" onClick={() => setEtapa(1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
            <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
              <span className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{casosSelecionados.length}</span> de {casos.length} marcados
              </span>
              <Button onClick={() => setEtapa(3)} disabled={casosSelecionados.length === 0} className="max-sm:w-full">
                Revisar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Confirmacao */}
      {etapa === 3 && selectedRun && (
        <Card className="p-4 sm:p-5 mb-8">
          <h2 className="mb-3 text-base font-semibold">Confirme o pedido</h2>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Resumo label="VM" destaque={outraVm}>
              <span className="font-mono">{formatarVm(vmPedido) || "—"}</span>
              {outraVm && <span className="ml-1 text-xs font-normal">(escolhida)</span>}
            </Resumo>
            <Resumo label="Versão" destaque={outraVersao}>
              <span className="font-mono" title={outraVersao ? versao : selectedRun.versao || ""}>{(outraVersao ? versao : selectedRun.versao) || "—"}</span>
              {outraVersao && <span className="ml-1 text-xs font-normal">(escolhida)</span>}
            </Resumo>
            <Resumo label="Módulo">{nomeModulo(runModulo(selectedRun)) || "—"}</Resumo>
            <Resumo label="Casos">{casosDoPedido.length}</Resumo>
          </div>

          <ul className="mb-4 max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60" aria-label="Casos do pedido">
            {casosDoPedido.map((c) => (
              <li key={c.id} className="flex items-baseline gap-3 px-3 py-1.5 text-sm">
                <span className="shrink-0 font-mono text-xs">{c.id}</span>
                <span className="min-w-0 truncate" title={c.nome}>{c.nome || "—"}</span>
              </li>
            ))}
          </ul>

          <label htmlFor="manter-base" className="mb-3 flex w-fit cursor-pointer select-none items-start gap-2">
            <Checkbox id="manter-base" checked={manterBase} onCheckedChange={(v) => setManterBase(!!v)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Manter base atual</span>
              <span className="block text-xs text-muted-foreground">
                Não restaura nem atualiza a base antes de rodar (desmarca as rotinas <code className="font-mono">[0.4]</code> e{" "}
                <code className="font-mono">[0.5]</code>).
              </span>
            </span>
          </label>

          <Collapsible open={avancadasOpen} onOpenChange={setAvancadasOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", avancadasOpen && "rotate-90")} />
                Opções avançadas
                {trocas.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning/15 px-1.5 text-[10px] text-warning">
                    {outraVm && outraVersao ? "VM e versão trocadas" : outraVm ? "VM trocada" : "versão trocada"}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 space-y-3 pl-5">
                <label htmlFor="outra-vm" className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm">
                  <Checkbox
                    id="outra-vm"
                    checked={outraVm}
                    onCheckedChange={(v) => { setOutraVm(!!v); if (!v) setVmEscolhida(""); }}
                  />
                  Reexecutar casos em uma VM específica
                </label>
                {outraVm && (
                  <Select value={vmEscolhida} onValueChange={setVmEscolhida}>
                    <SelectTrigger className="ml-6 h-9 w-[180px]" aria-label="VM para reexecutar">
                      <SelectValue placeholder="Escolha a VM" />
                    </SelectTrigger>
                    <SelectContent>
                      {outrasVms.map((v) => <SelectItem key={v} value={v}>{formatarVm(v)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <label htmlFor="outra-versao" className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm">
                  <Checkbox
                    id="outra-versao"
                    checked={outraVersao}
                    onCheckedChange={(v) => { setOutraVersao(!!v); if (!v) setVersaoEscolhida(""); }}
                  />
                  Reexecutar casos em outra versão
                </label>
                {outraVersao && (
                  <>
                    <Input
                      value={versaoEscolhida}
                      onChange={(e) => setVersaoEscolhida(e.target.value)}
                      list="versoes-reexecucao"
                      placeholder="Ex.: clientes"
                      aria-label="Versão para reexecutar"
                      className="ml-6 h-9 w-[260px] max-w-[calc(100%-1.5rem)] font-mono text-sm"
                    />
                    <datalist id="versoes-reexecucao">
                      {outrasVersoes.map((v) => <option key={v} value={v} />)}
                    </datalist>
                  </>
                )}
                {trocas.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {trocas.length === 2
                      ? `A VM e a versão mudam no pedido. Os casos continuam os da rodagem da ${formatarVm(vmName) || "VM original"}.`
                      : `Só ${trocas[0]} muda no pedido. ${outraVm ? "Versão" : "VM"} e casos continuam os da rodagem da ${formatarVm(vmName) || "VM original"}.`}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="mt-2">
            <CollapsibleTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", previewOpen && "rotate-90")} />
                Configuração técnica enviada
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto">
{JSON.stringify(configJsonPreview, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <Button variant="ghost" onClick={() => setEtapa(2)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
            <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
              <span className="text-xs text-muted-foreground">
                {outraVm && !vmEscolhida
                  ? <span className="text-warning">Escolha a VM nas opções avançadas.</span>
                  : outraVersao && !versao
                    ? <span className="text-warning">Informe a versão nas opções avançadas.</span>
                    : <>
                        Vai rodar na{" "}
                        <span className={cn("font-mono font-semibold", outraVm ? "text-warning" : "text-foreground")}>{formatarVm(vmPedido)}</span>
                        {outraVersao
                          ? <>, versão <span className="font-mono font-semibold text-warning">{versao}</span></>
                          : outraVm ? " (escolhida)" : " (a da rodagem)"}
                      </>}
              </span>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting || !podeSolicitar}
                className="max-sm:w-full"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {submitting ? "Enviando…" : `Rodar ${casosDoPedido.length} ${casosDoPedido.length === 1 ? "caso" : "casos"} de novo`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Collapsible>
        <div className="mb-3 flex items-center justify-between max-sm:flex-wrap max-sm:gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group -ml-2">
              <ChevronDown className="h-4 w-4 mr-1 transition-transform group-data-[state=open]:rotate-180" />
              <h2 className="text-base sm:text-lg font-semibold">Histórico de reexecuções</h2>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Card className="overflow-hidden">
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma solicitação ainda.</p>
            ) : isMobile ? (
              <ul className="divide-y divide-border/60">
                {historyDaPagina.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, className: "" };
                  const total = totalCasosDoPedido(r.casos_teste);
                  return (
                    <li key={r.id} className="space-y-1.5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs">{formatDateTime(r.created_at)}</span>
                        <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                      </div>
                      <p className="text-sm">
                        <span className="font-mono">{formatarVm(r.vm_name)}</span> · {moduloDoPedido(r)} · <span title={r.versao}>{formatarVersao(r.versao)}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground" title={r.casos_teste}>
                        {total} {total === 1 ? "caso" : "casos"}
                        {r.jenkins_build_number && <> · build <span className="font-mono">#{r.jenkins_build_number}</span></>}
                      </p>
                      {r.erro && <p className="break-words text-[11px] text-red-400">{r.erro}</p>}
                      <div className="flex gap-2">
                        {(r.jenkins_url || r.jenkins_queue_url) && (
                          <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                            <a href={r.jenkins_url || r.jenkins_queue_url || ""} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Jenkins
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => copiarJson(r)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar JSON
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>VM</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jenkins</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyDaPagina.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, className: "" };
                  const total = totalCasosDoPedido(r.casos_teste);
                  const linkJenkins = r.jenkins_url || r.jenkins_queue_url;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap" title={new Date(r.created_at).toLocaleString("pt-BR")}>{formatDateTime(r.created_at)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatarVm(r.vm_name)}</TableCell>
                      <TableCell className="text-xs">{moduloDoPedido(r)}</TableCell>
                      <TableCell className="text-xs" title={r.versao}>{formatarVersao(r.versao) || "—"}</TableCell>
                      <TableCell className="max-w-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground" title={r.casos_teste}>
                            {total} {total === 1 ? "caso" : "casos"}
                          </span>
                        </div>
                        {r.erro && <p className="mt-1 truncate text-xs text-red-400" title={r.erro}>{r.erro}</p>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {linkJenkins ? (
                          <a href={linkJenkins} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            {r.jenkins_build_number ? <span className="font-mono">#{r.jenkins_build_number}</span> : "Fila"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : r.jenkins_build_number ? <span className="font-mono">#{r.jenkins_build_number}</span> : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Copiar CONFIG_JSON"
                          title="Copiar CONFIG_JSON"
                          onClick={() => copiarJson(r)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
          </Card>
          <div className="mt-3">
            <Paginacao page={historyPaginaAtual} pageSize={HISTORICO_POR_PAGINA} total={history.length} onChange={setHistoryPage} />
          </div>
        </CollapsibleContent>
      </Collapsible>
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
