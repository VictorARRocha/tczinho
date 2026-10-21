// De onde veio a rodagem, para a lista de troca de rodagem: reexecucao pedida no Jenkins ou
// importada pelo botao "Adicionar rodagem". Sem selo = rodagem normal da VM.
import type { ImportPedido, RerunRequest } from "@/services/data";
import { ACTIVE_RERUN_STATUSES, rerunStatusKey } from "@/lib/rerunStatus";

export type OrigemRodagem = { tipo: "reexecucao" | "importada"; por: string | null; detalhe: string };

// Relogio da VM x relogio da API.
const FOLGA_MS = 5 * 60_000;
// Pedidos que nunca chegaram a rodar no Jenkins.
const NAO_RODOU = new Set(["solicitado", "erro_envio"]);

const normVm = (vm: string | null | undefined) => String(vm || "").trim().toLowerCase();
const normPasta = (pasta: string | null | undefined) =>
  String(pasta || "").trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

/**
 * Reexecucao: o pedido do Jenkins nao guarda a rodagem que gerou, entao vale a rodagem que comecou
 * na mesma VM entre o pedido e a ultima atualizacao dele (ou agora, se ainda esta rodando).
 * shortcut: a API devolve so os ultimos 100 pedidos; reexecucao mais antiga fica sem selo.
 */
export function origemDaRodagem(
  r: { pasta_origem: string | null; data_inicio_rodagem: string | null },
  vm: string,
  pedidos: RerunRequest[],
  importacoes: ImportPedido[],
  agora = Date.now(),
): OrigemRodagem | null {
  const inicio = Date.parse(r.data_inicio_rodagem || "");
  const vmRodagem = normVm(vm);
  let pedido: RerunRequest | null = null;
  if (vmRodagem && !Number.isNaN(inicio)) {
    for (const p of pedidos) {
      const status = rerunStatusKey(p);
      if (p.tipo_solicitacao === "rodagem_completa" || NAO_RODOU.has(status) || normVm(p.vm_name) !== vmRodagem) continue;
      const criado = Date.parse(p.created_at);
      const fim = ACTIVE_RERUN_STATUSES.has(status) ? agora : Date.parse(p.updated_at);
      if (inicio < criado - FOLGA_MS || inicio > fim + FOLGA_MS) continue;
      if (!pedido || criado > Date.parse(pedido.created_at)) pedido = p;
    }
  }
  if (pedido) return { tipo: "reexecucao", por: pedido.solicitado_por ?? null, detalhe: `Casos: ${pedido.casos_teste}` };

  const pasta = normPasta(r.pasta_origem);
  const importacao = pasta ? importacoes.find((i) => i.status === "concluido" && normPasta(i.run_folder) === pasta) : undefined;
  if (importacao) return { tipo: "importada", por: importacao.requested_by, detalhe: importacao.run_folder };
  return null;
}
