// =====================================================================
// qa.ts — utilitários puros compartilhados pelo dashboard.
//
// IMPORTANTE:
// As tabelas legadas (modulos, rodagens, falhas, evidencias, agrupamentos,
// proximos_passos, atrasos_rodagem, rerun_requests, testcase_hierarchy)
// serão removidas do Supabase. Toda leitura de dados de QA agora passa pelo
// ApiQaDataSource (VITE_DATA_PROVIDER=api). Este arquivo mantém somente:
//   - Tipos usados pela UI e pela camada de dados
//   - Helpers puros (formatação, merge de evidências, extração de VM)
//   - Listagem de arquivos direto no Storage do Supabase (Storage != tabelas)
//
// Nunca reintroduzir consultas às tabelas legadas aqui.
// =====================================================================
import { supabase, STORAGE_BUCKET, STORAGE_BUCKET_FALLBACKS } from "@/lib/supabase";
import type { Evidencia } from "@/types/db";

// =====================================================================
// TESTCASE HIERARCHY (tipo mantido para a UI; leitura é feita pelo API source)
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

// =====================================================================
// RERUN REQUESTS (tipos mantidos; persistência via API)
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

// =====================================================================
// Helpers puros
// =====================================================================

// Corrige mojibake: texto UTF-8 decodificado como Latin-1 antes de salvar.
function fixMojibake<T extends string | null | undefined>(s: T): T {
  if (typeof s !== "string" || !s) return s;
  if (!/[ÃÂ][\x80-\xBF]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return (decoded.includes("\uFFFD") ? s : decoded) as T;
  } catch {
    return s;
  }
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
    conteudo_texto: fixMojibake(row?.conteudo_texto ?? row?.conteudo_resumo ?? null),
    mime_type: mime,
    extensao: ext,
    tamanho_bytes: row?.tamanho_bytes ?? null,
    print_util: isImage,
    imagem_descricao: row?.imagem_descricao ?? row?.correlacao_visual ?? null,
    created_at: row?.created_at ?? "",
  };
}

// =====================================================================
// STORAGE: lista arquivos do bucket de evidências (Storage, não tabelas)
// Estrutura esperada:
//   {moduloSlug}/{rodagemFolder}/falhas/{pastaDaFalha}/{comparacao|imagens|zip|...}/arquivo
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

/** Extrai VM (ex.: "a07") a partir de id_rodagem ou caminho_logs. */
export function extractVmName(input?: string | null): string | null {
  if (!input) return null;
  const m =
    input.match(/(?:^|[_\-\/\\])([Aa]\d{2,3})(?:[_\-\/\\]|$)/) ||
    input.match(/\b([Aa]\d{2,3})\b/);
  return m ? m[1].toLowerCase() : null;
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
