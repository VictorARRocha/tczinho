import { supabase } from "@/lib/supabase";
import type { Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso } from "@/types/db";

// ---------------------------------------------------------------------
// Resiliência: o schema do Supabase pode estar incompleto (migration
// ainda não aplicada). Detectamos erro 42703 (coluna inexistente) /
// 42P01 (tabela inexistente) e degradamos com graça.
// ---------------------------------------------------------------------
const isMissingColumn = (e: any) =>
  e?.code === "42703" || /column .* does not exist/i.test(e?.message || "");
const isMissingTable = (e: any) =>
  e?.code === "42P01" || /relation .* does not exist/i.test(e?.message || "");
const isSoftSchemaError = (e: any) => isMissingColumn(e) || isMissingTable(e);

const DEFAULT_MODULES: Modulo[] = [
  { slug: "folha", nome: "Folha", ordem: 1 },
  { slug: "fiscal", nome: "Fiscal", ordem: 2 },
  { slug: "contabil", nome: "Contábil", ordem: 3 },
  { slug: "geral", nome: "Geral", ordem: 4 },
  { slug: "obrigacoes", nome: "Obrigações", ordem: 5 },
  { slug: "cadastros", nome: "Cadastros", ordem: 6 },
  { slug: "relatorios", nome: "Relatórios", ordem: 7 },
].map((m, i) => ({
  id: `default-${m.slug}`,
  slug: m.slug,
  nome: m.nome,
  descricao: null,
  icone: null,
  ativo: true,
  ordem: m.ordem,
  created_at: new Date(0).toISOString(),
} as any));

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normModulo = (m: any): Modulo => ({
  ...m,
  id: m?.id ?? m?.id_modulo,
  slug: m?.slug || slugify(m?.nome || ""),
  ativo: m?.ativo ?? true,
  ordem: m?.ordem ?? 0,
});
const normRodagem = (r: any): Rodagem => ({ ...r, id: r?.id ?? r?.id_rodagem });
const normFalha = (f: any): Falha => ({ ...f, id: f?.id ?? f?.id_falha });
const normEvid = (e: any): Evidencia => ({ ...e, id: e?.id ?? e?.id_evidencia });

// ---------- MODULOS ----------
export async function fetchModules(): Promise<Modulo[]> {
  // Tentativa 1: schema completo
  let { data, error } = await supabase
    .from("modulos")
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });

  // Fallback: schema mínimo
  if (error && isSoftSchemaError(error)) {
    const r = await supabase.from("modulos").select("*");
    if (r.error && !isSoftSchemaError(r.error)) throw r.error;
    data = r.data || [];
    error = null;
  }
  if (error && !isSoftSchemaError(error)) throw error;

  const rows = (data || []).map(normModulo);
  // Garante que os 7 módulos padrão sempre aparecem
  const bySlug = new Map(rows.map((m) => [m.slug, m]));
  for (const def of DEFAULT_MODULES) if (!bySlug.has(def.slug)) bySlug.set(def.slug, def);

  return Array.from(bySlug.values()).sort(
    (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome),
  );
}

// ---------- helpers genéricos ----------
async function safeQuery<T>(run: () => any): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) {
      if (isSoftSchemaError(error)) return [];
      throw error;
    }
    return (data || []) as T[];
  } catch (e: any) {
    if (isSoftSchemaError(e)) return [];
    throw e;
  }
}

// ---------- RODAGENS ----------
export async function fetchLatestRunByModule(slug: string): Promise<Rodagem | null> {
  const list = await fetchRunsByModule(slug);
  return list[0] || null;
}

export async function fetchRunsByModule(slug: string): Promise<Rodagem[]> {
  // schema completo
  let { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .eq("modulo_slug", slug)
    .order("data_analise", { ascending: false, nullsFirst: false });

  if (error && isSoftSchemaError(error)) {
    // sem modulo_slug → tenta retornar tudo e filtrar client-side
    const r = await supabase.from("rodagens").select("*");
    if (r.error) {
      if (isSoftSchemaError(r.error)) return [];
      throw r.error;
    }
    data = (r.data || []).filter((x: any) => !x.modulo_slug || x.modulo_slug === slug);
    error = null;
  }
  if (error) throw error;

  const rows = (data || []).map(normRodagem);
  rows.sort((a: any, b: any) => {
    const da = a.data_analise || a.created_at || "";
    const db = b.data_analise || b.created_at || "";
    return db.localeCompare(da);
  });
  return rows;
}

export async function fetchRunById(id: string): Promise<Rodagem | null> {
  const r = await supabase.from("rodagens").select("*").eq("id", id).maybeSingle();
  if (!r.error && r.data) return normRodagem(r.data);
  const r2 = await supabase.from("rodagens").select("*").eq("id_rodagem", id).maybeSingle();
  if (r2.error && !isSoftSchemaError(r2.error)) throw r2.error;
  return r2.data ? normRodagem(r2.data) : null;
}

// ---------- FALHAS / EVIDÊNCIAS / GRUPOS / PASSOS ----------
export async function fetchFailuresByRun(runId: string): Promise<Falha[]> {
  const rows = await safeQuery<any>(() =>
    supabase
      .from("falhas")
      .select("*")
      .eq("rodagem_id", runId)
      .order("ordem_prioridade", { ascending: true, nullsFirst: false }),
  );
  return rows.map(normFalha);
}

export async function fetchEvidenceByRun(runId: string): Promise<Evidencia[]> {
  const rows = await safeQuery<any>(() =>
    supabase.from("evidencias").select("*").eq("rodagem_id", runId),
  );
  return rows.map(normEvid);
}

export async function fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]> {
  const rows = await safeQuery<any>(() =>
    supabase.from("evidencias").select("*").eq("falha_id", failureId),
  );
  return rows.map(normEvid);
}

export async function fetchGroupsByRun(runId: string): Promise<Agrupamento[]> {
  return safeQuery<Agrupamento>(() =>
    supabase.from("agrupamentos").select("*").eq("rodagem_id", runId),
  );
}

export async function fetchNextStepsByRun(runId: string): Promise<ProximoPasso[]> {
  return safeQuery<ProximoPasso>(() =>
    supabase.from("proximos_passos").select("*").eq("rodagem_id", runId),
  );
}

export async function fetchModuleDashboardData(slug: string) {
  const [modulos, runs] = await Promise.all([fetchModules(), fetchRunsByModule(slug)]);
  const modulo = modulos.find((m) => m.slug === slug) || null;
  const rodagem = runs[0] || null;
  if (!rodagem) {
    return { modulo, rodagem: null, falhas: [], evidencias: [], grupos: [], passos: [], historico: runs };
  }
  const [falhas, evidencias, grupos, passos] = await Promise.all([
    fetchFailuresByRun(rodagem.id),
    fetchEvidenceByRun(rodagem.id),
    fetchGroupsByRun(rodagem.id),
    fetchNextStepsByRun(rodagem.id),
  ]);
  return { modulo, rodagem, falhas, evidencias, grupos, passos, historico: runs };
}

export function subscribeToTable(
  table: "rodagens" | "falhas" | "evidencias" | "agrupamentos" | "proximos_passos" | "modulos",
  cb: (payload: any) => void,
) {
  const channel = supabase
    .channel(`realtime-${table}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, cb)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
