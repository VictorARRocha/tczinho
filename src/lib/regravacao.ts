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

/** "branch minha-branch" ou "principal" a partir da URL da copia de trabalho da VM. */
export function destinoLabel(url: string | null): string {
  if (!url) return "—";
  const match = url.match(/\/branches\/([^/]+)/);
  return match ? `branch ${decodeURIComponent(match[1])}` : "principal";
}

export const PEDIDO_STATUS: Record<string, { label: string; className: string }> = {
  solicitado: { label: "Na fila", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  processando: { label: "Processando", className: "border-purple-500/40 text-purple-600 dark:text-purple-400" },
  concluido: { label: "Concluído", className: "border-green-500/40 text-green-600 dark:text-green-400" },
  erro: { label: "Erro", className: "border-red-500/40 text-red-600 dark:text-red-400" },
  cancelado: { label: "Cancelado", className: "border-orange-500/40 text-orange-600 dark:text-orange-400" },
};

export const ITEM_STATUS: Record<string, string> = {
  gravado: "Gravado",
  ja_gravado: "Já estava gravado",
  simulado: "Simulado (nada gravado)",
  base_mudou: "Base mudou no SVN",
  base_inexistente: "Base não existe no SVN",
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
};
