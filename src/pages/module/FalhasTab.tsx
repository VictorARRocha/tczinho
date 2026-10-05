// Aba Falhas: arvore por hierarquia do MDS, filtros e pares de comparacao.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useEffect, useMemo, useState } from "react";
import { type TestcaseHierarchyNode } from "@/services/data";
import type { Falha, Evidencia } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, FolderTree, List, Network } from "lucide-react";
import { ClassificationBadge, SeverityBadge } from "@/components/Badges";
import { classifyOccurrence, groupEvidsByFailure, pairBaseAtual, type ComparisonPair, type OccurrenceType } from "@/lib/occurrence";
import { useDebounce } from "@/hooks/useDebounce";
import { withCaseMetadata, failureDescription, cleanFileName } from "./caseText";
import { TipoBadge } from "./common";

type EnrichedItem = { f: Falha; evs: Evidencia[]; tipo: OccurrenceType; pairs: ComparisonPair[] };

type FalhasView = "arvore" | "lista";
const VIEW_STORAGE_KEY = "agenttc.falhas.view";

function readStoredView(): FalhasView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "lista" ? "lista" : "arvore";
  } catch {
    return "arvore";
  }
}

function storeView(view: FalhasView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Preferencia so desta sessao quando o navegador bloqueia o armazenamento.
  }
}

type TreeNode = {
  id: string;            // caminho completo: "1.3.7"
  segment: string;       // último segmento: "7"
  label: string;
  fullPath: string;      // "[1] Folha > [1.3] Tabelas > [1.3.7] ..."
  children: Map<string, TreeNode>;
  items: EnrichedItem[]; // falhas cujo ID == node.id
  counts: { quebra: number; diferenca: number; quebra_diferenca: number; total: number };
};

export function extractCaseIdParts(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const m = String(raw).match(/\d+(?:\.\d+)*/);
  if (!m) return null;
  return m[0].split(".");
}

function buildFailuresTree(
  items: EnrichedItem[],
  moduloNome: string,
  hierMap: Map<string, TestcaseHierarchyNode>,
) {
  const root: TreeNode = { id: "", segment: "", label: "", fullPath: "", children: new Map(), items: [], counts: { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } };
  const orphans: EnrichedItem[] = [];

  for (const it of items) {
    const parts = extractCaseIdParts(it.f.id_caso_teste);
    if (!parts || parts.length === 0) { orphans.push(it); continue; }
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).join(".");
      let child = cur.children.get(id);
      if (!child) {
        child = { id, segment: parts[i], label: "", fullPath: "", children: new Map(), items: [], counts: { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } };
        cur.children.set(id, child);
      }
      cur = child;
    }
    cur.items.push(it);
  }

  const nameMap = buildNameMapFromHierarchy(hierMap);
  const finalize = (node: TreeNode, depth: number) => {
    // Prioridade: nameMap (derivado de full_path_label) > node_name > metadados da falha > fallback
    const nm = nameMap.get(node.id);
    const hier = hierMap.get(node.id);
    if (nm && nm.trim()) {
      node.label = nm.trim();
    } else if (hier?.node_name && hier.node_name.trim()) {
      node.label = hier.node_name.trim();
    } else if (node.items.length) {
      const it = node.items[0];
      node.label = (it.f.caso_teste_provavel || it.f.descricao_caso || it.f.erro_titulo || "").toString();
    } else if (depth === 1 && moduloNome) {
      node.label = moduloNome;
    } else {
      node.label = "";
    }

    node.fullPath = buildFullPathLabel(node.id, hierMap, nameMap, moduloNome);
    node.children.forEach((c) => {
      finalize(c, depth + 1);
      node.counts.quebra += c.counts.quebra;
      node.counts.diferenca += c.counts.diferenca;
      node.counts.quebra_diferenca += c.counts.quebra_diferenca;
      node.counts.total += c.counts.total;
    });
    for (const it of node.items) {
      node.counts[it.tipo] = (node.counts[it.tipo] || 0) + 1;
      node.counts.total++;
    }
  };
  root.children.forEach((c) => finalize(c, 1));
  return { root, orphans };
}

// Parseia "[2] Fiscal > [2.6] Integrações > ..." em pares {id, name}
function parseFullPathLabel(label: string): Array<{ id: string; name: string }> {
  if (!label) return [];
  return label.split(">").map((seg) => {
    const m = seg.trim().match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!m) return null;
    return { id: m[1].trim(), name: m[2].trim() };
  }).filter(Boolean) as Array<{ id: string; name: string }>;
}

// Constrói id -> nome extraindo de full_path_label de TODOS os nós da hierarquia,
// garantindo nomes reais de pais/intermediários mesmo sem linha própria em testcase_hierarchy.
function buildNameMapFromHierarchy(hierMap: Map<string, TestcaseHierarchyNode>): Map<string, string> {
  const nameMap = new Map<string, string>();
  hierMap.forEach((h) => {
    parseFullPathLabel(h?.full_path_label || "").forEach(({ id, name }) => {
      if (id && name && !nameMap.has(id)) nameMap.set(id, name);
    });
    if (h?.node_id && h?.node_name && !nameMap.has(String(h.node_id))) {
      nameMap.set(String(h.node_id), String(h.node_name).trim());
    }
  });
  return nameMap;
}

// Constrói caminho completo "[1] Folha > [1.3] Tabelas > [1.3.7] ..." de um node_id
function buildFullPathLabel(nodeId: string, hierMap: Map<string, TestcaseHierarchyNode>, nameMap: Map<string, string>, moduloNome: string): string {
  const direct = hierMap.get(nodeId);
  if (direct?.full_path_label && direct.full_path_label.trim()) return direct.full_path_label.trim();
  const parts = nodeId.split(".");
  const segs: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const id = parts.slice(0, i + 1).join(".");
    const nm = nameMap.get(id);
    const h = hierMap.get(id);
    const name = (nm && nm.trim()) || h?.node_name?.trim() || (i === 0 && moduloNome ? moduloNome : `Grupo ${id}`);
    segs.push(`[${id}] ${name}`);
  }
  return segs.join(" > ");
}

function collectAllNodeIds(node: TreeNode, acc: string[] = []): string[] {
  node.children.forEach((c) => { acc.push(c.id); collectAllNodeIds(c, acc); });
  return acc;
}

function itemMatches(it: EnrichedItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const parts = [
    it.f.id_caso_teste, it.f.caso_teste_provavel, it.f.descricao_caso, it.f.erro_titulo,
    it.f.erro_principal, it.f.mensagem_principal, it.f.grupo, it.f.subgrupo, it.f.rotina_funcional,
  ];
  for (const p of parts) if (p && String(p).toLowerCase().includes(needle)) return true;
  for (const e of it.evs) {
    if ((e.nome_arquivo || "").toLowerCase().includes(needle)) return true;
    if ((e.extensao || "").toLowerCase().includes(needle)) return true;
    if ((e.storage_path || "").toLowerCase().includes(needle)) return true;
  }
  for (const p of it.pairs) {
    if ((p.base?.nome_arquivo || "").toLowerCase().includes(needle)) return true;
    if ((p.atual?.nome_arquivo || "").toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function FalhasTab({
  moduloNome, falhas, evidencias, hierarchy, subTab, setSubTab, onSelect, onCompare,
}: {
  moduloNome: string;
  falhas: Falha[];
  evidencias: Evidencia[];
  hierarchy: TestcaseHierarchyNode[];
  subTab: "todos" | "quebra" | "diferenca" | "quebra_diferenca";
  setSubTab: (s: "todos" | "quebra" | "diferenca" | "quebra_diferenca") => void;
  onSelect: (f: Falha) => void;
  onCompare: (pair: ComparisonPair, falha: Falha) => void;
}) {
  const [q, setQ] = useState("");
  const [extFilter, setExtFilter] = useState<string>("");
  const [view, setView] = useState<FalhasView>(readStoredView);
  const changeView = (v: FalhasView) => { setView(v); storeView(v); };
  const debouncedQ = useDebounce(q, 250);

  const hierMap = useMemo(() => {
    const m = new Map<string, TestcaseHierarchyNode>();
    hierarchy.forEach((h) => { if (h?.node_id) m.set(String(h.node_id), h); });
    return m;
  }, [hierarchy]);

  const evMap = useMemo(() => groupEvidsByFailure(evidencias), [evidencias]);

  // Calcula pares base/atual uma única vez por falha e reaproveita em tudo abaixo
  const realPairsByFalha = useMemo(() => {
    const m = new Map<string, ComparisonPair[]>();
    falhas.forEach((f) => { m.set(f.id, pairBaseAtual(evMap.get(f.id) || [])); });
    return m;
  }, [falhas, evMap]);

  const realPairKeys = useMemo(() => {
    const set = new Set<string>();
    realPairsByFalha.forEach((pairs) => pairs.forEach((p) => set.add(p.key)));
    return set;
  }, [realPairsByFalha]);

  // Agrupa evidências órfãs por pasta /comparacao e monta pares base/atual
  const orphanCmpFolders = useMemo(() => {
    const orphan = evidencias.filter((e) => !e.falha_id);
    const byCmpFolder = new Map<string, Evidencia[]>();
    orphan.forEach((e) => {
      const path = (e.storage_path || "").replace(/\\/g, "/");
      const m = path.match(/^(.*\/comparacao)\//i);
      if (!m) return;
      const folder = m[1];
      const arr = byCmpFolder.get(folder) || [];
      arr.push(e);
      byCmpFolder.set(folder, arr);
    });
    const out: { cmpFolder: string; caseName: string; evs: Evidencia[]; pairs: ComparisonPair[] }[] = [];
    byCmpFolder.forEach((evs, cmpFolder) => {
      if (realPairKeys.has(`cmp:${cmpFolder}`)) return;
      const pairs = pairBaseAtual(evs);
      if (!pairs.length) return;
      const caseFolder = cmpFolder.replace(/\/comparacao$/i, "");
      const caseName = caseFolder.split("/").pop() || caseFolder;
      out.push({ cmpFolder, caseName, evs, pairs });
    });
    return out;
  }, [evidencias, realPairKeys]);

  const enriched: EnrichedItem[] = useMemo(() => {
    // Índice de pastas /comparacao órfãs por id_caso_teste (ex.: "9.1.1.1.1")
    const orphanByCase = new Map<string, { evs: Evidencia[]; pairs: ComparisonPair[]; cmpFolder: string }>();
    orphanCmpFolders.forEach((o) => {
      if (!orphanByCase.has(o.caseName)) orphanByCase.set(o.caseName, o);
    });
    const consumed = new Set<string>();

    const real: EnrichedItem[] = falhas.map((f) => {
      const enrichedFalha = withCaseMetadata(f, hierMap);
      let evs = evMap.get(f.id) || [];
      let pairs = realPairsByFalha.get(f.id) || [];

      // Se a falha real não tem pares vinculados mas existe uma pasta
      // /comparacao órfã com o mesmo id_caso_teste, anexa esses pares.
      if (pairs.length === 0 && f.id_caso_teste) {
        const key = String(f.id_caso_teste).trim();
        const match = orphanByCase.get(key);
        if (match) {
          evs = evs.concat(match.evs);
          pairs = match.pairs;
          consumed.add(match.cmpFolder);
        }
      }

      return { f: enrichedFalha, evs, tipo: classifyOccurrence(f, evs), pairs };
    });

    // Só sintetiza falhas fantasma para pastas órfãs que não foram
    // anexadas a nenhuma falha real acima.
    const synth: EnrichedItem[] = orphanCmpFolders
      .filter((o) => !consumed.has(o.cmpFolder))
      .map(({ cmpFolder, caseName, evs, pairs }) => {
        const caseFolder = cmpFolder.replace(/\/comparacao$/i, "");
        const id = `storage:${caseFolder}`;
        const f = {
          id, rodagem_id: evs[0]?.rodagem_id || "", modulo_slug: evs[0]?.modulo_slug || "",
          ordem_prioridade: null, arquivo_zip: null, arquivo_txt: null, arquivo_print: null,
          caso_identificado: false, id_caso_teste: caseName,
          caso_teste_provavel: `Comparação: ${caseName}`,
          grupo: "Storage", subgrupo: null, rotina_funcional: null, descricao_caso: caseFolder, confianca_associacao: null,
          erro_titulo: null, erro_principal: null, mensagem_principal: null, trecho_relevante: null,
          call_stack_resumido: null, tipo_tecnico: "diferenca_arquivo", formulario_ou_tela: null, componente: null,
          classificacao: null, classificacao_label: null, severidade: null, confianca: null, status_analise: null,
          cor: null, fato_observado: null, hipotese_principal: null, analise_tecnica: null, analise_funcional: null,
          impacto_possivel: null, primeira_acao_recomendada: null, informacoes_faltantes: null, tags: null,
          created_at: "",
        } as Falha;
        return { f, evs, tipo: classifyOccurrence(f, evs), pairs };
      });

    return real.concat(synth);
  }, [falhas, evMap, realPairsByFalha, orphanCmpFolders, hierMap]);


  const counts = useMemo(() => {
    const c = { quebra: 0, diferenca: 0, quebra_diferenca: 0 };
    enriched.forEach((e) => { c[e.tipo]++; });
    return { ...c, todos: enriched.length };
  }, [enriched]);

  const allExts = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach((e) => e.pairs.forEach((p) => p.extensao && s.add(p.extensao)));
    return Array.from(s).sort();
  }, [enriched]);




  // Busca também considera nomes reais dos grupos/casos vindos da hierarquia
  const filteredByHierSearch = useMemo(() => {
    if (!debouncedQ) return enriched;
    const needle = debouncedQ.toLowerCase();
    const matchingIds = new Set<string>();
    const asStr = (v: unknown) => Array.isArray(v) ? v.join(" ") : (v == null ? "" : String(v));
    hierMap.forEach((h, id) => {
      if (asStr(h.node_name).toLowerCase().includes(needle) ||
          asStr(h.full_path_names).toLowerCase().includes(needle) ||
          asStr(h.full_path_label).toLowerCase().includes(needle) ||
          asStr(h.script_name).toLowerCase().includes(needle) ||
          asStr(h.procedure_name).toLowerCase().includes(needle)) {
        matchingIds.add(id);
      }
    });
    // Antes, sem nenhum nome de hierarquia correspondente, a busca devolvia tudo
    // (buscar por uma mensagem de erro nao filtrava nada).
    return enriched.filter((it) => {
      if (itemMatches(it, debouncedQ)) return true;
      if (matchingIds.size === 0) return false;
      const parts = extractCaseIdParts(it.f.id_caso_teste);
      if (!parts) return false;
      for (let i = 0; i < parts.length; i++) {
        if (matchingIds.has(parts.slice(0, i + 1).join("."))) return true;
      }
      return false;
    });
  }, [enriched, debouncedQ, hierMap]);

  const filtered = useMemo(() => filteredByHierSearch.filter(({ tipo, pairs }) => {
    if (subTab !== "todos" && tipo !== subTab) return false;
    if (extFilter && !pairs.some((p) => p.extensao === extFilter)) return false;
    return true;
  }), [filteredByHierSearch, subTab, extFilter]);

  const { root, orphans } = useMemo(() => buildFailuresTree(filtered, moduloNome, hierMap), [filtered, moduloNome, hierMap]);

  const allIds = useMemo(() => collectAllNodeIds(root), [root]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const hasActiveFilter = Boolean(debouncedQ || extFilter || subTab !== "todos");
  // Estado inicial recolhido; ao aplicar filtro, expande apenas o caminho até
  // o primeiro item encontrado, mantendo os demais recolhidos.
  useEffect(() => {
    if (!hasActiveFilter) { setExpanded(new Set()); return; }
    const path: string[] = [];
    const dfs = (n: TreeNode): boolean => {
      const kids = Array.from(n.children.values()).sort(
        (a, b) => Number(a.segment) - Number(b.segment) || a.segment.localeCompare(b.segment),
      );
      for (const k of kids) {
        path.push(k.id);
        if (k.items.length > 0) return true;
        if (dfs(k)) return true;
        path.pop();
      }
      return false;
    };
    dfs(root);
    // expande todos os ancestrais + o próprio nó da primeira falha
    setExpanded(new Set(path));
  }, [root, hasActiveFilter]);


  const toggle = (id: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set());

  // Smart open: ao clicar num grupo/subgrupo abaixo do módulo, expande o
  // caminho até o primeiro caso com falha/diferença visível no filtro atual.
  const smartOpen = (node: TreeNode, depth: number) => {
    if (depth === 0) { toggle(node.id); return; }
    if (expanded.has(node.id)) { toggle(node.id); return; }
    const path: string[] = [];
    const dfs = (n: TreeNode): boolean => {
      if (n.items.length > 0) return true;
      const kids = Array.from(n.children.values())
        .filter((k) => k.counts.total > 0)
        .sort((a, b) => Number(a.segment) - Number(b.segment) || a.segment.localeCompare(b.segment));
      for (const k of kids) {
        path.push(k.id);
        if (dfs(k)) return true;
        path.pop();
      }
      return false;
    };
    dfs(node);
    setExpanded((prev) => new Set([...prev, node.id, ...path]));
  };


  const SubTabBtn = ({ id, label, count, tone }: { id: typeof subTab; label: string; count: number; tone?: string }) => (
    <button
      onClick={() => setSubTab(id)}
      className={`px-3 h-8 rounded-md text-xs font-medium transition-smooth border ${
        subTab === id ? "bg-primary/15 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className={`font-mono ml-1 ${tone || ""}`}>({count})</span>
    </button>
  );

  const rootChildren = Array.from(root.children.values()).sort((a, b) => Number(a.segment) - Number(b.segment));
  const isEmpty = filtered.length === 0;

  return (
    <div className="space-y-4">
      <Card className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <SubTabBtn id="quebra" label="Quebras" count={counts.quebra} tone="text-destructive" />
          <SubTabBtn id="diferenca" label="Diferenças" count={counts.diferenca} tone="text-warning" />
          <SubTabBtn id="quebra_diferenca" label="Quebra + Diferença" count={counts.quebra_diferenca} tone="text-primary" />
          <SubTabBtn id="todos" label="Todos" count={counts.todos} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, nome, mensagem de erro ou arquivo... (Esc limpa)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            className="bg-background flex-1 min-w-[220px]"
          />
          <div className="ml-auto flex gap-1">
            <ToggleChip label="Árvore" icon={<Network className="h-3.5 w-3.5" />} active={view === "arvore"} onClick={() => changeView("arvore")} />
            <ToggleChip label="Lista" icon={<List className="h-3.5 w-3.5" />} active={view === "lista"} onClick={() => changeView("lista")} />
            {view === "arvore" && (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={expandAll}><FolderTree className="h-3.5 w-3.5" /> Expandir tudo</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={collapseAll}>Recolher tudo</Button>
              </>
            )}
          </div>
        </div>
        {(allExts.length > 1 || hasActiveFilter) && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            {allExts.length > 1 && (
              <>
                <span>Arquivos de comparação:</span>
                <ToggleChip label="Todos" active={!extFilter} onClick={() => setExtFilter("")} />
                {allExts.map((ext) => (
                  <ToggleChip key={ext} label={`.${ext.replace(/^\.+/, "")}`} active={extFilter === ext} onClick={() => setExtFilter(extFilter === ext ? "" : ext)} />
                ))}
              </>
            )}
            <span className="ml-auto">Mostrando {filtered.length} de {enriched.length} falhas</span>
          </div>
        )}
      </Card>

      {isEmpty ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          {debouncedQ || extFilter || subTab !== "todos"
            ? "Nenhum item encontrado para os filtros aplicados."
            : "Nenhuma falha encontrada neste módulo."}
        </Card>
      ) : view === "lista" ? (
        <FalhasLista items={filtered} onSelect={onSelect} onCompare={onCompare} />
      ) : (
        <Card className="p-2 md:p-3 bg-card/60 backdrop-blur-xl border-border/70 shadow-[0_8px_32px_-12px_hsl(222_50%_2%/0.5)]">
          <div className="space-y-0.5">
            {rootChildren.map((c) => (
              <TreeNodeView key={c.id} node={c} depth={0} expanded={expanded} onToggle={toggle} onSmartOpen={smartOpen} onSelect={onSelect} onCompare={onCompare} />
            ))}

            {orphans.length > 0 && (
              <OrphanGroup items={orphans} expanded={expanded} onToggle={toggle} onSelect={onSelect} onCompare={onCompare} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function CountsPills({ counts }: { counts: TreeNode["counts"] }) {
  const totalDif = counts.diferenca + counts.quebra_diferenca;
  const pill = "text-[10px] font-medium px-1.5 py-0 rounded-full border tabular-nums";
  return (
    <div className="flex gap-1 flex-wrap">
      {counts.quebra > 0 && <Badge variant="outline" className={`${pill} bg-rose-500/10 text-rose-300 border-rose-500/25`}>{counts.quebra} quebra</Badge>}
      {totalDif > 0 && <Badge variant="outline" className={`${pill} bg-amber-500/10 text-amber-300 border-amber-500/25`}>{totalDif} dif.</Badge>}
    </div>
  );
}

// Estilo hierárquico por profundidade: nível 0 = módulo (forte), 1 = grupo, 2 = subgrupo, 3+ = subgrupos menores
function nodeStyleForDepth(depth: number, open: boolean) {
  const activeChip = "bg-foreground/[0.14] border-foreground/25 text-foreground font-semibold";
  const idleChip = "bg-muted/40 border-border/50 text-muted-foreground group-hover:bg-muted/70 group-hover:border-border group-hover:text-foreground";
  if (depth === 0) {
    return {
      row: "py-2.5 mt-2 first:mt-0",
      idChip: `font-mono text-sm rounded-md px-2 py-0.5 border transition-colors ${open ? activeChip : `font-semibold ${idleChip}`}`,
      label: `text-base tracking-tight ${open ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`,
    };
  }
  if (depth === 1) {
    return {
      row: "py-2",
      idChip: `font-mono text-[13px] rounded-md px-2 py-0.5 border transition-colors ${open ? activeChip : `font-semibold ${idleChip}`}`,
      label: `text-[15px] ${open ? "font-semibold text-foreground" : "font-medium text-foreground/85"}`,
    };
  }
  return {
    row: "py-1.5",
    idChip: `font-mono text-xs rounded-md px-1.5 py-0.5 border transition-colors ${open ? activeChip : `font-medium ${idleChip}`}`,
    label: `text-sm ${open ? "font-medium text-foreground" : "text-foreground/75"}`,
  };
}

function TreeNodeView({
  node, depth, expanded, onToggle, onSmartOpen, onSelect, onCompare,
}: {
  node: TreeNode; depth: number; expanded: Set<string>;
  onToggle: (id: string) => void;
  onSmartOpen: (node: TreeNode, depth: number) => void;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const hasChildren = node.children.size > 0 || node.items.length > 0;
  const open = expanded.has(node.id);
  const indent = depth * 16;
  const style = nodeStyleForDepth(depth, open);

  return (
    <div>
      <div
        className={`group flex items-center gap-2.5 pr-2 rounded-lg cursor-pointer transition-colors hover:bg-secondary/60 ${style.row}`}
        style={{ paddingLeft: indent + 8 }}
        onClick={() => hasChildren && onSmartOpen(node, depth)}
      >

        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground transition-transform" style={{ transform: open ? "rotate(0deg)" : "rotate(0deg)" }}>
          {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />}
        </span>
        <span className={`shrink-0 tabular-nums tracking-tight ${style.idChip}`}>
          [{node.id}]
        </span>
        <span className={`truncate ${style.label}`}>{node.label}</span>
      </div>
      {open && (
        <div className="relative">
          {/* Linha guia sutil */}
          <div
            className="absolute top-0 bottom-0 w-px bg-border/70"
            style={{ left: indent + 15 }}
            aria-hidden
          />
          {node.items.map((it) => (
            <LeafItemCard key={it.f.id} item={it} depth={depth + 1} onSelect={onSelect} onCompare={onCompare} />
          ))}
          {Array.from(node.children.values())
            .sort((a, b) => Number(a.segment) - Number(b.segment) || a.segment.localeCompare(b.segment))
            .map((c) => (
              <TreeNodeView key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSmartOpen={onSmartOpen} onSelect={onSelect} onCompare={onCompare} />
            ))}
        </div>
      )}
    </div>
  );
}

function LeafItemCard({
  item, depth, onSelect, onCompare,
}: {
  item: EnrichedItem; depth: number;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const { f, tipo, pairs } = item;
  const desc = failureDescription(f);
  const isQuebra = tipo === "quebra" || tipo === "quebra_diferenca";
  const isDiff = tipo === "diferenca" || tipo === "quebra_diferenca";
  const indent = depth * 16 + 20;
  const classificacaoKey = (f.classificacao || "").toLowerCase().replace(/\s+/g, "_").replace(/\//g, "_");
  const showClassification = !!f.classificacao && !["test_break", "file_difference", "test_break_file_difference", "break", "difference", "report_difference", "report_diff"].includes(classificacaoKey);

  const accent =
    tipo === "quebra" ? "border-rose-500/40"
    : tipo === "diferenca" ? "border-amber-700/50"
    : "border-fuchsia-500/40";

  return (
    <div
      className={`ml-1 my-2 border-l-2 ${accent} bg-card/80 hover:bg-card border border-border/60 hover:border-border rounded-r-lg cursor-pointer transition-colors shadow-sm hover:shadow-md`}
      style={{ marginLeft: indent }}
      onClick={() => onSelect(f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f); } }}
    >
      <div className="px-4 py-3 space-y-2.5">
        {/* Cabeçalho: Código + Status */}
        <div className="flex items-start gap-2.5 flex-wrap">
          {f.id_caso_teste && (
            <Badge variant="outline" className="font-mono text-[11px] px-2 py-0.5">
              #{f.id_caso_teste}
            </Badge>
          )}
          <div className="flex-1 min-w-0" />
          <TipoBadge tipo={tipo} />
        </div>


        {/* Metadata secundária */}
        {(f.severidade || showClassification) && (
          <div className="flex items-center gap-2 flex-wrap">
            {f.severidade && <SeverityBadge value={f.severidade} />}
            {showClassification && <ClassificationBadge value={f.classificacao} />}
          </div>
        )}

        {/* Descrição */}
        {desc && (
          <p className="text-[13px] text-foreground/75 leading-relaxed line-clamp-3">{desc}</p>
        )}

        {/* Pares de comparação */}
        {isDiff && pairs.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {pairs.map((p) => {
              const ext = (p.extensao || "").trim().toLowerCase().replace(/^\.+/, "");
              const displayName = cleanFileName(p.base?.nome_arquivo, p.extensao) || cleanFileName(p.atual?.nome_arquivo, p.extensao);
              return (
                <div key={p.key} className="flex items-center gap-2 flex-wrap text-xs bg-background/50 rounded-md px-3 py-2 border border-border/50">
                  {ext && ext !== "txt" && <Badge variant="outline" className="text-[10px] font-mono">.{ext}</Badge>}
                  <div className="flex-1 min-w-0 font-mono text-[12px] truncate text-foreground/85" title={displayName}>{displayName}</div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); onCompare(p, f); }}
                  >
                    Ver diferenças
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {isDiff && pairs.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Arquivos de comparação não vinculados.</p>
        )}

        {/* Rodapé de ações */}
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-secondary hover:bg-secondary/80 border border-border/60"
            onClick={(e) => { e.stopPropagation(); onSelect(f); }}
          >
            Detalhes
          </Button>
        </div>
      </div>
    </div>
  );
}

function OrphanGroup({
  items, expanded, onToggle, onSelect, onCompare,
}: {
  items: EnrichedItem[]; expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const id = "__orphan__";
  const open = expanded.has(id) || !expanded.size;
  const counts = items.reduce(
    (acc, it) => { acc[it.tipo]++; acc.total++; return acc; },
    { quebra: 0, diferenca: 0, quebra_diferenca: 0, total: 0 } as TreeNode["counts"],
  );
  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1.5 pr-2 pl-2 rounded-md hover:bg-secondary/40 cursor-pointer"
        onClick={() => onToggle(id)}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="font-mono text-sm font-bold text-muted-foreground bg-muted/40 border border-border rounded px-2 py-0.5 shrink-0">[sem ID]</span>
        <span className="text-sm text-muted-foreground truncate">Sem identificação numérica</span>
        <div className="ml-auto"><CountsPills counts={counts} /></div>
      </div>
      {open && (
        <div>
          {items.map((it) => (
            <LeafItemCard key={it.f.id} item={it} depth={1} onSelect={onSelect} onCompare={onCompare} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleChip({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 px-3 rounded-md border text-xs transition-smooth inline-flex items-center gap-1.5 ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
    >
      {icon}{label}
    </button>
  );
}

function compareCaseIds(a: string | null, b: string | null): number {
  const pa = extractCaseIdParts(a);
  const pb = extractCaseIdParts(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (Number(pa[i] ?? -1) || 0) - (Number(pb[i] ?? -1) || 0);
    if (diff) return diff;
  }
  return 0;
}

/** Modo lista: uma linha por falha, ordenada pelo ID do caso. */
function FalhasLista({
  items, onSelect, onCompare,
}: {
  items: EnrichedItem[];
  onSelect: (f: Falha) => void;
  onCompare: (p: ComparisonPair, f: Falha) => void;
}) {
  const ordenados = useMemo(
    () => [...items].sort((a, b) => compareCaseIds(a.f.id_caso_teste, b.f.id_caso_teste)),
    [items],
  );
  return (
    <Card className="glass-card divide-y divide-border/60 overflow-hidden">
      {ordenados.map(({ f, tipo, pairs }) => {
        const desc = failureDescription(f);
        const isDiff = tipo === "diferenca" || tipo === "quebra_diferenca";
        return (
          <div
            key={f.id}
            className="flex flex-col gap-2 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer md:flex-row md:items-center md:gap-4"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(f)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f); } }}
          >
            <div className="flex items-center gap-2 shrink-0 md:w-52">
              <TipoBadge tipo={tipo} />
              {f.id_caso_teste && <Badge variant="outline" className="font-mono text-[11px]">#{f.id_caso_teste}</Badge>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{f.caso_teste_provavel || "Caso sem nome no MDS"}</div>
              {desc && desc !== f.caso_teste_provavel && <div className="text-xs text-muted-foreground line-clamp-1">{desc}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isDiff && pairs.length > 0 && (
                <Button size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onCompare(pairs[0], f); }}>
                  Ver diferenças{pairs.length > 1 ? ` (${pairs.length})` : ""}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs border border-border/60"
                onClick={(e) => { e.stopPropagation(); onSelect(f); }}
              >
                Detalhes
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
