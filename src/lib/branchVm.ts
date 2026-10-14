// Branch do projeto do TC na VM, escolhida no pedido de rodagem.
// O pipeline do Jenkins faz "svn revert -R C:\TC\Unico" e depois "svn switch" quando a branch vem preenchida;
// vazio nao mexe na VM. "local" e o trunk (ProjetoUnico/Unico).
import type { SvnBranch } from "@/services/data";

/** VMs que recebem pedido de rodagem (Rodagem completa e reexecucao em outra VM). */
export const VM_OPTIONS = ["a03", "a04", "a05n", "a06", "a07", "a08", "a09", "a10", "testevsup"];

/** Valor do select para "nao trocar" (o Select nao aceita valor vazio). */
export const MANTER_BRANCH = "__manter__";

export interface OpcaoBranch {
  valor: string;
  rotulo: string;
}

/** Branches de solicitacao comecam com o numero do pedido: vao para o fim da lista. */
function ehDeSolicitacao(nome: string): boolean {
  return /^\d/.test(nome);
}

/** Trunk primeiro (vai como "local"); depois as branches com nome, em ordem; por ultimo as de solicitacao. */
export function opcoesBranch(branches: SvnBranch[] | undefined): OpcaoBranch[] {
  const lista = branches || [];
  const trunk = lista.find((b) => b.kind === "trunk");
  const nomes = lista
    .filter((b) => b.kind === "branch")
    .map((b) => b.name)
    .sort((a, b) =>
      Number(ehDeSolicitacao(a)) - Number(ehDeSolicitacao(b)) || a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
    );
  return [
    { valor: "local", rotulo: `${trunk?.name || "Unico"} (principal)` },
    ...nomes.map((nome) => ({ valor: nome, rotulo: nome })),
  ];
}

/** O que vai no campo "branch" do pedido. */
export function branchDoPedido(selecionada: string): string {
  return selecionada === MANTER_BRANCH ? "" : selecionada;
}
