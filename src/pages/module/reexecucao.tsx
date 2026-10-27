// Resultado das reexecucoes na aba Falhas da rodagem de origem: um selo por caso reexecutado.
import { createContext, useContext } from "react";
import { Link } from "react-router-dom";
import type { ResultadoReexecucao } from "@/services/data";
import { formatDateTime } from "@/lib/format";
import { TOM_STATUS } from "@/lib/statusPedido";

type Resultado = ResultadoReexecucao["casos"][string]["resultado"];

export interface CasoReexecutado {
  resultado: Resultado;
  rodagemId: string | null;
  criadoEm: string | null;
  vm: string | null;
}

/** Caso -> resultado da reexecucao mais recente (a lista vem da mais antiga para a mais nova). */
export function mapaReexecucao(lista: ResultadoReexecucao[]): Map<string, CasoReexecutado> {
  const mapa = new Map<string, CasoReexecutado>();
  for (const r of lista) {
    for (const [caso, v] of Object.entries(r.casos)) {
      mapa.set(caso, { resultado: v.resultado, rodagemId: r.rodagem_id, criadoEm: r.criado_em, vm: r.vm_name });
    }
  }
  return mapa;
}

export const ReexecucaoContext = createContext<{ mapa: Map<string, CasoReexecutado>; slug: string } | null>(null);

const SELO: Record<Resultado, { texto: string; tom: string }> = {
  passou: { texto: "Passou na reexecução", tom: TOM_STATUS.sucesso },
  quebrou_de_novo: { texto: "Quebrou de novo", tom: TOM_STATUS.erro },
  nao_rodou: { texto: "Não rodou na reexecução", tom: TOM_STATUS.espera },
  aguardando: { texto: "Reexecução na fila", tom: TOM_STATUS.andamento },
  aguardando_importacao: { texto: "Reexecução sem importar", tom: TOM_STATUS.espera },
};

export function SeloReexecucao({ casoId }: { casoId: string | null | undefined }) {
  const ctx = useContext(ReexecucaoContext);
  const caso = casoId ? ctx?.mapa.get(String(casoId).trim()) : undefined;
  if (!ctx || !caso) return null;
  const { texto, tom } = SELO[caso.resultado] || SELO.nao_rodou;
  const dica = `Reexecução pedida em ${formatDateTime(caso.criadoEm)}${caso.vm ? ` na ${caso.vm.toUpperCase()}` : ""}`;
  const classe = `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tom}`;
  return caso.rodagemId ? (
    <Link
      to={`/modulo/${ctx.slug}?run=${encodeURIComponent(caso.rodagemId)}&tab=falhas`}
      title={`${dica}. Abrir a rodagem da reexecução.`}
      className={`${classe} hover:underline`}
      onClick={(e) => e.stopPropagation()}
    >
      {texto} ↗
    </Link>
  ) : (
    <span title={dica} className={classe}>{texto}</span>
  );
}
