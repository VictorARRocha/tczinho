import { supabase } from "@/lib/supabase";
import type { Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso } from "@/types/db";

// =====================================================================
// Mapeamento para o schema REAL do Supabase (Tczinho):
//
//   modulos(id_modulo text PK, nome text UNIQUE)
//   rodagens(id_rodagem text PK, sistema, versao, data_inicio, caminho_logs,
//            total_falhas, total_clusters, created_at)
//   agrupamentos(id_cluster text PK, fk_rodagem -> rodagens, titulo_causa,
//                assinatura_tecnica, status, raio_x_negocio)
//   falhas(id_falha text PK, fk_cluster -> agrupamentos, fk_modulo -> modulos,
//          id_caso_teste, nome_mds, grupo, descricao, arquivo_origem)
//   evidencias(id_evidencia text PK, fk_falha -> falhas, tipo_arquivo,
//              conteudo_resumo, correlacao_visual, caminho_evidencia)
//   proximos_passos(id_acao text PK, fk_cluster -> agrupamentos, hipotese,
//                   acao_recomendada, confianca)
//
// A relação rodagem ↔ módulo é INDIRETA:
//   rodagem ── agrupamento(fk_rodagem) ── falha(fk_cluster, fk_modulo) ── modulo
// =====================================================================

const slugify = (s: string) =>
  (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const DEFAULT_MODULES = [
  { slug: "folha", nome: "Folha", ordem: 1 },
  { slug: "fiscal", nome: "Fiscal", ordem: 2 },
  { slug: "contabil", nome: "Contábil", ordem: 3 },
  { slug: "geral", nome: "Geral", ordem: 4 },
  { slug: "obrigacoes", nome: "Obrigações", ordem: 5 },
  { slug: "cadastros", nome: "Cadastros", ordem: 6 },
  { slug: "relatorios", nome: "Relatórios", ordem: 7 },
];

// ---------- Normalizadores ----------
function normModulo(row: any, ordem = 0): Modulo {
  const nome = row?.nome ?? "";
  return {
    id: row?.id_modulo ?? row?.id ?? slugify(nome),
    slug: slugify(nome),
    nome,
    descricao: null,
    icone: null,
    ativo: true,
    ordem,
    created_at: row?.created_at ?? new Date(0).toISOString(),
  };
}

function normRodagem(row: any, modulo_slug = ""): Rodagem {
  return {
    id: row?.id_rodagem,
    modulo_id: null,
    modulo_slug,
    sistema: row?.sistema ?? null,
    ambiente: null,
    origem: null,
    ferramenta_analise: null,
    data_inicio_rodagem: row?.data_inicio ?? null,
    data_fim_rodagem: null,
    data_analise: row?.data_inicio ?? row?.created_at ?? null,
    branch: null,
    versao_sistema: row?.versao ?? null,
    maquina: null,
    responsavel: null,
    pasta_origem: row?.caminho_logs ?? null,
    status_geral: null,
    status_label: null,
    status_cor: null,
    score_saude: null,
    diagnostico_curto: null,
    diagnostico_detalhado: null,
    conclusao_geral: null,
    total_compactados: 0,
    total_analisados: 0,
    total_falhas: row?.total_falhas ?? 0,
    total_automacao: 0,
    total_massa_dados: 0,
    total_ambiente: 0,
    total_possivel_funcional: 0,
    total_inconclusivo: 0,
    total_alta: 0,
    total_media: 0,
    total_baixa: 0,
    json_original: null,
    created_at: row?.created_at ?? "",
  };
}

function normFalha(row: any, rodagem_id = "", modulo_slug = ""): Falha {
  return {
    id: row?.id_falha,
    rodagem_id,
    modulo_slug,
    ordem_prioridade: null,
    arquivo_zip: row?.arquivo_origem ?? null,
    arquivo_txt: null,
    arquivo_print: null,
    caso_identificado: !!row?.id_caso_teste,
    id_caso_teste: row?.id_caso_teste ?? null,
    caso_teste_provavel: row?.nome_mds ?? null,
    grupo: row?.grupo ?? null,
    subgrupo: null,
    rotina_funcional: null,
    descricao_caso: row?.descricao ?? null,
    confianca_associacao: null,
    erro_titulo: row?.nome_mds ?? null,
    erro_principal: row?.descricao ?? null,
    mensagem_principal: row?.descricao ?? null,
    trecho_relevante: null,
    call_stack_resumido: null,
    tipo_tecnico: null,
    formulario_ou_tela: null,
    componente: null,
    classificacao: null,
    classificacao_label: null,
    severidade: null,
    confianca: null,
    status_analise: null,
    cor: null,
    fato_observado: null,
    hipotese_principal: null,
    analise_tecnica: null,
    analise_funcional: null,
    impacto_possivel: null,
    primeira_acao_recomendada: null,
    informacoes_faltantes: null,
    tags: null,
    created_at: row?.created_at ?? "",
  };
}

function inferTipo(t?: string | null, path?: string | null): string {
  const v = (t || "").toLowerCase();
  if (v.includes("print") || v.includes("img") || v.includes("png") || v.includes("jpg")) return "print";
  if (v.includes("txt") || v.includes("log")) return "txt";
  if (v.includes("zip")) return "zip";
  const ext = (path || "").toLowerCase().split(".").pop() || "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "print";
  if (["txt", "log"].includes(ext)) return "txt";
  if (ext === "zip") return "zip";
  return v || "outro";
}

function normEvidencia(row: any, rodagem_id = "", modulo_slug = ""): Evidencia {
  const tipo = inferTipo(row?.tipo_arquivo, row?.caminho_evidencia);
  return {
    id: row?.id_evidencia,
    falha_id: row?.fk_falha,
    rodagem_id,
    modulo_slug,
    tipo,
    nome_arquivo: row?.caminho_evidencia ? String(row.caminho_evidencia).split("/").pop() || null : null,
    storage_path: row?.caminho_evidencia ?? null,
    public_url: row?.caminho_evidencia ?? null,
    signed_url: null,
    conteudo_texto: row?.conteudo_resumo ?? null,
    mime_type: null,
    tamanho_bytes: null,
    print_util: tipo === "print",
    imagem_descricao: row?.correlacao_visual ?? null,
    created_at: row?.created_at ?? "",
  };
}

function normAgrupamento(row: any, modulo_slug = "", quantidade = 0): Agrupamento {
  return {
    id: row?.id_cluster,
    rodagem_id: row?.fk_rodagem,
    modulo_slug,
    tipo: row?.status ?? null,
    titulo: row?.titulo_causa ?? null,
    descricao: row?.assinatura_tecnica ?? null,
    quantidade,
    classificacao_predominante: null,
    severidade_predominante: null,
    arquivos_relacionados: null,
    acao_recomendada: row?.raio_x_negocio ?? null,
    created_at: row?.created_at ?? "",
  };
}

function normPasso(row: any, rodagem_id = "", modulo_slug = ""): ProximoPasso {
  // Prioridade derivada do número confianca (0-100)
  const c = Number(row?.confianca ?? 0);
  let prioridade: string | null = null;
  if (c >= 80) prioridade = "Alta";
  else if (c >= 50) prioridade = "Média";
  else if (c > 0) prioridade = "Baixa";
  return {
    id: row?.id_acao,
    rodagem_id,
    modulo_slug,
    categoria: "qa",
    prioridade,
    descricao: row?.acao_recomendada ?? "",
    relacionado_a: row?.hipotese ?? null,
    concluido: false,
    created_at: row?.created_at ?? "",
  };
}

// =====================================================================
// MÓDULOS
// =====================================================================
export async function fetchModules(): Promise<Modulo[]> {
  const { data, error } = await supabase.from("modulos").select("*").order("nome", { ascending: true });
  if (error) console.error("[fetchModules]", error);

  const dbRows = (data || []).map((row: any, i: number) => normModulo(row, i + 100));
  const bySlug = new Map(dbRows.map((m) => [m.slug, m]));

  // Garante os 7 módulos padrão sempre presentes
  DEFAULT_MODULES.forEach((d) => {
    if (!bySlug.has(d.slug)) {
      bySlug.set(d.slug, {
        id: `default-${d.slug}`,
        slug: d.slug,
        nome: d.nome,
        descricao: null,
        icone: null,
        ativo: true,
        ordem: d.ordem,
        created_at: new Date(0).toISOString(),
      });
    } else {
      const m = bySlug.get(d.slug)!;
      m.ordem = d.ordem;
    }
  });

  return Array.from(bySlug.values()).sort(
    (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome),
  );
}

async function getModuloIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase.from("modulos").select("id_modulo, nome");
  if (error || !data) return null;
  const found = data.find((m: any) => slugify(m.nome) === slug);
  return found?.id_modulo ?? null;
}

// =====================================================================
// RODAGENS
// =====================================================================
export async function fetchRunsByModule(slug: string): Promise<Rodagem[]> {
  const moduloId = await getModuloIdBySlug(slug);
  if (!moduloId) return [];

  // 1) clusters cujas falhas pertencem ao módulo
  const { data: falhasMod } = await supabase
    .from("falhas")
    .select("fk_cluster")
    .eq("fk_modulo", moduloId);
  const clusterIds = Array.from(new Set((falhasMod || []).map((f: any) => f.fk_cluster).filter(Boolean)));
  if (clusterIds.length === 0) return [];

  // 2) rodagens vinculadas a esses clusters
  const { data: clusters } = await supabase
    .from("agrupamentos")
    .select("fk_rodagem")
    .in("id_cluster", clusterIds);
  const rodagemIds = Array.from(new Set((clusters || []).map((c: any) => c.fk_rodagem).filter(Boolean)));
  if (rodagemIds.length === 0) return [];

  // 3) carrega rodagens
  const { data: rods, error } = await supabase
    .from("rodagens")
    .select("*")
    .in("id_rodagem", rodagemIds)
    .order("data_inicio", { ascending: false });
  if (error) {
    console.error("[fetchRunsByModule]", error);
    return [];
  }
  return (rods || []).map((r: any) => normRodagem(r, slug));
}

export async function fetchLatestRunByModule(slug: string): Promise<Rodagem | null> {
  const list = await fetchRunsByModule(slug);
  return list[0] || null;
}

export async function fetchRunById(id: string): Promise<Rodagem | null> {
  const { data, error } = await supabase.from("rodagens").select("*").eq("id_rodagem", id).maybeSingle();
  if (error) {
    console.error("[fetchRunById]", error);
    return null;
  }
  return data ? normRodagem(data) : null;
}

// =====================================================================
// FALHAS / EVIDÊNCIAS / GRUPOS / PASSOS
// =====================================================================
async function clustersOfRun(runId: string): Promise<string[]> {
  const { data } = await supabase.from("agrupamentos").select("id_cluster").eq("fk_rodagem", runId);
  return (data || []).map((c: any) => c.id_cluster).filter(Boolean);
}

export async function fetchFailuresByRun(runId: string): Promise<Falha[]> {
  const clusterIds = await clustersOfRun(runId);
  if (clusterIds.length === 0) return [];
  const { data, error } = await supabase.from("falhas").select("*").in("fk_cluster", clusterIds);
  if (error) {
    console.error("[fetchFailuresByRun]", error);
    return [];
  }
  return (data || []).map((f: any) => normFalha(f, runId));
}

export async function fetchEvidenceByRun(runId: string): Promise<Evidencia[]> {
  const falhas = await fetchFailuresByRun(runId);
  const ids = falhas.map((f) => f.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("evidencias").select("*").in("fk_falha", ids);
  if (error) {
    console.error("[fetchEvidenceByRun]", error);
    return [];
  }
  return (data || []).map((e: any) => normEvidencia(e, runId));
}

export async function fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]> {
  const { data, error } = await supabase.from("evidencias").select("*").eq("fk_falha", failureId);
  if (error) {
    console.error("[fetchEvidenceByFailure]", error);
    return [];
  }
  return (data || []).map((e: any) => normEvidencia(e));
}

export async function fetchGroupsByRun(runId: string): Promise<Agrupamento[]> {
  const { data, error } = await supabase.from("agrupamentos").select("*").eq("fk_rodagem", runId);
  if (error) {
    console.error("[fetchGroupsByRun]", error);
    return [];
  }
  // contagem por cluster
  const ids = (data || []).map((g: any) => g.id_cluster);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: fs } = await supabase.from("falhas").select("fk_cluster").in("fk_cluster", ids);
    (fs || []).forEach((f: any) => {
      counts.set(f.fk_cluster, (counts.get(f.fk_cluster) || 0) + 1);
    });
  }
  return (data || []).map((g: any) => normAgrupamento(g, "", counts.get(g.id_cluster) || 0));
}

export async function fetchNextStepsByRun(runId: string): Promise<ProximoPasso[]> {
  const clusterIds = await clustersOfRun(runId);
  if (clusterIds.length === 0) return [];
  const { data, error } = await supabase.from("proximos_passos").select("*").in("fk_cluster", clusterIds);
  if (error) {
    console.error("[fetchNextStepsByRun]", error);
    return [];
  }
  return (data || []).map((p: any) => normPasso(p, runId));
}

// =====================================================================
// Dashboard agregado (opcional)
// =====================================================================
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

// =====================================================================
// Realtime
// =====================================================================
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
