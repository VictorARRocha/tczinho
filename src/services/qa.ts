import { supabase } from "@/lib/supabase";
import type { Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso } from "@/types/db";

export async function fetchModules(): Promise<Modulo[]> {
  const { data, error } = await supabase.from("modulos").select("*").eq("ativo", true).order("nome");
  if (error) throw error;
  return data || [];
}

export async function fetchLatestRunByModule(slug: string): Promise<Rodagem | null> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .eq("modulo_slug", slug)
    .order("data_analise", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRunsByModule(slug: string): Promise<Rodagem[]> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .eq("modulo_slug", slug)
    .order("data_analise", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchRunById(id: string): Promise<Rodagem | null> {
  const { data, error } = await supabase.from("rodagens").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchFailuresByRun(runId: string): Promise<Falha[]> {
  const { data, error } = await supabase
    .from("falhas")
    .select("*")
    .eq("rodagem_id", runId)
    .order("ordem_prioridade", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function fetchEvidenceByRun(runId: string): Promise<Evidencia[]> {
  const { data, error } = await supabase.from("evidencias").select("*").eq("rodagem_id", runId);
  if (error) throw error;
  return data || [];
}

export async function fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]> {
  const { data, error } = await supabase.from("evidencias").select("*").eq("falha_id", failureId);
  if (error) throw error;
  return data || [];
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

export function subscribeToTable(
  table: "rodagens" | "falhas" | "evidencias" | "agrupamentos" | "proximos_passos",
  cb: (payload: any) => void,
) {
  const channel = supabase
    .channel(`realtime-${table}-${Math.random()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, cb)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
