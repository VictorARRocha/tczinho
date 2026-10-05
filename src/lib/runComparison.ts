// =====================================================================
// Comparacao entre duas rodagens do mesmo modulo.
//
// A chave e o ID do caso de teste (ex.: "3.1.2"): cada rodagem gera ids
// tecnicos proprios para as falhas, mas o caso e o mesmo. Um caso pode ter
// mais de uma falha na mesma rodagem (varios compactados); todas ficam juntas.
// =====================================================================
import type { Falha, Rodagem } from "@/types/db";
import type { OccurrenceType } from "@/lib/occurrence";

export type CaseStatus = "nova" | "persistente" | "resolvida";

export interface CaseComparison {
  key: string;
  caseId: string | null;
  nome: string;
  status: CaseStatus;
  /** Falhas do caso na rodagem mais antiga. */
  antes: Falha[];
  /** Falhas do caso na rodagem mais recente. */
  depois: Falha[];
  tipoAntes: OccurrenceType | null;
  tipoDepois: OccurrenceType | null;
  /** Persistente que mudou de natureza (ex.: era quebra, virou diferenca). */
  tipoMudou: boolean;
}

export interface RunComparisonSummary {
  novas: number;
  persistentes: number;
  resolvidas: number;
  tipoMudou: number;
}

const STATUS_ORDER: Record<CaseStatus, number> = { nova: 0, persistente: 1, resolvida: 2 };

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

/** Tipo da ocorrencia a partir do que a API informa (occurrence_type / status do Python). */
export function occurrenceTypeOf(f: Falha): OccurrenceType {
  const rec = f as unknown as Record<string, unknown>;
  const raw = [rec.tipo_ocorrencia, rec.occurrence_type, rec.tipo_detectado_python, rec.status]
    .map(text)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const hasBreak = /break|quebra/.test(raw);
  const hasDiff = /difference|diferenca|comparacao/.test(raw);
  if (raw.includes("with_difference") || (hasBreak && hasDiff)) return "quebra_diferenca";
  if (hasDiff) return "diferenca";
  return "quebra";
}

function aggregateType(falhas: Falha[]): OccurrenceType | null {
  if (falhas.length === 0) return null;
  const tipos = new Set(falhas.map(occurrenceTypeOf));
  if (tipos.has("quebra_diferenca") || (tipos.has("quebra") && tipos.has("diferenca"))) return "quebra_diferenca";
  return tipos.has("diferenca") ? "diferenca" : "quebra";
}

/** Chave do caso: ID numerico do caso; sem ele, o nome do compactado; por ultimo o id da falha. */
export function caseKeyOf(f: Falha): string {
  const id = text(f.id_caso_teste).match(/\d+(?:\.\d+)*/);
  if (id) return id[0];
  const archive = text(f.arquivo_zip || (f as unknown as Record<string, unknown>).arquivo_origem).trim().toLowerCase();
  return archive ? `arquivo:${archive}` : `falha:${f.id}`;
}

function caseIdSortKey(caseId: string | null): number[] {
  return (caseId || "").split(".").map((part) => Number(part) || 0);
}

function compareCaseIds(a: string | null, b: string | null): number {
  const pa = caseIdSortKey(a);
  const pb = caseIdSortKey(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff) return diff;
  }
  return 0;
}

function caseName(falhas: Falha[]): string {
  for (const f of falhas) {
    const nome = text(f.caso_teste_provavel || (f as unknown as Record<string, unknown>).nome_mds).trim();
    if (nome && !/n[aã]o encontrado/i.test(nome)) return nome;
  }
  return "";
}

export function compareRuns(antes: Falha[], depois: Falha[]): { itens: CaseComparison[]; resumo: RunComparisonSummary } {
  const byKey = new Map<string, { antes: Falha[]; depois: Falha[] }>();
  const add = (f: Falha, side: "antes" | "depois") => {
    const key = caseKeyOf(f);
    const entry = byKey.get(key) || { antes: [], depois: [] };
    entry[side].push(f);
    byKey.set(key, entry);
  };
  antes.forEach((f) => add(f, "antes"));
  depois.forEach((f) => add(f, "depois"));

  const itens: CaseComparison[] = [];
  byKey.forEach((entry, key) => {
    const status: CaseStatus = entry.antes.length === 0 ? "nova" : entry.depois.length === 0 ? "resolvida" : "persistente";
    const tipoAntes = aggregateType(entry.antes);
    const tipoDepois = aggregateType(entry.depois);
    const all = [...entry.depois, ...entry.antes];
    itens.push({
      key,
      caseId: /^\d/.test(key) ? key : null,
      nome: caseName(all),
      status,
      antes: entry.antes,
      depois: entry.depois,
      tipoAntes,
      tipoDepois,
      tipoMudou: status === "persistente" && tipoAntes !== tipoDepois,
    });
  });

  itens.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || compareCaseIds(a.caseId, b.caseId) || a.key.localeCompare(b.key));

  return {
    itens,
    resumo: {
      novas: itens.filter((i) => i.status === "nova").length,
      persistentes: itens.filter((i) => i.status === "persistente").length,
      resolvidas: itens.filter((i) => i.status === "resolvida").length,
      tipoMudou: itens.filter((i) => i.tipoMudou).length,
    },
  };
}

function runTime(r: Rodagem): number {
  const raw = r.data_inicio_rodagem || (r as unknown as { data_inicio?: string }).data_inicio || r.data_analise || r.created_at;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Ordena o par escolhido: [mais antiga, mais recente], seja qual for a ordem da selecao. */
export function orderRuns(a: Rodagem, b: Rodagem): [Rodagem, Rodagem] {
  return runTime(a) <= runTime(b) ? [a, b] : [b, a];
}

/**
 * Casos "resolvidos" so significam "passou" se a rodagem mais recente executou
 * esses casos. Quando o total executado difere muito (ex.: reexecucao parcial),
 * a tela avisa.
 */
export function executedCountsDiffer(antiga: Rodagem, recente: Rodagem): boolean {
  const a = Number(antiga.total_analisados) || 0;
  const b = Number(recente.total_analisados) || 0;
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(a, b) > 0.2;
}
