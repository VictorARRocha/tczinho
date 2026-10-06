// Merge entre branches do TC: textos e regras da tela (a execucao fica no MergeBridge da D01).
import type { MergePedido, SvnBranch } from "@/services/data";

export const MERGE_STATUS: Record<string, { label: string; className: string }> = {
  previa_solicitada: { label: "Prévia na fila", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  previa_processando: { label: "Gerando prévia", className: "border-purple-500/40 text-purple-600 dark:text-purple-400" },
  previa_pronta: { label: "Prévia pronta", className: "border-primary/50 text-primary" },
  solicitado: { label: "Merge na fila", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  processando: { label: "Fazendo merge", className: "border-purple-500/40 text-purple-600 dark:text-purple-400" },
  concluido: { label: "Merge realizado", className: "border-green-500/40 text-green-600 dark:text-green-400" },
  sem_alteracoes: { label: "Já atualizado", className: "border-border text-muted-foreground" },
  conflito: { label: "Conflito", className: "border-red-500/50 text-red-600 dark:text-red-400" },
  erro: { label: "Erro", className: "border-red-500/40 text-red-600 dark:text-red-400" },
  cancelado: { label: "Cancelado", className: "border-orange-500/40 text-orange-600 dark:text-orange-400" },
};

const SIMULACAO = { label: "Simulação", className: "border-border text-muted-foreground" };

export function mergeStatus(p: Pick<MergePedido, "status" | "result_json">) {
  if (p.status === "erro" && p.result_json?.simulacao) return SIMULACAO;
  return MERGE_STATUS[p.status] || { label: p.status, className: "" };
}

/** O MergeBridge esta trabalhando no pedido (previa ou merge). */
export const MERGE_EM_ANDAMENTO = new Set(["previa_solicitada", "previa_processando", "solicitado", "processando"]);
export const MERGE_CANCELAVEL = new Set(["previa_solicitada", "previa_pronta", "solicitado"]);

/** Principal (Unico) primeiro; depois as branches que nao comecam com numero e por ultimo as que comecam, cada grupo em ordem alfabetica. */
export function ordenarBranches(branches: SvnBranch[]): SvnBranch[] {
  const grupo = (b: SvnBranch) => (b.kind === "trunk" ? 0 : /^\d/.test(b.name) ? 2 : 1);
  return [...branches].sort((a, b) =>
    grupo(a) - grupo(b) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }),
  );
}

/** Mensagem do commit sugerida na tela (sem edicao, o MergeBridge grava a padrao dele, com as revisoes). */
export function mensagemPadrao(origem: string, destino: string): string {
  return `Merge de ${origem || "…"} para ${destino || "…"} pelo dashboard (AgenteTC)`;
}

/** Filtro da busca de branch: sem acento e sem diferenciar maiusculas. */
export function combinaBusca(nome: string, busca: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return norm(nome).includes(norm(busca.trim()));
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const TIPO_CONFLITO: Record<string, string> = {
  texto: "conteúdo",
  propriedade: "propriedade",
  arvore: "arquivo movido/excluído",
};
