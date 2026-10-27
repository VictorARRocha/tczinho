import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SemPermissao } from "@/components/SemPermissao";
import { SelectBusca } from "@/components/SelectBusca";
import { EtapasNav } from "@/components/EtapasNav";
import { useFocoNaEtapa } from "@/hooks/usePainel";
import { usePermissao } from "@/hooks/use-permissao";
import { useAuth } from "@/contexts/AuthContext";
import { mensagemDaApi } from "@/lib/apiErro";
import { nomeModulo, podeNoModulo } from "@/lib/permissoes";
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
import { invalidateRerunRequests, useAllRuns } from "@/services/queries";
import { JenkinsHistory } from "@/components/JenkinsHistory";
import { TIPO_COR, TipoBadge as SeloTipo } from "./module/common";
import { useIsMobile } from "@/hooks/use-mobile";

/** Historico desta tela: so os pedidos de reexecucao (os antigos, sem tipo, continuam aparecendo). */
const soReexecucoes = (r: RerunRequest) => r.tipo_solicitacao !== "rodagem_completa";

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

/** Mesmo selo de tipo das telas do modulo (TIPO_COR); "outro" fica neutro. */
function TipoBadge({ tipo }: { tipo: CasoReexecutavel["tipo_ocorrencia"] }) {
  if (tipo in TIPO_COR) return <SeloTipo tipo={tipo as keyof typeof TIPO_COR} />;
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
  const tituloEtapa = useFocoNaEtapa(etapa);
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
  // A rodagem leva o nome da branch instalada (PRE-CLIENTES), mas o Gerenciador so conhece "pre-cliente".
  const versao = (outraVersao ? versaoEscolhida.trim().toLowerCase() : versaoDaRodagem).replace(/^pre-clientes$/, "pre-cliente");
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
    // Financeiro usa base propria: o mod_xml ja tira [0.4]/[0.5], mas so marca o [5.0] (Configura base) se ele vier no pedido.
    if (!manterBase && ids.some((id) => id.startsWith("5."))) ids.unshift("5.0");
    return ids.map((id) => `[${id}]`).join(", ");
  }, [casosSelecionados, manterBase]);
  const financeiro = casosSelecionados.some((c) => (c.id_caso_teste || "").trim().startsWith("5."));
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
      toast.success("Pedido enviado", {
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

  // Lista de rodagens como grupo de opcoes: uma parada de Tab so (a escolhida) e setas para andar.
  const moverRodagem = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!passo && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const total = runsVisiveis.length;
    const destino = e.key === "Home" ? 0 : e.key === "End" ? total - 1 : (indice + passo + total) % total;
    setSelectedRunId(runsVisiveis[destino].id_rodagem);
    const grupo = e.currentTarget.parentElement;
    requestAnimationFrame(() => (grupo?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[destino])?.focus());
  };
  const indiceSelecionada = Math.max(0, runsVisiveis.findIndex((r) => r.id_rodagem === selectedRunId));

  const contextoRodagem = selectedRun && (
    <span className="text-sm font-normal text-muted-foreground">
      <span className="font-mono">{formatarVm(vmName)}</span> · <span title={selectedRun.versao || ""}>{formatarVersao(selectedRun.versao)}</span>
      {" · "}{nomeModulo(runModulo(selectedRun))} · {formatDateTime(selectedRun.data_inicio)}
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <Link to="/jenkins" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0 md:py-1">
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
      <EtapasNav etapas={ETAPAS} atual={etapa} podeIrPara={podeIrPara} onIr={setEtapa} />

      {/* 1. Rodagem */}
      {etapa === 1 && (
        <Card className="p-4 sm:p-5 mb-8 animate-fade-in">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 ref={tituloEtapa} tabIndex={-1} className="text-base font-semibold focus:outline-none">Escolha a rodagem</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={fVm} onValueChange={setFVm}>
                <SelectTrigger className="h-11 w-[150px] text-xs md:h-8" aria-label="Filtrar por VM"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as VMs</SelectItem>
                  {vmOptions.map((v) => <SelectItem key={v} value={v}>{formatarVm(v)}</SelectItem>)}
                </SelectContent>
              </Select>
              <SelectBusca
                className="h-11 w-[200px] text-xs md:h-8" ariaLabel="Filtrar por versão" value={fVersao} onChange={setFVersao}
                opcoes={[{ valor: "all", rotulo: "Todas as versões" }, ...versaoOptions.map((v) => ({ valor: v, rotulo: v }))]}
                buscaPlaceholder="Buscar versão…" vazio="Nenhuma versão encontrada."
              />
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
                    "min-h-11 rounded-full border px-3 py-1 text-xs transition-[color,background-color,border-color,transform] duration-150 ease-out-strong active:scale-[0.97] md:min-h-0",
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
                {runsVisiveis.map((r, i) => {
                  const sel = r.id_rodagem === selectedRunId;
                  return (
                    <button
                      key={r.id_rodagem}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      tabIndex={i === indiceSelecionada ? 0 : -1}
                      onKeyDown={(e) => moverRodagem(e, i)}
                      onClick={() => setSelectedRunId(r.id_rodagem)}
                      onDoubleClick={() => { setSelectedRunId(r.id_rodagem); setEtapa(2); }}
                      className={cn(
                        "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-150 ease-out-strong active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid sm:grid-cols-[20px_130px_64px_minmax(0,180px)_minmax(0,1fr)_auto]",
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
                <Button variant="ghost" size="sm" className="mt-1 h-11 md:h-9" aria-expanded={mostrarTodas} onClick={() => setMostrarTodas((v) => !v)}>
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
                    className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline sm:ml-auto md:min-h-0"
                  >
                    Ver falhas desta rodagem <ExternalLink className="h-3 w-3" aria-hidden />
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
                    className="h-11 w-11 shrink-0 md:h-7 md:w-7"
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
        <Card className="mb-8 overflow-hidden animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 sm:px-5">
            <div className="min-w-0 space-y-0.5">
              <h2 ref={tituloEtapa} tabIndex={-1} className="text-base font-semibold focus:outline-none">Marque os casos para rodar de novo</h2>
              {contextoRodagem}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground max-sm:w-full">Marcar só:</span>
              {TIPOS.map(({ tipo, label, Icon }) => (
                <Button
                  key={tipo}
                  size="sm"
                  variant="outline"
                  className="h-11 md:h-8"
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
                  <SelectTrigger className="h-11 flex-1 text-xs" aria-label="Ordenar por"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                      <SelectItem key={k} value={k}>Ordenar por {SORT_LABEL[k]!.toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" className="h-11 w-11 shrink-0"
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
                            aria-label={`Marcar ${c.id_caso_teste || "caso sem ID"} ${c.nome_mds || ""}`.trim()}
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
                          aria-label={`Marcar ${c.id_caso_teste || "caso sem ID"} ${c.nome_mds || ""}`.trim()}
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
              <span className="text-sm text-muted-foreground" role="status">
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
        <Card className="p-4 sm:p-5 mb-8 animate-fade-in">
          <h2 ref={tituloEtapa} tabIndex={-1} className="mb-3 text-base font-semibold focus:outline-none">Confirme o pedido</h2>
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
                {financeiro ? (
                  <>Não restaura nem atualiza a base antes de rodar (não inclui o grupo <code className="font-mono">[5.0]</code> Configura base).</>
                ) : (
                  <>
                    Não restaura nem atualiza a base antes de rodar (desmarca as rotinas <code className="font-mono">[0.4]</code> e{" "}
                    <code className="font-mono">[0.5]</code>).
                  </>
                )}
              </span>
            </span>
          </label>

          <Collapsible open={avancadasOpen} onOpenChange={setAvancadasOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:min-h-0">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out-strong", avancadasOpen && "rotate-90")} aria-hidden />
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
              <button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:min-h-0">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out-strong", previewOpen && "rotate-90")} aria-hidden />
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

      {/* Historico: o mesmo da Rodagem completa (status, cores, cancelar), so com as reexecucoes. */}
      <JenkinsHistory title="Histórico de reexecuções" filtro={soReexecucoes} />
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
