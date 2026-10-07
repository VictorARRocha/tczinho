import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeftRight, ArrowRight, CheckCircle2, ChevronsUpDown, GitMerge, Loader2, Plus, RotateCcw, X, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissao } from "@/hooks/use-permissao";
import { SemPermissao } from "@/components/SemPermissao";
import { cancelMerge, createMerge, type MergePedido, type SvnBranch } from "@/services/data";
import { ApiError } from "@/services/data/apiSource";
import { invalidateMerges, useMergeBranches, useMerges } from "@/services/queries";
import {
  combinaBusca, dataCurta, MERGE_CANCELAVEL, MERGE_EM_ANDAMENTO, mensagemPadrao, mergeStatus, ordenarBranches, TIPO_CONFLITO,
} from "@/lib/merge";

function apiMessage(e: unknown): string {
  if (e instanceof ApiError && e.detail) return e.detail;
  return (e as Error)?.message || "Erro desconhecido";
}

interface Linha {
  id: number;
  origem: string;
  destino: string;
  /** Mensagem do commit; enquanto nao editada, acompanha a padrao (origem e destino escolhidos). */
  mensagem: string;
  editada: boolean;
}

/** Ate quantos pedidos ficam abertos ao mesmo tempo (os mais recentes). */
const MAX_ABERTOS = 10;

export default function MergeBranches() {
  const { isAdmin, profile } = useAuth();
  const podeMerge = usePermissao("merge");
  const isMobile = useIsMobile();
  const { data: branchData, isLoading: loadingBranches } = useMergeBranches();
  const { data: merges = [] } = useMerges();
  const branches = useMemo(() => ordenarBranches(branchData?.branches || []), [branchData]);
  const trunk = branches.find((b) => b.kind === "trunk") || null;

  const proximoId = useRef(2);
  const novaLinha = (origem: string): Linha => ({ id: proximoId.current++, origem, destino: "", mensagem: "", editada: false });
  const [linhas, setLinhas] = useState<Linha[]>([{ id: 1, origem: "", destino: "", mensagem: "", editada: false }]);
  const [confirmaTrunk, setConfirmaTrunk] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [abertosIds, setAbertosIds] = useState<string[]>([]);
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  // Origem padrao: a principal (Unico), assim que a lista chega.
  useEffect(() => {
    if (trunk) setLinhas((prev) => (prev.some((l) => !l.origem) ? prev.map((l) => (l.origem ? l : { ...l, origem: trunk.url })) : prev));
  }, [trunk]);

  const nomeDe = (url: string) => branches.find((b) => b.url === url)?.name || "";
  const mensagemDe = (l: Linha) => (l.editada ? l.mensagem : mensagemPadrao(nomeDe(l.origem), nomeDe(l.destino)));

  const setLinha = (id: number, campos: Partial<Linha>) => setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, ...campos } : l)));
  const adicionarLinha = () => setLinhas((prev) => [...prev, novaLinha(prev[prev.length - 1]?.origem || trunk?.url || "")]);
  const removerLinha = (id: number) => setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));

  const chave = (l: Pick<Linha, "origem" | "destino">) => l.origem + " > " + l.destino;
  const repetidas = new Set(linhas.map(chave).filter((k, i, all) => all.indexOf(k) !== i));
  const linhaValida = (l: Linha) => !!l.origem && !!l.destino && l.origem !== l.destino && !repetidas.has(chave(l)) && !!mensagemDe(l).trim();
  const temTrunk = linhas.some((l) => l.destino && l.destino === trunk?.url);
  const podeFazer = podeMerge && linhas.length > 0 && linhas.every(linhaValida) && (!temTrunk || confirmaTrunk) && !enviando;

  // Abre sozinho so o que a pessoa ainda tem na fila/em andamento; continua aberto ate o fim nesta visita.
  // Merges ja terminados nao abrem ao voltar para a tela: o resultado fica no historico.
  useEffect(() => {
    const andamento = merges.filter((m) => m.requested_by === profile?.username && MERGE_EM_ANDAMENTO.has(m.status) && !fechados.has(m.id));
    if (andamento.length) setAbertosIds((prev) => [...prev, ...andamento.map((m) => m.id).filter((id) => !prev.includes(id))]);
  }, [merges, fechados, profile?.username]);

  // Pedidos abertos: os pedidos agora nesta visita + os que estavam em andamento.
  const abertos = useMemo(() => abertosIds
    .map((id) => merges.find((m) => m.id === id))
    .filter((m): m is MergePedido => !!m && !fechados.has(m.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ABERTOS), [merges, abertosIds, fechados]);

  const abrir = (id: string) => {
    setFechados((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setAbertosIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
  };
  const fechar = (id: string) => {
    setFechados((prev) => new Set(prev).add(id));
    setAbertosIds((prev) => prev.filter((x) => x !== id));
  };

  /** Um botao so: pede todos os merges direto (sem previa); o MergeBridge faz um de cada vez. */
  const fazerMerges = async () => {
    setEnviando(true);
    const falhas: Linha[] = [];
    let criados = 0;
    for (const linha of linhas) {
      try {
        const criado = await createMerge({
          source_url: linha.origem,
          target_url: linha.destino,
          direto: true,
          // Sem edicao, o MergeBridge grava a mensagem padrao com a lista de revisoes que entraram.
          mensagem: linha.editada ? linha.mensagem : undefined,
          confirma_trunk: linha.destino === trunk?.url ? confirmaTrunk : undefined,
        });
        abrir(criado.id);
        criados += 1;
      } catch (e) {
        falhas.push(linha);
        toast.error(`Não foi possível pedir o merge ${nomeDe(linha.origem)} → ${nomeDe(linha.destino)}`, { description: apiMessage(e) });
      }
    }
    if (criados) {
      toast.success(criados > 1 ? `${criados} merges solicitados` : "Merge solicitado", {
        description: "O MergeBridge da D01 faz um de cada vez. Se algum tiver conflito, só ele é barrado.",
      });
    }
    // Ficam na lista so as linhas que falharam (para corrigir e tentar de novo).
    setLinhas(falhas.length ? falhas : [novaLinha(trunk?.url || "")]);
    setConfirmaTrunk(false);
    await invalidateMerges();
    setEnviando(false);
  };

  const rotuloBotao = linhas.length > 1
    ? `Fazer os ${linhas.length} merges`
    : `Fazer merge de ${nomeDe(linhas[0]?.origem || "") || "…"} → ${nomeDe(linhas[0]?.destino || "") || "…"}`;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <GitMerge className="h-3 w-3" /> Merge de branches
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
          Merge de <span className="gradient-text">branches</span>
        </h1>
      </div>

      {/* Novos merges */}
      <Card className="glass-card backdrop-filter-none p-4 sm:p-5 mb-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Novo merge</h2>
        <div className="space-y-4">
          {linhas.map((linha, index) => (
            <div key={linha.id} className={linhas.length > 1 ? "rounded-lg border border-border/60 p-3" : ""}>
              {linhas.length > 1 && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Merge {index + 1}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => removerLinha(linha.id)}
                    aria-label={`Remover merge ${index + 1}`}>
                    <X className="h-3.5 w-3.5 mr-1" /> Remover
                  </Button>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
                <BranchPicker label={index === 0 ? "Origem (de onde vêm as alterações)" : `Origem do merge ${index + 1}`} branches={branches}
                  value={linha.origem} onChange={(v) => setLinha(linha.id, { origem: v })} placeholder="Escolha a origem" loading={loadingBranches} />
                <Button
                  type="button" variant="outline" size="icon" className="justify-self-center md:mb-0.5"
                  aria-label={index === 0 ? "Inverter origem e destino" : `Inverter origem e destino do merge ${index + 1}`}
                  title="Inverter origem e destino" disabled={!linha.origem && !linha.destino}
                  onClick={() => setLinha(linha.id, { origem: linha.destino, destino: linha.origem })}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
                <BranchPicker label={index === 0 ? "Destino (branch que será atualizada)" : `Destino do merge ${index + 1}`} branches={branches}
                  value={linha.destino} onChange={(v) => setLinha(linha.id, { destino: v })} placeholder="Escolha a branch de destino" loading={loadingBranches} />
              </div>
              {linha.destino && linha.origem === linha.destino && <p className="mt-2 text-xs text-red-500">Origem e destino precisam ser diferentes.</p>}
              {linha.destino && linha.origem !== linha.destino && repetidas.has(chave(linha)) && (
                <p className="mt-2 text-xs text-red-500">Este merge está repetido na lista.</p>
              )}
              {linha.destino && linha.destino === trunk?.url && linha.origem !== linha.destino && (
                <p className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  O destino é a {trunk.name} (principal): o merge altera a base usada por todos.
                </p>
              )}
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {linhas.length > 1 ? `Mensagem do commit do merge ${index + 1}` : "Mensagem do commit"}
                  </span>
                  {linha.editada && (
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setLinha(linha.id, { editada: false, mensagem: "" })}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Restaurar padrão
                    </Button>
                  )}
                </div>
                <Textarea
                  aria-label={linhas.length > 1 ? `Mensagem do commit do merge ${index + 1}` : "Mensagem do commit"}
                  value={mensagemDe(linha)} spellCheck={false} maxLength={4000} rows={2}
                  onChange={(e) => setLinha(linha.id, { mensagem: e.target.value, editada: true })}
                  className="min-h-[60px] font-mono text-xs"
                />
                {!linha.editada && (
                  <p className="text-[11px] text-muted-foreground">Sem edição, o commit leva também quem pediu e a lista de revisões que entraram.</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {!loadingBranches && branches.length === 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            O MergeBridge da D01 ainda não enviou a lista de branches. Confira se a tarefa "AgenteTC - MergeBridge" está rodando.
          </p>
        )}
        {temTrunk && (
          <label className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm cursor-pointer">
            <Checkbox checked={confirmaTrunk} onCheckedChange={(v) => setConfirmaTrunk(v === true)} className="mt-0.5" aria-label="Confirmo alterar a principal" />
            <span><strong>Entendo que vou alterar a {trunk?.name || "principal"}</strong> (principal), que é a base de todas as branches.</span>
          </label>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={adicionarLinha} disabled={branches.length === 0} className="max-sm:w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar merge
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {branchData?.updated_at ? `Lista de branches atualizada em ${dataCurta(branchData.updated_at)}` : ""}
            </span>
          </div>
          <Button className="bg-gradient-primary max-sm:w-full" disabled={!podeFazer} onClick={fazerMerges}>
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitMerge className="h-4 w-4 mr-2" />}
            {rotuloBotao}
          </Button>
        </div>
        {!podeMerge && <SemPermissao permissao="merge" className="mt-3 sm:justify-end" />}
      </Card>

      {abertos.map((m) => (
        <PedidoPainel
          key={m.id}
          pedido={m}
          podeCancelar={podeMerge && MERGE_CANCELAVEL.has(m.status) && (isAdmin || m.requested_by === profile?.username)}
          onFechar={() => fechar(m.id)}
        />
      ))}

      {/* Historico */}
      <h2 className="mb-3 text-base sm:text-lg font-semibold">Histórico de merges</h2>
      <Card className="glass-card backdrop-filter-none overflow-hidden">
        {merges.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum merge ainda.</p>
        ) : isMobile ? (
          <ul className="divide-y divide-border/60">
            {merges.map((m) => (
              <li key={m.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs">{dataCurta(m.created_at)}</span>
                  <ResultadoBadge pedido={m} />
                </div>
                <p className="break-all text-sm">{m.source_name} <ArrowRight className="inline h-3 w-3" /> {m.target_name}</p>
                <p className="text-[11px] text-muted-foreground">{m.requested_by || "—"}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Origem → destino</TableHead>
                  <TableHead>Solicitado por</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merges.map((m) => (
                  <TableRow key={m.id} className={abertos.some((a) => a.id === m.id) ? "bg-primary/5" : ""}>
                    <TableCell className="text-xs">{dataCurta(m.created_at)}</TableCell>
                    <TableCell className="text-xs">
                      {m.source_name} <ArrowRight className="inline h-3 w-3 text-muted-foreground" /> <strong>{m.target_name}</strong>
                    </TableCell>
                    <TableCell className="text-xs">{m.requested_by || "—"}</TableCell>
                    <TableCell><ResultadoBadge pedido={m} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Resultado no historico: "Merge realizado", "Conflito" (ou o andamento/erro). */
function ResultadoBadge({ pedido }: { pedido: MergePedido }) {
  const meta = mergeStatus(pedido);
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

/* ---------------------------------------------------------------- seletor de branch */

function BranchPicker({ label, branches, value, onChange, placeholder, loading }: {
  label: string; branches: SvnBranch[]; value: string; onChange: (url: string) => void; placeholder: string; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);
  const atual = branches.find((b) => b.url === value) || null;
  const visiveis = branches.filter((b) => combinaBusca(b.name, busca));
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setBusca(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-label={label} className="w-full justify-between font-normal">
            <span className="truncate">
              {atual ? atual.name : loading ? "Carregando branches…" : placeholder}
              {atual?.kind === "trunk" && <span className="ml-2 text-[10px] text-muted-foreground">principal</span>}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 max-sm:w-[calc(100vw-2rem)]"
          // Abre ja digitando na busca (o Radix focaria a caixa da lista).
          onOpenAutoFocus={(e) => { e.preventDefault(); buscaRef.current?.focus(); }}
        >
          <div className="border-b border-border p-2">
            <Input
              ref={buscaRef} placeholder="Buscar branch… (Enter escolhe a primeira)" value={busca} className="h-9" aria-label="Buscar branch"
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visiveis[0]) { e.preventDefault(); onChange(visiveis[0].url); setOpen(false); setBusca(""); }
              }}
            />
          </div>
          <div className="max-h-72 overflow-auto p-1" role="listbox" aria-label={label}>
            {visiveis.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma branch encontrada.</p>}
            {visiveis.map((b) => (
              <button
                key={b.url} type="button" role="option" aria-selected={b.url === value}
                onClick={() => { onChange(b.url); setOpen(false); setBusca(""); }}
                className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-secondary/60 ${b.url === value ? "bg-primary/10" : ""}`}
              >
                <span className="text-sm">
                  {b.name}
                  {b.kind === "trunk" && <span className="ml-2 rounded border border-border px-1 text-[9px] text-muted-foreground">principal</span>}
                </span>
                {(b.last_revision || b.last_author) && (
                  <span className="text-[10px] text-muted-foreground">
                    última alteração r{b.last_revision} · {b.last_author || "—"} · {dataCurta(b.last_date)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ---------------------------------------------------------------- acompanhamento do pedido */

function PedidoPainel({ pedido, podeCancelar, onFechar }: { pedido: MergePedido; podeCancelar: boolean; onFechar: () => void }) {
  const meta = mergeStatus(pedido);
  const isTrunk = pedido.target_kind === "trunk";

  const cancelar = async () => {
    if (!window.confirm("Cancelar este merge?")) return;
    try {
      await cancelMerge(pedido.id);
      toast.success("Merge cancelado");
      await invalidateMerges();
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: apiMessage(e) });
    }
  };

  const conflitos = pedido.result_json?.conflitos?.length ? pedido.result_json.conflitos : pedido.preview_json?.conflitos || [];

  return (
    <Card className="glass-card backdrop-filter-none p-4 sm:p-5 mb-5 space-y-3" aria-label="Merge aberto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold break-all">
            {pedido.source_name} <ArrowRight className="inline h-4 w-4 text-muted-foreground" /> {pedido.target_name}
            {isTrunk && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-700 dark:text-amber-400">principal</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground">Pedido por {pedido.requested_by || "—"} em {dataCurta(pedido.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
          <Button size="sm" variant="ghost" onClick={onFechar}>Fechar</Button>
        </div>
      </div>

      {MERGE_EM_ANDAMENTO.has(pedido.status) && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {pedido.status === "processando" || pedido.status === "previa_processando"
            ? "O MergeBridge está atualizando a origem, fazendo o merge e o commit."
            : "Na fila do MergeBridge (ele faz um merge de cada vez)."}
        </p>
      )}

      {pedido.status === "concluido" && (
        <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" /> Merge gravado em {pedido.target_name} na revisão <span className="font-mono">r{pedido.svn_revision}</span>.
        </p>
      )}
      {pedido.status === "sem_alteracoes" && (
        <p className="text-sm text-muted-foreground">{pedido.error_message || "O destino já está atualizado; não há o que fazer."}</p>
      )}
      {pedido.status === "erro" && (
        <p className={`text-sm ${pedido.result_json?.simulacao ? "text-muted-foreground" : "text-red-500"}`}>{pedido.error_message}</p>
      )}
      {pedido.status === "conflito" && <ConflitoMerge conflitos={conflitos} />}

      {podeCancelar && (
        <Button variant="outline" size="sm" className="text-red-500" onClick={cancelar}>
          <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
      )}
    </Card>
  );
}

function ConflitoMerge({ conflitos }: { conflitos: { caminho: string; tipo: string }[] }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 sm:p-4 text-sm space-y-2">
      <p className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Conflito: faça o merge manualmente
      </p>
      <p className="text-xs text-muted-foreground">
        Os arquivos abaixo foram alterados nas duas branches. Para não sobrescrever o trabalho de ninguém, <strong>nada foi gravado</strong> neste merge.
      </p>
      {conflitos.length > 0 && (
        <ul className="rounded-md border border-red-500/30 bg-background/60 px-3 py-2 text-xs space-y-1">
          {conflitos.map((c) => (
            <li key={c.caminho} className="break-all">
              <span className="font-mono">{c.caminho}</span>
              <span className="ml-2 text-muted-foreground">({TIPO_CONFLITO[c.tipo] || c.tipo})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
