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

// Tokens de baseline/checked usados pelo Agent TC (sufixos no nome do arquivo).
const BASE_TOKENS = ["antigo", "base", "padrao", "padrão", "esperado", "esperada", "referencia", "referência", "original", "previo", "prévio", "anterior", "antes"];
const ATUAL_TOKENS = ["atual", "atualizado", "atualizada", "gerado", "gerada", "novo", "nova", "obtido", "obtida", "resultado", "current", "depois", "new"];

const BASE_RE = new RegExp(`(${BASE_TOKENS.join("|")})`, "i");
const ATUAL_RE = new RegExp(`(${ATUAL_TOKENS.join("|")})`, "i");

const SUFFIX_RE = new RegExp(`[_\\-\\. ]+(${[...BASE_TOKENS, ...ATUAL_TOKENS].join("|")})(?=\\.[^.]+$|$)`, "i");

/** Remove sufixo _Antigo/_Atual/_Base/_Gerado/... do nome do arquivo para obter o "nome lógico". */
function logicalNameOf(ev: Evidencia): string {
  const raw = (ev.nome_arquivo || (ev.storage_path || "").split("/").pop() || "").trim();
  if (!raw) return "";
  const dot = raw.lastIndexOf(".");
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  const stripped = stem.replace(SUFFIX_RE, "");
  return norm(stripped);
}

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

/** Pareia evidências baseline (antigo/base/esperado/padrão) com checked (atual/gerado/novo).
 *
 *  Regras:
 *  - Pareia pelo "nome lógico" (nome do arquivo sem o sufixo _Antigo/_Atual/_Base/_Gerado/...).
 *    Ex.: `RelatorioComparativoVerbas_Antigo.txt` + `RelatorioComparativoVerbas_Atual.txt`.
 *  - Funciona com ou sem pasta `comparacao/`.
 *  - Compatível com `tipo = comparacao_base/comparacao_atual` ou `tipo = base/atual`.
 *  - Fallback: pasta `comparacao/` com exatamente 2 arquivos sem sufixo claro → par automático.
 *  - Exige par completo (base + atual) para devolver.
 */
export function pairBaseAtual(evids: Evidencia[]): ComparisonPair[] {
  const pairs = new Map<string, ComparisonPair>();

  // 1) Pareamento por nome lógico (qualquer lugar). Agrupa por logicalName + extensão.
  const byLogical = new Map<string, Evidencia[]>();
  evids.forEach((e) => {
    const side = classifySide(e);
    if (!side) return;
    const logical = logicalNameOf(e);
    if (!logical) return;
    const ext = (e.extensao || (e.nome_arquivo || "").split(".").pop() || "").toLowerCase();
    const key = `${logical}|${ext}`;
    const arr = byLogical.get(key) || [];
    arr.push(e);
    byLogical.set(key, arr);
  });
  byLogical.forEach((arr, key) => {
    const base = arr.find((e) => classifySide(e) === "base");
    const atual = arr.find((e) => classifySide(e) === "atual" && e !== base);
    if (!base || !atual) return;
    const ext = (base.extensao || atual.extensao || key.split("|")[1] || "").toLowerCase();
    const pkey = `name:${key}`;
    if (!pairs.has(pkey)) pairs.set(pkey, { key: pkey, base, atual, extensao: ext });
  });

  // 2) Fallback compatibilidade: pasta `comparacao/` com 2 arquivos quaisquer.
  const inCmp = evids.filter((e) => isInComparacaoFolder(e));
  const byFolder = new Map<string, Evidencia[]>();
  inCmp.forEach((e) => {
    const folder = (e.storage_path || "").split("/").slice(0, -1).join("/");
    if (!folder) return;
    const arr = byFolder.get(folder) || [];
    arr.push(e);
    byFolder.set(folder, arr);
  });
  byFolder.forEach((arr, folder) => {
    if (arr.length < 2) return;
    // Se algum desse folder já foi pareado pela regra 1, pula.
    const alreadyPaired = arr.some((e) =>
      Array.from(pairs.values()).some((p) => p.base?.id === e.id || p.atual?.id === e.id),
    );
    if (alreadyPaired) return;
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
    if (!base || !atual) return;
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
