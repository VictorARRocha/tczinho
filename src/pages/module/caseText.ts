// Helpers de texto dos casos de teste (nome, descricao, procedimento) usados pelas abas.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { type TestcaseHierarchyNode } from "@/services/data";
import type { Falha } from "@/types/db";
import { extractCaseIdParts } from "./FalhasTab";

const CASE_NOT_FOUND_RE = /n[aã]o\s+encontrado(?:\s+no\s+.*\.mds)?/i;

function cleanCaseText(value?: string | null): string {
  const text = String(value || "").trim();
  if (!text || text === "—" || CASE_NOT_FOUND_RE.test(text)) return "";
  return text;
}

function sameCaseText(a?: string | null, b?: string | null): boolean {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  return !!left && left === right;
}

function extractProcedureCode(value?: string | null): string {
  const match = String(value || "").match(/(?:^|_)(\d{4,})$/);
  return match?.[1] || "";
}

function getHierarchyCase(f: Falha, hierMap: Map<string, TestcaseHierarchyNode>) {
  const caseId = extractCaseIdParts(f.id_caso_teste)?.join(".") || "";
  const hier = caseId ? hierMap.get(caseId) : undefined;
  const name = cleanCaseText(hier?.node_name);
  const code = extractProcedureCode(hier?.procedure_name);
  return { name, code };
}

function caseDescriptionFromParts(name: string, code: string): string {
  if (name && code) return `#${code} - ${name}`;
  return name || (code ? `#${code}` : "");
}

export function withCaseMetadata(f: Falha, hierMap: Map<string, TestcaseHierarchyNode>): Falha {
  const { name, code } = getHierarchyCase(f, hierMap);
  const description = caseDescriptionFromParts(name, code);
  if (!name && !description) return f;
  return {
    ...f,
    caso_teste_provavel: name || cleanCaseText(f.caso_teste_provavel) || f.caso_teste_provavel,
    rotina_funcional: name || cleanCaseText(f.rotina_funcional) || f.rotina_funcional,
    descricao_caso: description || f.descricao_caso,
  };
}

// Descrição do caso de teste (vinda direto da API já corrigida)
export function failureDescription(f: Falha): string {
  const description = cleanCaseText(f.descricao_caso);
  if (description) return description;

  const order = [f.caso_teste_provavel, f.rotina_funcional];
  for (const v of order) {
    const text = cleanCaseText(v);
    if (text) return text;
  }
  return "";
}

// Remove a extensão do nome para exibição limpa (ex: .txt não polui a lista)
export function cleanFileName(nome?: string | null, extensao?: string | null): string {
  if (!nome) return "—";
  let out = nome;
  const ext = (extensao || "").trim().toLowerCase().replace(/^\.+/, "");
  if (ext) {
    const re = new RegExp(`\\.${ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    out = out.replace(re, "");
  }
  // Remove sufixos _Antigo / _Atual / _Base / _Gerado / _Novo / _Original / _Referencia / _Esperado ...
  out = out.replace(/[_\-. ]+(antigo|atual|base|gerado|gerada|novo|nova|original|referencia|referência|esperado|esperada|padrao|padrão|anterior|previo|prévio|antes|depois|current|new)$/i, "");
  return out;
}

export function fixMojibake(s: string): string {
  if (!s) return s;
  if (!/[ÃÂ][\u0080-\u00BF]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return s;
  }
}
