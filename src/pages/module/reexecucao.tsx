// Selos da aba Falhas: resultado das reexecucoes pedidas a partir da rodagem e casos instaveis na VM.
import { createContext, useContext } from "react";
import { Link } from "react-router-dom";
import type { CasoInstavel, ResultadoReexecucao } from "@/services/data";
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

export const ReexecucaoContext = createContext<{ mapa: Map<string, CasoReexecutado>; slug: string; instaveis: Record<string, CasoInstavel> } | null>(null);

const SELO: Record<Resultado, { texto: string; tom: string }> = {
  passou: { texto: "Passou na reexecução", tom: TOM_STATUS.sucesso },
  quebrou_de_novo: { texto: "Quebrou de novo", tom: TOM_STATUS.erro },
  nao_rodou: { texto: "Não rodou na reexecução", tom: TOM_STATUS.espera },
  aguardando: { texto: "Reexecução na fila", tom: TOM_STATUS.andamento },
  aguardando_importacao: { texto: "Reexecução sem importar", tom: TOM_STATUS.espera },
};

/** Selo "Instavel": o caso alterna entre falhar e passar nas ultimas rodagens desta VM (TC ou ambiente, nao bug). */
export function SeloInstavel({ casoId }: { casoId: string | null | undefined }) {
  const caso = useContext(ReexecucaoContext)?.instaveis[String(casoId || "").trim()];
  if (!caso) return null;
  const linha = caso.historico.map((r) => (r === "falhou" ? "✗" : "✓")).join(" ");
  const dica = `Nas últimas ${caso.historico.length} rodagens desta VM em que rodou: falhou ${caso.falhou}, passou ${caso.passou} (${linha}, da mais antiga para esta). Provável problema do TC ou do ambiente.`;
  return (
    <span title={dica} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TOM_STATUS.aviso}`}>
      Instável
    </span>
  );
}

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
