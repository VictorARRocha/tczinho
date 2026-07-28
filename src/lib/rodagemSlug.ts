import type { Rodagem } from "@/types/db";

export function normalizeSlugText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pad(n: number, size = 2) {
  return String(n).padStart(size, "0");
}

function pickDate(r: Partial<Rodagem>): Date | null {
  const raw = r.data_inicio_rodagem || (r as any).data_inicio || r.data_analise || r.created_at;
  if (!raw) return null;
  const d = new Date(raw as string);
  return isNaN(d.getTime()) ? null : d;
}

/** Slug base: versao + DDMMYYYY + HHMM (ex.: preclientes270720261716) */
export function createRodagemSlug(r: Partial<Rodagem> | null | undefined): string {
  if (!r) return "";
  const versao = normalizeSlugText(r.versao_sistema || r.sistema || "rodagem") || "rodagem";
  const d = pickDate(r);
  const data = d ? `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}` : "";
  const hora = d ? `${pad(d.getHours())}${pad(d.getMinutes())}` : "";
  return `${versao}${data}${hora}`;
}

function idSuffix(id?: string | null): string {
  const clean = normalizeSlugText(id);
  return clean ? clean.slice(-6) : "";
}

/**
 * Gera slugs únicos para a lista: mantém o slug bonito quando não há colisão,
 * e adiciona sufixo do id_rodagem quando duas rodagens colidem.
 */
export function buildRodagemSlugMap(runs: Rodagem[]): Map<string, string> {
  const counts = new Map<string, number>();
  runs.forEach((r) => {
    const base = createRodagemSlug(r);
    counts.set(base, (counts.get(base) || 0) + 1);
  });
  const map = new Map<string, string>();
  runs.forEach((r) => {
    const base = createRodagemSlug(r);
    const suffix = idSuffix(r.id);
    map.set(r.id, (counts.get(base) || 0) > 1 && suffix ? `${base}-${suffix}` : base);
  });
  return map;
}

export function rodagemSlugFor(runs: Rodagem[], run: Rodagem | null | undefined): string {
  if (!run) return "";
  return buildRodagemSlugMap(runs).get(run.id) || createRodagemSlug(run);
}

/** Encontra a rodagem correspondente ao slug da URL (aceita slug bonito, com sufixo ou id cru). */
export function findRodagemBySlug(runs: Rodagem[], slug: string | undefined): Rodagem | null {
  if (!slug) return null;
  const target = slug.toLowerCase();
  const map = buildRodagemSlugMap(runs);
  const exact = runs.find((r) => map.get(r.id) === target);
  if (exact) return exact;
  const byId = runs.find((r) => (r.id || "").toLowerCase() === target);
  if (byId) return byId;
  const byBase = runs.find((r) => createRodagemSlug(r) === target.split("-")[0]);
  return byBase || null;
}
