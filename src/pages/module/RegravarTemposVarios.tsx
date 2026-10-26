// "Regravar vários" da aba Performance: troca o tempo base de varios casos pelo tempo desta rodagem.
// Mesma regra do painel de um caso (TempoCasoPainel): so casos mais lentos/rapidos, com tempo atual.
import { useState } from "react";
import { toast } from "sonner";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { AtrasoRodagem } from "@/types/db";
import { trocarBaseTempo } from "@/services/data";
import { mensagemDaApi } from "@/lib/apiErro";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmarAcao } from "@/components/ConfirmarAcao";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDuration } from "./PerformanceTab";

export function casosRegravaveis(data: AtrasoRodagem[]): AtrasoRodagem[] {
  return data.filter((d) => d.codigo_teste && d.status !== "igual" && d.atual_segundos > 0 && d.atual_segundos !== d.base_segundos);
}

export function RegravarTemposVarios({ casos, onBaseTrocada }: { casos: AtrasoRodagem[]; onBaseTrocada: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [feitos, setFeitos] = useState<number | null>(null); // null = parado; numero = regravando

  const marcar = (filtro: (d: AtrasoRodagem) => boolean) => setMarcados(new Set(casos.filter(filtro).map((d) => d.id)));
  const alternar = (id: string) => setMarcados((atual) => {
    const novo = new Set(atual);
    if (!novo.delete(id)) novo.add(id);
    return novo;
  });
  const abrir = () => {
    marcar(() => true);
    setAberto(true);
  };
  const escolhidos = casos.filter((d) => marcados.has(d.id));
  const ocupado = feitos !== null;

  const regravar = async () => {
    const falhas: AtrasoRodagem[] = [];
    let ultimoErro = "";
    setFeitos(0);
    // Um por vez: a API troca a base de um caso por chamada.
    for (const [i, d] of escolhidos.entries()) {
      try {
        await trocarBaseTempo(d.codigo_teste!, d.atual_segundos);
      } catch (e) {
        falhas.push(d);
        ultimoErro = mensagemDaApi(e);
      }
      setFeitos(i + 1);
    }
    queryClient.invalidateQueries({ queryKey: ["historico-tempo"] });
    const ok = escolhidos.length - falhas.length;
    if (ok > 0) onBaseTrocada();
    setFeitos(null);
    setConfirmando(false);
    if (falhas.length === 0) {
      toast.success(`Tempo base regravado em ${ok} ${ok === 1 ? "caso" : "casos"}`);
      setAberto(false);
      return;
    }
    // Ficam marcados so os que falharam, para tentar de novo.
    setMarcados(new Set(falhas.map((d) => d.id)));
    toast.error(`${falhas.length} de ${escolhidos.length} não foram regravados`, { description: ultimoErro });
  };

  if (casos.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>Regravar vários</Button>

      <Dialog open={aberto} onOpenChange={(o) => !ocupado && setAberto(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regravar tempo base</DialogTitle>
            <DialogDescription>
              O tempo desta rodagem vira o novo tempo base dos casos marcados. Clique num caso para desmarcar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => marcar(() => true)}>Selecionar todos</Button>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => marcar((d) => d.status === "mais_lento")}>Somente mais lentos</Button>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => marcar((d) => d.status === "mais_rapido")}>Somente mais rápidos</Button>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => marcar(() => false)}>Limpar seleção</Button>
          </div>

          <ul className="max-h-[50vh] divide-y divide-border/60 overflow-y-auto rounded-md border border-border" aria-label="Casos que podem ser regravados">
            {casos.map((d) => {
              const lento = d.status === "mais_lento";
              return (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                    <Checkbox checked={marcados.has(d.id)} onCheckedChange={() => alternar(d.id)} disabled={ocupado} aria-label={`CT [${d.codigo_teste}]`} />
                    <span className="w-24 shrink-0 font-mono text-xs">{d.codigo_teste}</span>
                    <span className="min-w-0 flex-1 truncate" title={d.nome_teste || undefined}>{d.nome_teste || "—"}</span>
                    {lento ? <TrendingUp className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Mais lento" /> : <TrendingDown className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Mais rápido" />}
                    <span className="shrink-0 font-mono text-xs">
                      {formatDuration(d.base_segundos)} → <span className={lento ? "text-destructive" : "text-success"}>{formatDuration(d.atual_segundos)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <DialogFooter className="gap-2 sm:items-center sm:justify-between sm:gap-0">
            <span className="text-xs text-muted-foreground">{escolhidos.length} de {casos.length} selecionados</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button onClick={() => setConfirmando(true)} disabled={ocupado || escolhidos.length === 0}>Confirmar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmarAcao
        aberto={confirmando}
        titulo={`Regravar ${escolhidos.length} ${escolhidos.length === 1 ? "caso de teste" : "casos de teste"}?`}
        descricao="Deseja regravar o tempo base de todos os casos de teste selecionados? As próximas rodagens vão ser comparadas com o novo tempo; a base atual fica registrada."
        acao="Regravar"
        ocupado={ocupado}
        onConfirmar={regravar}
        onFechar={() => setConfirmando(false)}
      >
        {ocupado && <p className="text-sm text-muted-foreground">Regravando {feitos} de {escolhidos.length}…</p>}
      </ConfirmarAcao>
    </>
  );
}
