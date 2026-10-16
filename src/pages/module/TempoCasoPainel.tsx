// Painel do caso na aba Performance: tempo base, linha do tempo das rodagens e troca da base.
// A base so muda por quem pode regravar arquivos (no modulo do caso), sempre com confirmacao.
import { useState } from "react";
import { toast } from "sonner";
import type { AtrasoRodagem } from "@/types/db";
import type { HistoricoTempo } from "@/services/data";
import { trocarBaseTempo } from "@/services/data";
import { ApiError } from "@/services/data/apiSource";
import { useHistoricoTempo } from "@/services/queries";
import { queryClient } from "@/lib/queryClient";
import { usePermissao, useModulos } from "@/hooks/use-permissao";
import { useFocoDeVolta } from "@/hooks/usePainel";
import { formatDateTime } from "@/lib/format";
import { formatarVersao } from "@/lib/rodagemTexto";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDuration } from "./PerformanceTab";

const POR_PAGINA = 15;

type Status = AtrasoRodagem["status"];

function origemDaBase(h: HistoricoTempo): string {
  const quando = h.base_definida_em ? formatDateTime(h.base_definida_em).slice(0, 10) : "";
  if (h.base_origem === "planilha") return "da planilha antiga (Tempo Padrão)";
  if (h.base_origem === "primeira_medicao") return `primeira medição${quando ? `, em ${quando}` : ""}`;
  if (h.base_origem === "substituida") {
    const antes = h.base_anterior_segundos ? ` (antes ${formatDuration(h.base_anterior_segundos)})` : "";
    return `trocada${h.base_definida_por ? ` por ${h.base_definida_por}` : ""}${quando ? ` em ${quando}` : ""}${antes}`;
  }
  return "";
}

function tomDoStatus(status: Status) {
  if (status === "mais_lento") return { barra: "bg-destructive", texto: "text-destructive", fundo: "bg-destructive/10" };
  if (status === "mais_rapido") return { barra: "bg-success", texto: "text-success", fundo: "bg-success/10" };
  return { barra: "bg-muted-foreground/35", texto: "text-muted-foreground", fundo: "bg-muted" };
}

/** "00:02:41" -> 161 (rodagens antigas so trazem o texto). */
function hmsParaSegundos(texto: string | null | undefined): number | null {
  const partes = String(texto || "").split(":").map((p) => parseInt(p, 10));
  if (partes.length !== 3 || partes.some(isNaN)) return null;
  return partes[0] * 3600 + partes[1] * 60 + partes[2];
}

function variacao(segundos: number, base: number | null) {
  if (!base) return "";
  const pct = ((segundos - base) / base) * 100;
  const arredondado = Math.round(pct);
  return `${arredondado > 0 ? "+" : arredondado < 0 ? "−" : "±"}${Math.abs(arredondado)}%`;
}

export function TempoCasoPainel({ caso, aberto, moduloSlug, onClose, onBaseTrocada }: {
  caso: AtrasoRodagem | null;
  /** Aberto sem depender do caso: o caso continua na tela enquanto o painel fecha. */
  aberto?: boolean;
  moduloSlug: string;
  onClose: () => void;
  onBaseTrocada: () => void;
}) {
  const nodeId = caso?.codigo_teste || null;
  const estaAberto = aberto ?? !!caso;
  const voltarFoco = useFocoDeVolta(estaAberto);
  const { data, isLoading, isError } = useHistoricoTempo(nodeId);
  const [visiveis, setVisiveis] = useState(POR_PAGINA);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const podeRegravar = usePermissao("regravar");
  const podeNoModulo = useModulos().pode(moduloSlug);

  const base = data?.base_segundos ?? (caso ? caso.base_segundos ?? hmsParaSegundos(caso.tempo_padrao) : null) ?? null;
  const atual = caso ? caso.atual_segundos ?? hmsParaSegundos(caso.tempo_atual) ?? 0 : 0;
  const medicoes = data?.medicoes ?? [];
  const maior = Math.max(1, base ?? 0, ...medicoes.map((m) => m.segundos));
  const podeTrocar = podeRegravar && podeNoModulo && atual > 0 && atual !== base;

  const trocar = async () => {
    if (!nodeId) return;
    setSalvando(true);
    try {
      const novo = await trocarBaseTempo(nodeId, atual);
      queryClient.setQueryData(["historico-tempo", nodeId], novo);
      toast.success(`Tempo base do CT [${nodeId}] agora é ${formatDuration(atual)}`);
      setConfirmando(false);
      onBaseTrocada();
    } catch (e) {
      toast.error((e instanceof ApiError && e.detail) || "Não foi possível trocar o tempo base. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Sheet open={estaAberto} onOpenChange={(abrir) => { if (!abrir) { onClose(); setVisiveis(POR_PAGINA); } }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" onCloseAutoFocus={voltarFoco}>
        {caso && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">CT [{caso.codigo_teste}]</SheetTitle>
              <SheetDescription>{caso.nome_teste || "Tempo de execução do caso nas rodagens"}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Tempo base</div>
                <div className="mt-0.5 font-mono text-lg font-semibold">{base ? formatDuration(base) : "—"}</div>
                {data && origemDaBase(data) && <div className="mt-0.5 text-xs text-muted-foreground">{origemDaBase(data)}</div>}
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Nesta rodagem</div>
                <div className={`mt-0.5 font-mono text-lg font-semibold ${caso.status !== "igual" ? tomDoStatus(caso.status).texto : ""}`}>
                  {atual ? formatDuration(atual) : "—"}
                </div>
                {base && atual > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {atual - base > 0 ? "+" : ""}{formatDuration(atual - base)} ({variacao(atual, base)})
                  </div>
                )}
              </div>
            </div>
            {data?.limite_segundos != null && (
              <p className="mt-2 text-xs text-muted-foreground">
                Avisa quando passar {formatDuration(data.limite_segundos)} para mais ou para menos da base.
              </p>
            )}

            {podeTrocar ? (
              <Button variant="outline" className="mt-4 w-full" onClick={() => setConfirmando(true)}>
                Usar {formatDuration(atual)} como novo tempo base
              </Button>
            ) : !podeRegravar && atual !== base ? (
              <p className="mt-4 text-xs text-muted-foreground">Só quem pode regravar arquivos troca o tempo base.</p>
            ) : null}

            <h3 className="mt-6 text-sm font-semibold">Histórico</h3>
            {isLoading ? (
              <div className="mt-3 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5" />)}</div>
            ) : isError ? (
              <p className="mt-2 text-sm text-muted-foreground">Não foi possível carregar o histórico deste caso.</p>
            ) : medicoes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Ainda não há medições deste caso no banco.</p>
            ) : (
              <>
                <ol className="mt-3 space-y-1.5" aria-label="Tempo do caso em cada rodagem, da mais recente para a mais antiga">
                  {medicoes.slice(0, visiveis).map((m) => {
                    const tom = tomDoStatus(m.status);
                    const destaque = caso.medido_em === m.medido_em;
                    const quando = formatDateTime(m.medido_em);
                    const versao = formatarVersao(m.versao);
                    return (
                      <li key={m.medido_em} className={`grid grid-cols-[40px_88px_minmax(0,1fr)_44px_46px] items-center gap-2 rounded px-1 py-0.5 text-xs ${destaque ? "bg-muted/60" : ""}`}>
                        {/* So dia/mes na linha; data e hora completas ao passar o mouse. */}
                        <span className="text-muted-foreground" title={`${quando}${destaque ? " (esta rodagem)" : ""}`}>{quando.slice(0, 5)}</span>
                        <span className={`truncate ${versao ? "" : "text-muted-foreground"}`} title={versao || "Rodagem não registrada no AgenteTC"}>
                          {versao || "—"}
                        </span>
                        <span className="relative h-1.5 rounded-full bg-muted">
                          <span className={`absolute inset-y-0 left-0 rounded-full ${tom.barra}`} style={{ width: `${Math.max(3, (m.segundos / maior) * 100)}%` }} />
                          {base ? <span className="absolute -inset-y-1 w-px bg-foreground/40" style={{ left: `${(base / maior) * 100}%` }} aria-hidden /> : null}
                        </span>
                        <span className="text-right font-mono">{formatDuration(m.segundos)}</span>
                        <span className={`rounded-full px-1.5 text-center font-mono text-[11px] ${m.status === "igual" ? "text-muted-foreground" : `${tom.texto} ${tom.fundo}`}`}>
                          {variacao(m.segundos, base)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-[11px] text-muted-foreground">A linha fina marca o tempo base.</p>
                {medicoes.length > visiveis && (
                  <Button variant="ghost" size="sm" className="mt-1" onClick={() => setVisiveis((v) => v + POR_PAGINA)}>
                    Mostrar mais ({medicoes.length - visiveis})
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </SheetContent>

      <Dialog open={confirmando} onOpenChange={(aberto) => !salvando && setConfirmando(aberto)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar o tempo base do CT [{caso?.codigo_teste}]?</DialogTitle>
            <DialogDescription>
              De {base ? formatDuration(base) : "—"} para {formatDuration(atual)}. As próximas rodagens vão ser comparadas com o novo tempo; a base atual fica registrada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={trocar} disabled={salvando}>{salvando ? "Trocando…" : "Trocar tempo base"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
