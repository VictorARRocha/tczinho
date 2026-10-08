// Aba Casos de teste: a arvore do .mds do modulo (grupos e casos), com busca, o que falhou na rodagem aberta
// e os casos marcados aqui como desativados (so visual: o nome fica riscado).
import { createContext, useContext, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, FolderClosed, FolderOpen, Search, X } from "lucide-react";
import { toast } from "sonner";
import { desativarCaso, reativarCaso, type CasoDesativado, type TestcaseHierarchyNode } from "@/services/data";
import { invalidateCasosDesativados, useCasosDesativados } from "@/services/queries";
import type { Falha } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModulos, usePermissao } from "@/hooks/use-permissao";
import { mensagemDaApi } from "@/lib/apiErro";
import { formatDateTime } from "@/lib/format";
import { modulosDosCasos } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import { extractCaseIdParts } from "./FalhasTab";
import { Empty } from "./common";

const MAX_RESULTADOS = 200;
const MAX_MOTIVO = 300;

interface No {
  id: string;
  nome: string;
  descricao: string;
  codigo: string; // codigo do caso de teste no Kanboard ("" = nao informado)
  grupo: boolean;
  caminho: string[]; // nomes dos grupos acima (sem o modulo)
  filhos: No[];
  casos: number; // casos dentro (o proprio, se for caso)
  falhas: number; // casos dentro que falharam na rodagem aberta
}

const compararIds = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Monta a arvore; o no do proprio modulo ("[2] Fiscal") some e os grupos dele viram o primeiro nivel. */
function montarArvore(nodes: TestcaseHierarchyNode[], falhasPorCaso: Map<string, Falha[]>): No[] {
  const porId = new Map<string, No>();
  for (const n of nodes) {
    if (!n.node_id || porId.has(n.node_id)) continue;
    porId.set(n.node_id, {
      id: n.node_id, nome: n.node_name || "", descricao: (n.descricao || "").trim(), codigo: codigoDoCaso(n),
      grupo: n.node_type === "grupo", caminho: [], filhos: [], casos: 0, falhas: 0,
    });
  }
  const raizes: No[] = [];
  for (const n of nodes) {
    const no = porId.get(n.node_id);
    const pai = n.parent_node_id ? porId.get(n.parent_node_id) : undefined;
    if (!no) continue;
    if (pai && pai !== no) { if (!pai.filhos.includes(no)) pai.filhos.push(no); } else if (!raizes.includes(no)) raizes.push(no);
  }
  const contar = (no: No, caminho: string[]) => {
    no.caminho = caminho;
    no.filhos.sort((a, b) => compararIds(a.id, b.id));
    if (!no.grupo && !no.filhos.length) {
      no.casos = 1;
      no.falhas = falhasPorCaso.has(no.id) ? 1 : 0;
      return;
    }
    no.grupo = true;
    for (const f of no.filhos) {
      contar(f, [...caminho, no.nome]);
      no.casos += f.casos;
      no.falhas += f.falhas;
    }
  };
  raizes.sort((a, b) => compararIds(a.id, b.id));
  // O no do codigo do modulo ([2], ou [3]/[4]/[7] no Contabil) e pastas unicas logo abaixo dele
  // (ex.: [3] > [3.1] Contabil) so repetem o nome do modulo: o primeiro nivel ja sao os grupos de dentro.
  const desembrulhar = (r: No): No[] => {
    let atual = r.id.includes(".") ? [r] : r.filhos;
    while (atual.length === 1 && atual[0].filhos.length && semAcento(atual[0].nome) === semAcento(r.nome)) atual = atual[0].filhos;
    return atual;
  };
  const nivel = raizes.flatMap(desembrulhar);
  nivel.forEach((n) => contar(n, []));
  return nivel.sort((a, b) => compararIds(a.id, b.id));
}

/** Cartao do caso no Kanboard. O numero da sprint na URL nao importa (qualquer valor abre o cartao). */
const linkKanboard = (codigo: string) => `https://kanboard.sci.com.br/sprint/0/solicitacao/${codigo}`;

const CODIGO_NO_INICIO = /^\s*#\s?(\d{4,})/;

/** Codigo do caso: o "#codigo" no inicio da descricao (o padrao) ou, sem ele, o final do nome da
 *  procedure (pConsultaFeriado_245993), que bate com a descricao em quase todos os casos. */
function codigoDoCaso(n: TestcaseHierarchyNode): string {
  return (n.descricao || "").match(CODIGO_NO_INICIO)?.[1] || (n.procedure_name || "").match(/(?:^|_)(\d{4,})$/)?.[1] || "";
}

/** Descricao com os "#numeros" do meio do texto (outros chamados citados) como links do Kanboard. */
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(#\s?\d{4,})/g);
  return (
    <>
      {partes.map((parte, i) => {
        const codigo = parte.match(/^#\s?(\d{4,})$/)?.[1];
        return codigo ? (
          <a key={i} href={linkKanboard(codigo)} target="_blank" rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline">#{codigo}</a>
        ) : parte;
      })}
    </>
  );
}

function copiarId(id: string) {
  navigator.clipboard?.writeText(`[${id}]`).then(
    () => toast.success(`[${id}] copiado`),
    () => toast.error("Não foi possível copiar"),
  );
}

/** O que as linhas precisam sem passar de mao em mao pela arvore. */
interface Acoes {
  abrirFalha: (no: No) => void;
  desativado: (id: string) => CasoDesativado | undefined;
  podeMarcar: (id: string) => boolean;
  desativar: (id: string, motivo: string) => Promise<boolean>;
  reativar: (id: string) => void;
}
const AcoesCtx = createContext<Acoes | null>(null);
const useAcoes = () => useContext(AcoesCtx) as Acoes;

export function CasosTab({ moduloSlug, hierarchy, falhas, onSelect }: {
  moduloSlug: string;
  hierarchy: TestcaseHierarchyNode[];
  falhas: Falha[];
  onSelect: (f: Falha) => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"" | "falhas" | "desativados">("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { data: listaDesativados = [] } = useCasosDesativados(moduloSlug);
  const podeRodar = usePermissao("rodagem");
  const acessoModulos = useModulos();

  const falhasPorCaso = useMemo(() => {
    const mapa = new Map<string, Falha[]>();
    for (const f of falhas) {
      const id = extractCaseIdParts(f.id_caso_teste)?.join(".");
      if (id) mapa.set(id, [...(mapa.get(id) || []), f]);
    }
    return mapa;
  }, [falhas]);
  const desativados = useMemo(() => new Map(listaDesativados.map((d) => [d.node_id, d])), [listaDesativados]);

  const arvore = useMemo(() => montarArvore(hierarchy, falhasPorCaso), [hierarchy, falhasPorCaso]);
  const casos = useMemo(() => {
    const lista: No[] = [];
    const visitar = (n: No) => (n.grupo ? n.filhos.forEach(visitar) : lista.push(n));
    arvore.forEach(visitar);
    return lista;
  }, [arvore]);
  const estaDesativado = (c: No) => desativados.has(c.id);
  const totalFalhas = useMemo(() => casos.filter((c) => c.falhas).length, [casos]);
  const totalDesativados = casos.filter(estaDesativado).length;

  const termo = semAcento(busca.trim()).replace(/^\[|\]$/g, "");
  const filtrando = !!termo || !!filtro;
  const resultados = !filtrando ? [] : casos.filter((c) =>
    (filtro !== "falhas" || c.falhas) && (filtro !== "desativados" || estaDesativado(c)) && (!termo
      || c.id === termo || c.id.startsWith(termo + ".")
      || semAcento(`${c.nome} ${c.descricao} #${c.codigo} ${desativados.get(c.id)?.reason || ""}`).includes(termo)));

  const acoes: Acoes = {
    abrirFalha: (no) => {
      const f = falhasPorCaso.get(no.id)?.[0];
      if (f) onSelect(f);
    },
    desativado: (id) => desativados.get(id),
    // Quem pode pedir rodagem no modulo do caso (rotina geral [0.x]: so quem tem todos os modulos).
    podeMarcar: (id) => podeRodar && (acessoModulos.todos || acessoModulos.pode(modulosDosCasos(`[${id}]`)[0])),
    desativar: async (id, motivo) => {
      try {
        await desativarCaso(id, motivo);
        await invalidateCasosDesativados(moduloSlug);
        toast.success(`[${id}] marcado como desativado`);
        return true;
      } catch (e) {
        toast.error("Não foi possível desativar", { description: mensagemDaApi(e) });
        return false;
      }
    },
    reativar: async (id) => {
      try {
        await reativarCaso(id);
        await invalidateCasosDesativados(moduloSlug);
        toast.success(`[${id}] voltou a ficar ativo`);
      } catch (e) {
        toast.error("Não foi possível reativar", { description: mensagemDaApi(e) });
      }
    },
  };

  if (!hierarchy.length) return <Empty text="A lista de casos aparece depois da próxima rodagem deste módulo." />;

  const alternar = (id: string) => setAbertos((atual) => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const expandirTudo = () => {
    const ids = new Set<string>();
    const visitar = (n: No) => { if (n.grupo) { ids.add(n.id); n.filhos.forEach(visitar); } };
    arvore.forEach(visitar);
    setAbertos(ids);
  };
  const alternarFiltro = (f: "falhas" | "desativados") => setFiltro((atual) => (atual === f ? "" : f));

  return (
    <AcoesCtx.Provider value={acoes}>
      <div className="space-y-4">
        <Card className="glass-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span><strong>{casos.length.toLocaleString("pt-BR")}</strong> <span className="text-muted-foreground">casos de teste</span></span>
            {totalFalhas > 0 && (
              <span className="text-red-500"><strong>{totalFalhas}</strong> com falha nesta rodagem</span>
            )}
            {totalDesativados > 0 && (
              <span className="text-muted-foreground"><strong>{totalDesativados}</strong> {totalDesativados === 1 ? "desativado" : "desativados"}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por número (2.1.3), nome, descrição ou chamado"
                aria-label="Buscar casos de teste"
                className="pl-9 pr-9"
              />
              {busca && (
                <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {totalFalhas > 0 && (
              <Button size="sm" variant={filtro === "falhas" ? "default" : "outline"} aria-pressed={filtro === "falhas"} onClick={() => alternarFiltro("falhas")}>
                Só os que falharam
              </Button>
            )}
            {totalDesativados > 0 && (
              <Button size="sm" variant={filtro === "desativados" ? "default" : "outline"} aria-pressed={filtro === "desativados"} onClick={() => alternarFiltro("desativados")}>
                Só os desativados
              </Button>
            )}
            {!filtrando && (
              <>
                <Button size="sm" variant="ghost" onClick={expandirTudo}>Expandir tudo</Button>
                <Button size="sm" variant="ghost" onClick={() => setAbertos(new Set())}>Recolher</Button>
              </>
            )}
          </div>
        </Card>

        <Card className="glass-card overflow-hidden">
          {filtrando ? (
            resultados.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhum caso encontrado.</p>
            ) : (
              <>
                <ul className="divide-y divide-border/60" aria-label="Casos encontrados">
                  {resultados.slice(0, MAX_RESULTADOS).map((c) => (
                    <li key={c.id}><LinhaCaso no={c} mostrarCaminho /></li>
                  ))}
                </ul>
                {resultados.length > MAX_RESULTADOS && (
                  <p className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
                    Mostrando {MAX_RESULTADOS} de {resultados.length}. Refine a busca para ver o resto.
                  </p>
                )}
              </>
            )
          ) : (
            <ul aria-label="Casos de teste do módulo" className="py-1">
              {arvore.map((n) => <Ramo key={n.id} no={n} nivel={0} abertos={abertos} onToggle={alternar} />)}
            </ul>
          )}
        </Card>
      </div>
    </AcoesCtx.Provider>
  );
}

function Ramo({ no, nivel, abertos, onToggle }: { no: No; nivel: number; abertos: Set<string>; onToggle: (id: string) => void }) {
  const recuo = { paddingLeft: `${12 + nivel * 18}px` };
  if (!no.grupo) return <li style={recuo}><LinhaCaso no={no} /></li>;
  const aberto = abertos.has(no.id);
  const Pasta = aberto ? FolderOpen : FolderClosed;
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => onToggle(no.id)}
        style={recuo}
        className="flex w-full items-start gap-2 py-2 pr-3 text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
        <Pasta className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
        <span className="min-w-0 flex-1">
          <span className="font-mono text-xs text-muted-foreground mr-2">[{no.id}]</span>
          <span className="text-sm font-medium">{no.nome}</span>
          {no.descricao && <span className="block text-xs text-muted-foreground line-clamp-1">{no.descricao}</span>}
          {/* No celular as contagens ficam embaixo do nome, para nao cobrir o texto. */}
          <Contagens no={no} className="mt-1 sm:hidden" />
        </span>
        <Contagens no={no} className="hidden sm:flex shrink-0" />
      </button>
      {aberto && (
        <ul>
          {no.filhos.map((f) => <Ramo key={f.id} no={f} nivel={nivel + 1} abertos={abertos} onToggle={onToggle} />)}
        </ul>
      )}
    </li>
  );
}

function Contagens({ no, className }: { no: No; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", className)}>
      {no.falhas > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-500">{no.falhas} com falha</span>}
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{no.casos} {no.casos === 1 ? "caso" : "casos"}</span>
    </span>
  );
}

function LinhaCaso({ no, mostrarCaminho }: { no: No; mostrarCaminho?: boolean }) {
  const acoes = useAcoes();
  const [inteira, setInteira] = useState(false);
  const marcado = acoes.desativado(no.id);
  const riscado = !!marcado;
  // O codigo do inicio da descricao ja vira a etiqueta com o link; o resto do texto fica como esta.
  const descricao = no.descricao.replace(/^\s*#\s?\d{4,}\s*[-–:,.]?\s*/, "");
  const longa = descricao.length > 160;
  return (
    <div className={cn("group flex items-start gap-2 py-2 pr-3", mostrarCaminho && "px-4 py-3")}>
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", no.falhas ? "bg-red-500" : "bg-muted-foreground/50")} aria-hidden />
      <div className="min-w-0 flex-1">
        {mostrarCaminho && no.caminho.length > 0 && (
          <div className="text-[11px] text-muted-foreground truncate">{no.caminho.join(" › ")}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-xs text-muted-foreground">[{no.id}]</span>
          <span className={cn("text-sm", riscado && "line-through text-muted-foreground")}>{no.nome}</span>
          {no.codigo ? (
            <a href={linkKanboard(no.codigo)} target="_blank" rel="noopener noreferrer" title="Abrir o cartão do caso no Kanboard"
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20">
              #{no.codigo}<ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">Código do caso de teste não informado</span>
          )}
        </div>
        {descricao && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className={cn(!inteira && "line-clamp-2")}><TextoComLinks texto={descricao} /></span>
            {longa && (
              <button type="button" onClick={() => setInteira((v) => !v)} className="mt-0.5 text-[11px] text-primary hover:underline">
                {inteira ? "ver menos" : "ver mais"}
              </button>
            )}
          </p>
        )}
        {marcado && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Desativado por {marcado.disabled_by || "—"} em {formatDateTime(marcado.disabled_at)}
            {marcado.reason ? `: ${marcado.reason}` : ""}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {no.falhas > 0 && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-500" onClick={() => acoes.abrirFalha(no)}>
            Falhou · ver
          </Button>
        )}
        {acoes.podeMarcar(no.id) ? (
          <CaixaDesativado id={no.id} marcado={!!marcado} />
        ) : marcado ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">Desativado</span>
        ) : null}
        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Copiar [${no.id}]`} title="Copiar o número" onClick={() => copiarId(no.id)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Caixinha "Desativado": marcar pede um motivo (opcional); desmarcar reativa na hora. */
function CaixaDesativado({ id, marcado }: { id: string; marcado: boolean }) {
  const acoes = useAcoes();
  const [pedindo, setPedindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const confirmar = async () => {
    setSalvando(true);
    if (await acoes.desativar(id, motivo.trim())) {
      setPedindo(false);
      setMotivo("");
    }
    setSalvando(false);
  };
  return (
    <Popover open={pedindo} onOpenChange={(aberto) => { if (!aberto) setPedindo(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="checkbox"
          aria-checked={marcado}
          aria-label={`Desativado [${id}]`}
          onClick={() => (marcado ? acoes.reativar(id) : setPedindo(true))}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded px-1.5 text-xs transition-colors hover:bg-muted/60",
            marcado ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          <span className={cn(
            "flex h-3.5 w-3.5 items-center justify-center rounded-sm border",
            marcado ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground/60",
          )}>
            {marcado && <Check className="h-3 w-3" />}
          </span>
          Desativado
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-sm font-medium">Desativar [{id}]</p>
        <p className="text-xs text-muted-foreground">Só marca na lista (o nome fica riscado). Não muda o .mds nem as rodagens.</p>
        <Input
          autoFocus
          value={motivo}
          maxLength={MAX_MOTIVO}
          onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
          placeholder="Motivo (opcional)"
          aria-label="Motivo"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPedindo(false)}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={salvando}>Desativar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
