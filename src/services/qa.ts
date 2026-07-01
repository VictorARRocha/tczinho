import { supabase, STORAGE_BUCKET, STORAGE_BUCKET_FALLBACKS } from "@/lib/supabase";
import type { Modulo, Rodagem, Falha, Evidencia, Agrupamento, ProximoPasso, AtrasoRodagem } from "@/types/db";

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

// Módulos OFICIAIS do sistema (filtro fixo da UI)
const DEFAULT_MODULES = [
  { slug: "folha", nome: "Folha", ordem: 1 },
  { slug: "fiscal", nome: "Fiscal", ordem: 2 },
  { slug: "contabil", nome: "Contábil", ordem: 3 },
  { slug: "gestao", nome: "Gestão", ordem: 4 },
  { slug: "financeiro", nome: "Financeiro", ordem: 5 },
  { slug: "geral", nome: "Geral", ordem: 6 },
];
const OFFICIAL_SLUGS = new Set(DEFAULT_MODULES.map((m) => m.slug));

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

function inferTipo(t?: string | null, path?: string | null, mime?: string | null): string {
  const v = (t || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  const ext = (path || "").toLowerCase().split(".").pop() || "";
  if (v === "rar" || ext === "rar" || m.includes("rar")) return "rar";
  if (v.includes("print") || v.includes("img") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) || m.startsWith("image/")) return "print";
  if (v === "log" || ext === "log") return "log";
  if (v.includes("txt") || ext === "txt" || m.startsWith("text/")) return "txt";
  if (v === "pdf" || ext === "pdf" || m.includes("pdf")) return "pdf";
  if (v.includes("zip") || ext === "zip" || m.includes("zip")) return "zip";
  return v || "outro";
}

function normEvidencia(row: any, rodagem_id = "", modulo_slug = ""): Evidencia {
  const path = row?.storage_path ?? row?.caminho_evidencia ?? null;
  const mime = row?.mime_type ?? null;
  const rawTipo = row?.tipo ?? row?.tipo_arquivo;
  const tipo = inferTipo(rawTipo, path, mime);
  const nome = row?.nome_arquivo ?? (path ? String(path).split("/").pop() || null : null);
  const ext = row?.extensao ?? (nome ? (nome.split(".").pop() || "").toLowerCase() : null);
  const isImage =
    tipo === "print" ||
    (mime || "").toLowerCase().startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes((ext || "").toLowerCase());
  const inComparacaoFolder = typeof path === "string" && /(^|\/)comparacao\//i.test(path);
  const explicitComparacao = String(rawTipo || "").toLowerCase() === "comparacao";
  const finalTipo = explicitComparacao || inComparacaoFolder ? "comparacao" : (isImage ? "print" : tipo);
  return {
    id: row?.id_evidencia ?? row?.id,
    falha_id: row?.falha_id ?? row?.fk_falha,
    rodagem_id: row?.rodagem_id ?? rodagem_id,
    modulo_slug: row?.modulo_slug ?? modulo_slug,
    tipo: finalTipo,
    nome_arquivo: nome,
    bucket: row?.bucket ?? STORAGE_BUCKET,
    storage_path: path,
    public_url: row?.public_url ?? null,
    signed_url: row?.signed_url ?? null,
    url_expira_em: row?.url_expira_em ?? null,
    conteudo_texto: row?.conteudo_texto ?? row?.conteudo_resumo ?? null,
    mime_type: mime,
    extensao: ext,
    tamanho_bytes: row?.tamanho_bytes ?? null,
    print_util: isImage,
    imagem_descricao: row?.imagem_descricao ?? row?.correlacao_visual ?? null,
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
// TESTCASE HIERARCHY (fonte real de nomes de grupos/casos vinda do .mds)
// =====================================================================
export interface TestcaseHierarchyNode {
  node_id: string;
  parent_node_id: string | null;
  node_name: string;
  node_type: string | null;
  full_path_ids: string | null;
  full_path_names: string | null;
  full_path_label: string | null;
  script_name: string | null;
  procedure_name: string | null;
  modulo_codigo: string | null;
  modulo_nome: string | null;
  sistema: string | null;
}

const MODULE_CODE_MAP: Record<string, string[]> = {
  folha: ["1"],
  fiscal: ["2"],
  contabil: ["3", "4", "7"],
  financeiro: ["5"],
  geral: ["6"],
  gestao: ["9"],
};

export async function fetchTestcaseHierarchy(slug: string): Promise<TestcaseHierarchyNode[]> {
  const codes = MODULE_CODE_MAP[slug] || [];
  let query = supabase
    .from("testcase_hierarchy")
    .select("node_id,parent_node_id,node_name,node_type,full_path_ids,full_path_names,full_path_label,script_name,procedure_name,modulo_codigo,modulo_nome,sistema");

  if (codes.length) {
    const parts: string[] = [];
    for (const c of codes) {
      parts.push(`modulo_codigo.eq.${c}`);
      parts.push(`node_id.eq.${c}`);
      parts.push(`node_id.like.${c}.*`);
    }
    query = query.or(parts.join(","));
  }

  const { data, error } = await query.limit(5000);
  if (error) {
    // Tabela pode ainda não existir — degrada silenciosamente
    if (!/does not exist|schema cache|PGRST205/i.test(error.message || "")) {
      console.warn("[fetchTestcaseHierarchy]", error);
    }
    return [];
  }
  return (data || []) as TestcaseHierarchyNode[];
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

  return Array.from(bySlug.values())
    .filter((m) => OFFICIAL_SLUGS.has(m.slug))
    .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome));
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
  // 1) Try direct lookup by rodagem_id (newer schema)
  const direct = await supabase.from("evidencias").select("*").eq("rodagem_id", runId);
  if (!direct.error && direct.data && direct.data.length > 0) {
    return direct.data.map((e: any) => normEvidencia(e, runId));
  }
  // 2) Fallback: lookup via failures of the run
  const falhas = await fetchFailuresByRun(runId);
  const ids = falhas.map((f) => f.id);
  if (ids.length === 0) return [];
  let res = await supabase.from("evidencias").select("*").in("falha_id", ids);
  if (res.error || !res.data || res.data.length === 0) {
    const fb = await supabase.from("evidencias").select("*").in("fk_falha", ids);
    if (!fb.error) res = fb as any;
  }
  if (res.error) {
    console.error("[fetchEvidenceByRun]", res.error);
    return [];
  }
  return (res.data || []).map((e: any) => normEvidencia(e, runId));
}

export async function fetchEvidenceByFailure(failureId: string): Promise<Evidencia[]> {
  let res = await supabase.from("evidencias").select("*").eq("falha_id", failureId);
  if (res.error || !res.data || res.data.length === 0) {
    const fb = await supabase.from("evidencias").select("*").eq("fk_falha", failureId);
    if (!fb.error) res = fb as any;
  }
  if (res.error) {
    console.error("[fetchEvidenceByFailure]", res.error);
    return [];
  }
  return (res.data || []).map((e: any) => normEvidencia(e));
}

// =====================================================================
// STORAGE: lista arquivos do bucket evidencias-rodagens vinculados a uma rodagem
// Estrutura real esperada:
//   {moduloSlug}/{rodagemFolder}/falhas/{pastaDaFalha}/{comparacao|imagens|zip|...}/arquivo
// Se a pasta da falha tiver subpasta `comparacao`, classificamos a ocorrência
// como Diferença e usamos os arquivos dentro dela como par base/atual.
// =====================================================================
async function listAllUnderBucket(bucket: string, prefix: string): Promise<{ path: string; meta: any }[]> {
  const out: { path: string; meta: any }[] = [];
  const stack = [prefix.replace(/\/+$/, "")];
  let safety = 0;
  while (stack.length && safety++ < 500) {
    const cur = stack.pop()!;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(cur, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) continue;
    for (const item of data || []) {
      const full = cur ? `${cur}/${item.name}` : item.name;
      if ((item as any).id == null && !item.metadata) stack.push(full);
      else out.push({ path: full, meta: item });
    }
  }
  return out;
}

async function listAllUnder(prefix: string): Promise<{ bucket: string; path: string; meta: any }[]> {
  const buckets = [STORAGE_BUCKET, ...STORAGE_BUCKET_FALLBACKS];
  for (const b of buckets) {
    const r = await listAllUnderBucket(b, prefix);
    if (r.length > 0) return r.map((x) => ({ bucket: b, ...x }));
  }
  return [];
}

function lastSegment(p?: string | null): string {
  if (!p) return "";
  return p.toString().split(/[\\/]/).filter(Boolean).pop() || "";
}

export async function listStorageFilesByRun(
  runId: string,
  moduloSlug?: string,
  pastaOrigem?: string | null,
): Promise<Evidencia[]> {
  if (!runId && !pastaOrigem) return [];
  const runFolder = lastSegment(pastaOrigem) || runId;

  // Ordem de candidatos prioriza estrutura real: {modulo}/{rodagem}/falhas
  const candidates = Array.from(
    new Set(
      [
        moduloSlug ? `${moduloSlug}/${runFolder}` : "",
        moduloSlug ? `${moduloSlug}/${runId}` : "",
        runFolder,
        runId,
        `rodagens/${runFolder}`,
        `rodagens/${runId}`,
      ].filter(Boolean),
    ),
  );

  let collected: { bucket: string; path: string; meta: any }[] = [];
  let usedRoot = "";
  for (const prefix of candidates) {
    const files = await listAllUnder(prefix);
    if (files.length > 0) {
      collected = files;
      usedRoot = prefix;
      break;
    }
  }
  if (collected.length === 0) return [];
  console.log(`[storage] ${collected.length} arquivos em ${usedRoot}`);

  return collected.map((f) => {
    const name = f.path.split("/").pop() || f.path;
    const ext = (name.split(".").pop() || "").toLowerCase();
    const mime = (f.meta?.metadata?.mimetype as string | undefined) ?? null;
    const isComparacao = /\/comparacao\//i.test(f.path) || /(^|\/)comparacao\//i.test(f.path);
    return normEvidencia(
      {
        id_evidencia: `storage:${f.bucket}:${f.path}`,
        falha_id: null,
        rodagem_id: runId,
        nome_arquivo: name,
        storage_path: f.path,
        bucket: f.bucket,
        mime_type: mime,
        extensao: ext,
        tamanho_bytes: f.meta?.metadata?.size ?? null,
        created_at: f.meta?.created_at ?? "",
        // sinaliza explicitamente arquivos vindos da pasta comparacao
        tipo: isComparacao ? "comparacao" : undefined,
      },
      runId,
      moduloSlug || "",
    );
  });
}

/** Mescla evidências do banco com arquivos descobertos no Storage (sem duplicar storage_path). */
export function mergeEvidences(db: Evidencia[], storage: Evidencia[]): Evidencia[] {
  const keys = new Set(db.map((e) => (e.storage_path || e.nome_arquivo || e.id || "").toLowerCase()));
  const extras = storage.filter((e) => {
    const k = (e.storage_path || e.nome_arquivo || e.id || "").toLowerCase();
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  return [...db, ...extras];
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

// Mapa agrupamento_id -> array de falha_ids, usando agrupamentos_falhas (novo)
// e fallback no fk_cluster de falhas (estrutura atual real do schema).
export async function fetchGroupLinksByRun(runId: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  // 1) tentativa pela nova tabela
  const { data: links, error } = await supabase
    .from("agrupamentos_falhas")
    .select("agrupamento_id, falha_id")
    .eq("rodagem_id", runId);
  if (!error && links && links.length > 0) {
    links.forEach((l: any) => {
      const k = String(l.agrupamento_id);
      if (!out[k]) out[k] = [];
      if (l.falha_id) out[k].push(String(l.falha_id));
    });
    return out;
  }
  // 2) fallback: falhas.fk_cluster (vínculo real já existente no schema)
  const clusterIds = await clustersOfRun(runId);
  if (clusterIds.length === 0) return out;
  const { data: fs } = await supabase
    .from("falhas")
    .select("id_falha, fk_cluster")
    .in("fk_cluster", clusterIds);
  (fs || []).forEach((f: any) => {
    const k = String(f.fk_cluster);
    if (!out[k]) out[k] = [];
    out[k].push(String(f.id_falha));
  });
  return out;
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
// PERFORMANCE (atrasos_rodagem)
// =====================================================================
function parseHmsToSeconds(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const parts = clean.split(":").map((x) => Number(x) || 0);
  let total = 0;
  if (parts.length === 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) total = parts[0] * 60 + parts[1];
  else total = parts[0];
  return neg ? -total : total;
}

function normAtraso(row: any): AtrasoRodagem {
  const base = parseHmsToSeconds(row?.tempo_padrao);
  const atual = parseHmsToSeconds(row?.tempo_atual);
  const delay = row?.delay_detectado != null
    ? parseHmsToSeconds(row.delay_detectado)
    : (atual - base);
  const variacao = base > 0 ? (delay / base) * 100 : 0;
  let status: AtrasoRodagem["status"] = "igual";
  if (delay > 0) status = "mais_lento";
  else if (delay < 0) status = "mais_rapido";
  return {
    id: row?.id_atraso ?? row?.id ?? `${row?.fk_rodagem}-${row?.codigo_teste}`,
    rodagem_id: row?.fk_rodagem ?? row?.rodagem_id ?? "",
    modulo_slug: row?.modulo_slug ?? null,
    codigo_teste: row?.codigo_teste ?? row?.id_caso_teste ?? null,
    nome_teste: row?.nome_teste ?? row?.caso_teste ?? null,
    tempo_padrao: row?.tempo_padrao ?? null,
    tempo_atual: row?.tempo_atual ?? null,
    delay_detectado: row?.delay_detectado ?? null,
    delay_segundos: delay,
    base_segundos: base,
    atual_segundos: atual,
    variacao_pct: variacao,
    status,
    created_at: row?.created_at ?? "",
  };
}

export async function fetchPerformanceByRun(runId: string): Promise<AtrasoRodagem[]> {
  if (!runId) return [];
  const { data, error } = await supabase.from("atrasos_rodagem").select("*").eq("fk_rodagem", runId);
  if (error) {
    console.error("[fetchPerformanceByRun]", error);
    return [];
  }
  return (data || []).map(normAtraso);
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
  table: "rodagens" | "falhas" | "evidencias" | "agrupamentos" | "proximos_passos" | "modulos" | "rerun_requests",
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

// =====================================================================
// RERUN REQUESTS (solicitações de reexecução)
// =====================================================================
export interface RerunRequest {
  id: string;
  fk_rodagem: string | null;
  vm_name: string;
  versao: string;
  casos_teste: string;
  paralelo: string | null;
  ct_desmarcar: string | null;
  data_hora: string | null;
  branch: string | null;
  config_json: any;
  status: "solicitado" | "processando" | "enviado_jenkins" | "erro" | string;
  jenkins_url: string | null;
  jenkins_queue_url: string | null;
  jenkins_build_number: string | null;
  erro: string | null;
  retorno_jenkins: any;
  created_at: string;
  updated_at: string;
  tipo_solicitacao?: string | null;
  modo_configuracao?: string | null;
  modulo_nome?: string | null;
  modulo_codigo?: string | null;
  solicitado_por?: string | null;
  // Monitoramento (JenkinsBridge)
  execution_status?: string | null;
  execution_result?: string | null;
  progress_percent?: number | null;
  build_number?: string | number | null;
  build_url?: string | null;
  queue_id?: string | number | null;
  queue_url?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  estimated_duration_ms?: number | null;
  last_checked_at?: string | null;
  monitor_error?: string | null;
}

export interface RodagemListItem {
  id_rodagem: string;
  sistema: string | null;
  versao: string | null;
  vm_name: string | null;
  data_inicio: string | null;
  caminho_logs: string | null;
  total_falhas: number | null;
  total_clusters: number | null;
  created_at: string | null;
  modulo_slug?: string | null;
}

/** Extrai VM (ex.: "a07") a partir de id_rodagem ou caminho_logs. */
export function extractVmName(input?: string | null): string | null {
  if (!input) return null;
  // padrões: rod_A07_..., A07_..., .../A07/...
  const m =
    input.match(/(?:^|[_\-\/\\])([Aa]\d{2,3})(?:[_\-\/\\]|$)/) ||
    input.match(/\b([Aa]\d{2,3})\b/);
  return m ? m[1].toLowerCase() : null;
}

export async function fetchAllRuns(): Promise<RodagemListItem[]> {
  const { data, error } = await supabase
    .from("rodagens")
    .select("*")
    .order("data_inicio", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    console.error("[fetchAllRuns]", error);
    return [];
  }
  // descobre módulo via fk_modulo de falhas → agrupamentos → rodagens
  const ids = (data || []).map((r: any) => r.id_rodagem);
  const moduloByRun = new Map<string, string>();
  if (ids.length > 0) {
    const { data: ag } = await supabase
      .from("agrupamentos")
      .select("id_cluster, fk_rodagem")
      .in("fk_rodagem", ids);
    const clusterToRun = new Map<string, string>();
    (ag || []).forEach((a: any) => clusterToRun.set(a.id_cluster, a.fk_rodagem));
    const clusterIds = Array.from(clusterToRun.keys());
    if (clusterIds.length > 0) {
      const { data: fs } = await supabase
        .from("falhas")
        .select("fk_cluster, fk_modulo")
        .in("fk_cluster", clusterIds);
      const { data: mods } = await supabase.from("modulos").select("id_modulo, nome");
      const modById = new Map<string, string>();
      (mods || []).forEach((m: any) => modById.set(m.id_modulo, slugify(m.nome)));
      (fs || []).forEach((f: any) => {
        const run = clusterToRun.get(f.fk_cluster);
        const slug = modById.get(f.fk_modulo);
        if (run && slug && !moduloByRun.has(run)) moduloByRun.set(run, slug);
      });
    }
  }
  return (data || []).map((r: any) => ({
    id_rodagem: r.id_rodagem,
    sistema: r.sistema ?? null,
    versao: r.versao ?? null,
    vm_name: r.vm_name ?? extractVmName(r.id_rodagem) ?? extractVmName(r.caminho_logs),
    data_inicio: r.data_inicio ?? null,
    caminho_logs: r.caminho_logs ?? null,
    total_falhas: r.total_falhas ?? 0,
    total_clusters: r.total_clusters ?? 0,
    created_at: r.created_at ?? null,
    modulo_slug: moduloByRun.get(r.id_rodagem) ?? null,
  }));
}

export interface CasoReexecutavel {
  id_falha: string;
  id_caso_teste: string | null;
  nome_mds: string | null;
  grupo: string | null;
  arquivo_origem: string | null;
  cluster_id: string;
  cluster_status: string | null;
  cluster_titulo: string | null;
  cluster_assinatura: string | null;
  tipo_ocorrencia: "quebra" | "diferenca" | "quebra_diferenca" | "outro";
}

function classifyClusterStatus(status?: string | null): CasoReexecutavel["tipo_ocorrencia"] {
  const s = (status || "").toLowerCase();
  if (!s) return "outro";
  const hasQuebra = /quebra/.test(s);
  const hasDiff = /diferen[çc]a|compara/.test(s);
  if (hasQuebra && hasDiff) return "quebra_diferenca";
  if (hasDiff) return "diferenca";
  if (hasQuebra) return "quebra";
  return "outro";
}

export async function fetchCasosReexecutaveis(runId: string): Promise<CasoReexecutavel[]> {
  const { data: ag } = await supabase
    .from("agrupamentos")
    .select("id_cluster, status, titulo_causa, assinatura_tecnica")
    .eq("fk_rodagem", runId);
  const clusters = ag || [];
  if (clusters.length === 0) return [];
  const clusterIds = clusters.map((c: any) => c.id_cluster);
  const { data: fs } = await supabase
    .from("falhas")
    .select("id_falha, id_caso_teste, nome_mds, grupo, arquivo_origem, fk_cluster")
    .in("fk_cluster", clusterIds);
  const byCluster = new Map<string, any>();
  clusters.forEach((c: any) => byCluster.set(c.id_cluster, c));
  return (fs || []).map((f: any) => {
    const c = byCluster.get(f.fk_cluster) || {};
    return {
      id_falha: f.id_falha,
      id_caso_teste: f.id_caso_teste ?? null,
      nome_mds: f.nome_mds ?? null,
      grupo: f.grupo ?? null,
      arquivo_origem: f.arquivo_origem ?? null,
      cluster_id: f.fk_cluster,
      cluster_status: c.status ?? null,
      cluster_titulo: c.titulo_causa ?? null,
      cluster_assinatura: c.assinatura_tecnica ?? null,
      tipo_ocorrencia: classifyClusterStatus(c.status),
    } as CasoReexecutavel;
  });
}

// Colunas usadas pela UI do histórico — evita trazer payloads grandes
const RERUN_LIST_COLUMNS = [
  "id", "fk_rodagem", "vm_name", "versao", "casos_teste", "paralelo",
  "ct_desmarcar", "data_hora", "branch", "config_json", "status",
  "jenkins_url", "jenkins_queue_url", "jenkins_build_number", "erro",
  "retorno_jenkins", "created_at", "updated_at",
  "tipo_solicitacao", "modo_configuracao", "modulo_nome", "modulo_codigo", "solicitado_por",
  "execution_status", "execution_result", "progress_percent",
  "build_number", "build_url", "queue_id", "queue_url",
  "started_at", "finished_at", "duration_ms", "estimated_duration_ms",
  "last_checked_at", "monitor_error",
].join(", ");

export async function fetchRerunRequests(limit = 50): Promise<RerunRequest[]> {
  const { data, error } = await supabase
    .from("rerun_requests")
    .select(RERUN_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[fetchRerunRequests]", error);
    return [];
  }
  return (data || []) as unknown as RerunRequest[];
}

/** Busca as rodagens do Jenkins do módulo atual (matching por código/slug ou nome). */
export async function fetchRerunRequestsByModule(
  slug: string,
  moduleName?: string | null,
  limit = 20,
): Promise<RerunRequest[]> {
  const filters: string[] = [];
  if (slug) {
    filters.push(`modulo_codigo.ilike.${slug}`);
    filters.push(`modulo_nome.ilike.${slug}`);
  }
  if (moduleName) filters.push(`modulo_nome.ilike.${moduleName}`);
  if (filters.length === 0) return [];
  const { data, error } = await supabase
    .from("rerun_requests")
    .select(RERUN_LIST_COLUMNS)
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[fetchRerunRequestsByModule]", error);
    return [];
  }
  return (data || []) as unknown as RerunRequest[];
}

export async function createRerunRequest(payload: {
  fk_rodagem?: string | null;
  vm_name: string;
  versao: string;
  casos_teste: string;
  paralelo?: string;
  ct_desmarcar?: string;
  data_hora?: string;
  branch?: string;
  tipo_solicitacao?: "rodagem_completa" | "reexecucao" | string;
  modo_configuracao?: "simplificada" | "configurada" | "casos_quebrados" | string;
  modulo_nome?: string | null;
  modulo_codigo?: string | null;
  solicitado_por?: string | null;
}): Promise<RerunRequest> {
  const paralelo = payload.paralelo ?? "";
  const ct_desmarcar = payload.ct_desmarcar ?? "[0.3]";
  const branch = payload.branch ?? "";
  const data_hora = payload.data_hora ?? formatNowBr();
  const config_json = {
    vm_name: payload.vm_name,
    versao: payload.versao,
    casos_teste: payload.casos_teste,
    paralelo,
    ct_desmarcar,
    data_hora,
    branch,
  };
  const row: Record<string, any> = {
    fk_rodagem: payload.fk_rodagem ?? null,
    vm_name: payload.vm_name,
    versao: payload.versao,
    casos_teste: payload.casos_teste,
    paralelo,
    ct_desmarcar,
    data_hora,
    branch,
    config_json,
    status: "solicitado",
  };
  if (payload.tipo_solicitacao) row.tipo_solicitacao = payload.tipo_solicitacao;
  if (payload.modo_configuracao) row.modo_configuracao = payload.modo_configuracao;
  if (payload.modulo_nome !== undefined) row.modulo_nome = payload.modulo_nome;
  if (payload.modulo_codigo !== undefined) row.modulo_codigo = payload.modulo_codigo;
  if (payload.solicitado_por !== undefined) row.solicitado_por = payload.solicitado_por;

  const { data, error } = await supabase.from("rerun_requests").insert(row).select("*").single();
  if (error) throw error;
  return data as RerunRequest;
}

export function formatNowBr(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Data/hora "agora" para o Jenkins: now - 1 minuto, formato dd/MM/yyyy HH:mm:ss */
export function formatNowMinusOneMinuteBr(): string {
  const d = new Date(Date.now() - 60_000);
  return formatNowBr(d);
}

