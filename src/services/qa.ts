import { supabase } from "@/lib/supabase";
import type { Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso } from "@/types/db";

// Normalizadores: o banco usa id_modulo/id_rodagem/id_falha/id_evidencia
// e o app usa .id. Garantimos ambos preenchidos.
const normModulo = (m: any): Modulo => ({ ...m, id: m?.id ?? m?.id_modulo });
const normRodagem = (r: any): Rodagem => ({ ...r, id: r?.id ?? r?.id_rodagem });
const normFalha = (f: any): Falha => ({ ...f, id: f?.id ?? f?.id_falha });
const normEvid = (e: any): Evidencia => ({ ...e, id: e?.id ?? e?.id_evidencia });

export async function fetchModules(): Promise<Modulo[]> {
  const { data, error } = await supabase
    .from("modulos")
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data || []).map(normModulo);
}

export async function fetchLatestRunByModule(slug: string): Promise<Rodagem | null> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .eq("modulo_slug", slug)
    .order("data_analise", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normRodagem(data) : null;
}

export async function fetchRunsByModule(slug: string): Promise<Rodagem[]> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .eq("modulo_slug", slug)
    .order("data_analise", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normRodagem);
}

export async function fetchRunById(id: string): Promise<Rodagem | null> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .or(`id.eq.${id},id_rodagem.eq.${id}`)
    .maybeSingle();
  if (error) throw error;
  return data ? normRodagem(data) : null;
}

export async function fetchFailuresByRun(runId: string): Promise<Falha[]> {
  const { data, error } = await supabase
    .from("falhas")
    .select("*")
    .eq("rodagem_id", runId)
    .order("ordem_prioridade", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(normFalha);
}

export async function fetchEvidenceByRun(runId: string): Promise<Evidencia[]> {
  const { data, error } = await supabase.from("evidencias").select("*").eq("rodagem_id", runId);
  if (error) throw error;
  return (data || []).map(normEvid);
}

export async function fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]> {
  const { data, error } = await supabase.from("evidencias").select("*").eq("falha_id", failureId);
  if (error) throw error;
  return (data || []).map(normEvid);
}

export async function fetchGroupsByRun(runId: string): Promise<Agrupamento[]> {
  const { data, error } = await supabase.from("agrupamentos").select("*").eq("rodagem_id", runId);
  if (error) throw error;
  return data || [];
}

export async function fetchNextStepsByRun(runId: string): Promise<ProximoPasso[]> {
  const { data, error } = await supabase.from("proximos_passos").select("*").eq("rodagem_id", runId);
  if (error) throw error;
  return data || [];
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
