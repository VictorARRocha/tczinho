// Selos da aba Falhas: resultado das reexecucoes pedidas a partir da rodagem e casos instaveis na VM.
import { createContext, useContext } from "react";
import type { CasoInstavel, ResultadoReexecucao } from "@/services/data";
import { formatDateTime } from "@/lib/format";
import { formatarVersao } from "@/lib/rodagemTexto";
import { TOM_STATUS } from "@/lib/statusPedido";

type Resultado = ResultadoReexecucao["casos"][string]["resultado"];

/** Uma reexecucao do caso (a rodagem dela so existe depois de importada). */
export interface ExecucaoReexecucao {
  resultado: Resultado;
  rodagemId: string | null;
  criadoEm: string | null;
  vm: string | null;
  versao: string | null;
}

/** Caso -> reexecucoes dele, da mais antiga para a mais nova (o selo mostra a ultima). */
export function mapaReexecucao(lista: ResultadoReexecucao[]): Map<string, ExecucaoReexecucao[]> {
  const mapa = new Map<string, ExecucaoReexecucao[]>();
  for (const r of lista) {
    for (const [caso, v] of Object.entries(r.casos)) {
      const execucao = { resultado: v.resultado, rodagemId: r.rodagem_id, criadoEm: r.criado_em, vm: r.vm_name, versao: r.versao ?? null };
      mapa.set(caso, [...(mapa.get(caso) || []), execucao]);
    }
  }
  return mapa;
}

/** Reexecucao que tem resultado para abrir no painel (passou ou falhou, com a rodagem importada). */
export function temResultado(e: ExecucaoReexecucao): e is ExecucaoReexecucao & { rodagemId: string } {
  return !!e.rodagemId && (e.resultado === "passou" || e.resultado === "quebrou_de_novo");
}

/** Versao da reexecucao, quando difere da rodagem de origem (senao null). */
export function outraVersao(e: ExecucaoReexecucao, versaoOrigem: string | null | undefined): string | null {
  // "PRE-CLIENTES" (rodagem) e "pre-cliente" (pedido ao Jenkins) sao a mesma versao.
  const norm = (v: string | null | undefined) => (v || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
  return e.versao && norm(e.versao) !== norm(versaoOrigem) ? formatarVersao(e.versao) : null;
}

/** Nome da reexecucao no seletor do painel: "Reexecução · 03/11 09:25" ou "Reexecução na Próxima 11.99 · 03/11 09:25". */
export function rotuloExecucao(e: ExecucaoReexecucao, versaoOrigem: string | null | undefined): string {
  const versao = outraVersao(e, versaoOrigem);
  return `Reexecução${versao ? ` na ${versao}` : ""} · ${formatDateTime(e.criadoEm)}`;
}

export function textoSelo(e: ExecucaoReexecucao, versaoOrigem: string | null | undefined): string {
  const versao = outraVersao(e, versaoOrigem);
  const onde = versao ? `Reexecutado na versão ${versao}` : "Reexecutado";
  switch (e.resultado) {
    case "aguardando": return "Aguardando reexecução";
    case "rodando": return "Reexecutando";
    case "passou": return `${onde} com sucesso`;
    case "quebrou_de_novo": return `${onde} com falha`;
    case "aguardando_importacao": return `${onde}, carregando resultado…`;
    default: return "Não rodou na reexecução";
  }
}

const TOM: Record<Resultado, string> = {
  passou: TOM_STATUS.sucesso,
  quebrou_de_novo: TOM_STATUS.erro,
  nao_rodou: TOM_STATUS.espera,
  aguardando: TOM_STATUS.andamento,
  rodando: TOM_STATUS.andamento,
  aguardando_importacao: TOM_STATUS.andamento,
};

export const ReexecucaoContext = createContext<{
  mapa: Map<string, ExecucaoReexecucao[]>;
  slug: string;
  instaveis: Record<string, CasoInstavel>;
  /** Versao da rodagem aberta: reexecucao em outra versao ganha "na versão X". */
  versaoOrigem?: string | null;
  /** Abre o painel do caso ja na reexecucao escolhida. */
  onAbrir?: (casoId: string, rodagemId: string) => void;
} | null>(null);

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
  const id = String(casoId || "").trim();
  const execucoes = id ? ctx?.mapa.get(id) : undefined;
  if (!ctx || !execucoes?.length) return null;
  const ultima = execucoes[execucoes.length - 1];
  const texto = textoSelo(ultima, ctx.versaoOrigem);
  const dica = `Reexecução pedida em ${formatDateTime(ultima.criadoEm)}${ultima.vm ? ` na ${ultima.vm.toUpperCase()}` : ""}`;
  const classe = `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TOM[ultima.resultado] || TOM_STATUS.espera}`;
  const abrir = ctx.onAbrir;
  return temResultado(ultima) && abrir ? (
    <button
      type="button"
      title={`${dica}. Abrir o resultado da reexecução.`}
      className={`${classe} cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={(e) => { e.stopPropagation(); abrir(id, ultima.rodagemId); }}
    >
      {texto}
    </button>
  ) : (
    <span title={dica} className={classe}>{texto}</span>
  );
}
