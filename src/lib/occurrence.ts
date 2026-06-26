import type { Falha, Evidencia } from "@/types/db";

export type OccurrenceType = "quebra" | "diferenca" | "quebra_diferenca";

const QUEBRA_TOKENS = ["quebra", "quebra_teste", "quebras de testes", "quebras", "broken", "test_break"];
const DIFF_TOKENS = ["diferenca", "diferença", "diferenca_arquivo", "comparacao", "diferença entre arquivos de comparação", "report_diff"];
const HIBRID_TOKENS = ["quebra_com_diferenca", "diferenca_com_quebra", "diferenças entre arquivos com quebra de teste", "quebra+diferenca"];

const norm = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function pickFieldValue(f: any, keys: string[]): string {
  for (const k of keys) {
    const v = f?.[k];
    if (v) return norm(v);
  }
  return "";
}

const BASE_RE = /(base|anterior|esperad|referenc|original|previo|antes|antigo)/i;
const ATUAL_RE = /(atual|novo|obtid|resultad|gerad|current|depois|new)/i;

export function isImageEvidence(e: Evidencia): boolean {
  if (e.tipo === "print") return true;
  const m = (e.mime_type || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const ext = (e.extensao || "").toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext);
}

export function isComparableFile(e: Evidencia): boolean {
  const ext = (e.extensao || "").toLowerCase();
  if (["txt", "csv", "pdf", "log", "json", "xml"].includes(ext)) return true;
  if (isImageEvidence(e)) return true;
  return false;
}

export function isInComparacaoFolder(e: Evidencia): boolean {
  if (e.tipo === "comparacao") return true;
  return /(^|\/)comparacao\//i.test(e.storage_path || "");
}

export function classifySide(e: Evidencia): "base" | "atual" | null {
  const tipo = norm(e.tipo);
  if (tipo === "base" || tipo === "arquivo_base") return "base";
  if (tipo === "atual" || tipo === "arquivo_atual") return "atual";
  const name = `${e.nome_arquivo || ""} ${e.storage_path || ""}`;
  if (BASE_RE.test(name)) return "base";
  if (ATUAL_RE.test(name)) return "atual";
  return null;
}

export interface ComparisonPair {
  key: string;
  base?: Evidencia;
  atual?: Evidencia;
  extensao?: string;
  auto?: boolean; // par identificado automaticamente (sem nome claro)
}

/** Pareia evidências base/atual.
 *  REGRA: 1 pasta `comparacao/` = 1 par (base + atual). Nada fora disso.
 *  - Identifica base/atual pelos tokens do nome.
 *  - Fallback: se só houver 2 arquivos sem nome claro, primeiro=base, segundo=atual (auto=true).
 *  - Pastas com menos de 2 arquivos são ignoradas.
 *  - Deduplica por `cmp:{folder}`.
 */
export function pairBaseAtual(evids: Evidencia[]): ComparisonPair[] {
  const inCmp = evids.filter((e) => isInComparacaoFolder(e));
  const byFolder = new Map<string, Evidencia[]>();
  inCmp.forEach((e) => {
    const folder = (e.storage_path || "").split("/").slice(0, -1).join("/");
    if (!folder) return;
    const arr = byFolder.get(folder) || [];
    arr.push(e);
    byFolder.set(folder, arr);
  });

  const pairs = new Map<string, ComparisonPair>();
  byFolder.forEach((arr, folder) => {
    if (arr.length < 2) return;
    arr.sort((a, b) => (a.nome_arquivo || "").localeCompare(b.nome_arquivo || ""));
    const baseNamed = arr.find((e) => classifySide(e) === "base");
    const atualNamed = arr.find((e) => classifySide(e) === "atual" && e !== baseNamed);
    let base: Evidencia | undefined = baseNamed;
    let atual: Evidencia | undefined = atualNamed;
    let auto = false;
    if (!base || !atual) {
      const remaining = arr.filter((e) => e !== base && e !== atual);
      if (!base && remaining.length) { base = remaining.shift(); auto = true; }
      if (!atual && remaining.length) { atual = remaining.shift(); auto = true; }
    }
    if (!base || !atual) return; // exige par completo
    const ext = (base.extensao || atual.extensao || "").toLowerCase();
    const key = `cmp:${folder}`;
    if (!pairs.has(key)) pairs.set(key, { key, base, atual, extensao: ext, auto });
  });

  return Array.from(pairs.values());
}

/** Identifica se uma falha tem quebra técnica (call stack, erro principal etc.). */
function hasTechnicalBreak(f: Falha): boolean {
  const corpus = [f.call_stack_resumido, f.erro_principal, f.mensagem_principal, f.erro_titulo, f.trecho_relevante]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!corpus) return false;
  return /(object not found|timeout|exception|stack|null pointer|undefined|error|erro|cannot find|element not found|falha)/.test(corpus);
}

export function classifyOccurrence(falha: Falha, evids: Evidencia[]): OccurrenceType {
  const hasComparacaoFolder = evids.some((e) => isInComparacaoFolder(e));
  const pairs = pairBaseAtual(evids);
  const hasComparison = hasComparacaoFolder || pairs.some((p) => p.base && p.atual);
  const hasBreak = hasTechnicalBreak(falha);

  const explicit = pickFieldValue(falha, ["tipo_ocorrencia", "tipo_erro", "categoria", "tipo_tecnico", "classificacao"]);
  if (explicit) {
    if (HIBRID_TOKENS.some((t) => explicit.includes(norm(t)))) return "quebra_diferenca";
    if (QUEBRA_TOKENS.some((t) => explicit.includes(norm(t)))) {
      return hasComparison ? "quebra_diferenca" : "quebra";
    }
    if (DIFF_TOKENS.some((t) => explicit.includes(norm(t)))) {
      return hasBreak ? "quebra_diferenca" : "diferenca";
    }
  }
  if (hasComparison && hasBreak) return "quebra_diferenca";
  if (hasComparison) return "diferenca";
  return "quebra";
}

export function groupEvidsByFailure(evids: Evidencia[]): Map<string, Evidencia[]> {
  const map = new Map<string, Evidencia[]>();
  evids.forEach((e) => {
    if (!e.falha_id) return;
    const arr = map.get(e.falha_id) || [];
    arr.push(e);
    map.set(e.falha_id, arr);
  });
  return map;
}
