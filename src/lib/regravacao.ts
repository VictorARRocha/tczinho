// Regravacao de bases: textos e regras da tela (a execucao fica no RegravacaoBridge da D01).

export interface ItemMensagem {
  id_caso_teste: string | null;
  caminho_base: string | null;
}

/** Caminho como o Bridge grava: relativo a Stores, com "/". */
export function caminhoBridge(caminho: string | null): string {
  return (caminho || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Mensagem padrao do commit, identica a do RegravacaoBridge (default_commit_message).
 * "{pedido}" e trocado pelo numero do pedido na hora do commit.
 */
export function defaultCommitMessage(runId: string, requestedBy: string | null, itens: ItemMensagem[]): string {
  const lines = [
    "Regravação de bases pelo dashboard (AgenteTC)",
    "",
    "Pedido: {pedido}",
    `Rodagem: ${runId}`,
    `Solicitado por: ${requestedBy || "(desconhecido)"}`,
    "",
    ...itens.map((i) => `- CT ${i.id_caso_teste ?? "None"}: ${caminhoBridge(i.caminho_base)}`),
  ];
  return lines.join("\n");
}

/**
 * Nome da branch do TC (Tortoise) a partir da URL do SVN gravada na rodagem:
 * ".../branches/Proxima%2010.0" -> "Proxima 10.0"; fora de branches, a ultima pasta (ex.: "Unico").
 */
export function branchTc(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/branches\/([^/]+)/);
  if (match) return decodeURIComponent(match[1]);
  const last = url.replace(/\/+$/, "").split("/").pop();
  return last ? decodeURIComponent(last) : null;
}

/** "branch Proxima 10.0" ou "principal (Unico)" a partir da URL da copia de trabalho da VM. */
export function destinoLabel(url: string | null): string {
  if (!url) return "—";
  const nome = branchTc(url);
  return /\/branches\//.test(url) ? `branch ${nome}` : `principal (${nome})`;
}

export const PEDIDO_STATUS: Record<string, { label: string; className: string }> = {
  solicitado: { label: "Na fila", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  processando: { label: "Processando", className: "border-purple-500/40 text-purple-600 dark:text-purple-400" },
  concluido: { label: "Concluído", className: "border-green-500/40 text-green-600 dark:text-green-400" },
  erro: { label: "Erro", className: "border-red-500/40 text-red-600 dark:text-red-400" },
  cancelado: { label: "Cancelado", className: "border-orange-500/40 text-orange-600 dark:text-orange-400" },
};

const CONFLITO_STATUS = { label: "Conflito", className: "border-amber-500/50 text-amber-700 dark:text-amber-400" };

/** Status para mostrar: erro por conflito no SVN aparece como "Conflito". */
export function pedidoStatus(p: { status: string; result_json?: { conflito?: boolean } | null }) {
  if (p.status === "erro" && p.result_json?.conflito) return CONFLITO_STATUS;
  return PEDIDO_STATUS[p.status] || { label: p.status, className: "" };
}

/** Arquivos do pedido que deram conflito (a base no SVN nao e mais a da rodagem). */
export const ITEM_CONFLITO = ["base_mudou", "base_inexistente"];

export const ITEM_STATUS: Record<string, string> = {
  gravado: "Gravado",
  ja_gravado: "Já estava gravado",
  simulado: "Simulado (nada gravado)",
  base_mudou: "Conflito: a base mudou no SVN",
  base_inexistente: "Conflito: a base não existe mais no SVN",
  nao_gravado: "Não gravado",
  erro: "Erro",
};

export const MOTIVO_CURTO: Record<string, string> = {
  sem_manifesto: "Rodagem antiga",
  caminho_nao_confirmado: "Caminho errado no script",
  caminho_invalido: "Caminho inválido",
  sem_origem_svn: "Sem origem SVN",
  sem_hash: "Sem hash da base",
  sem_evidencia_atual: "Sem arquivo atual",
  sem_diferenca: "Sem diferença",
  em_andamento: "Pedido em andamento",
  ja_regravado: "Já regravado",
  conflito_svn: "Conflito no SVN",
};
