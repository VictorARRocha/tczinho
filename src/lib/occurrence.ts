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
  if (["txt", "csv", "pdf", "log"].includes(ext)) return true;
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
 *  Estratégia:
 *  1) Agrupa arquivos da pasta `comparacao/` por pasta (folder do storage).
 *     - Se houver 2 arquivos sem indicador claro: 1º=base, 2º=atual (auto=true).
 *     - Se houver indicadores (base/atual no nome), respeitar.
 *  2) Para evidências fora da pasta `comparacao` mas com indicadores no nome,
 *     parear pelo nome base normalizado (comportamento legado).
 */
export function pairBaseAtual(evids: Evidencia[]): ComparisonPair[] {
  const pairs: ComparisonPair[] = [];

  // 1) Pasta comparacao/ — agrupar por diretório pai
  const inCmp = evids.filter((e) => isInComparacaoFolder(e));
  const byFolder = new Map<string, Evidencia[]>();
  inCmp.forEach((e) => {
    const folder = (e.storage_path || "").split("/").slice(0, -1).join("/") || (e.id || "_root");
    const arr = byFolder.get(folder) || [];
    arr.push(e);
    byFolder.set(folder, arr);
  });
  byFolder.forEach((arr, folder) => {
    // ordenar por nome para estabilidade
    arr.sort((a, b) => (a.nome_arquivo || "").localeCompare(b.nome_arquivo || ""));
    // tentar pelo nome
    const baseNamed = arr.find((e) => classifySide(e) === "base");
    const atualNamed = arr.find((e) => classifySide(e) === "atual");
    if (baseNamed || atualNamed) {
      const ext = ((baseNamed || atualNamed)!.extensao || "").toLowerCase();
      pairs.push({ key: `cmp:${folder}`, base: baseNamed, atual: atualNamed, extensao: ext });
      return;
    }
    // fallback: 2 arquivos → primeiro=base, segundo=atual
    if (arr.length >= 2) {
      const ext = (arr[0].extensao || "").toLowerCase();
      pairs.push({ key: `cmp:${folder}`, base: arr[0], atual: arr[1], extensao: ext, auto: true });
      return;
    }
    // único arquivo: registrar sem par completo
    const only = arr[0];
    const ext = (only.extensao || "").toLowerCase();
    pairs.push({ key: `cmp:${folder}`, base: only, extensao: ext, auto: true });
  });

  // 2) Legado: arquivos fora da pasta comparacao mas com indicador no nome
  const outside = evids.filter((e) => !isInComparacaoFolder(e));
  const map = new Map<string, ComparisonPair>();
  outside.forEach((e) => {
    const side = classifySide(e);
    if (!side) return;
    const baseName = (e.nome_arquivo || e.storage_path || e.id || "")
      .toString()
      .toLowerCase()
      .replace(/(base|anterior|esperad\w*|referenc\w*|original|previo|antes|antigo|atual|novo|obtid\w*|resultad\w*|gerad\w*|current|depois|new)/gi, "")
      .replace(/[._\-\s]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const ext = (e.extensao || (e.nome_arquivo || "").split(".").pop() || "").toLowerCase();
    const key = `legacy:${baseName}|${ext}`;
    const cur = map.get(key) || { key, extensao: ext };
    if (side === "base") cur.base = e;
    else cur.atual = e;
    cur.extensao = ext;
    map.set(key, cur);
  });
  pairs.push(...Array.from(map.values()));

  return pairs;
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
