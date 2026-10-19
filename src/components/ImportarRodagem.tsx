import { useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { temPermissao } from "@/lib/permissoes";
import { PEDIDO_STATUS } from "@/lib/regravacao";
import { mensagemDaApi } from "@/lib/apiErro";
import { formatRelative } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { createImport, type ImportPedido } from "@/services/data";
import { invalidateImports, queryKeys, useImports } from "@/services/queries";

const EXEMPLO = "S:\\Teste automatico\\Arquivos\\Arquivos De Log\\ArquivosCompactados\\A07\\PROXIMA1.26.10.99 18_10_2026 08_16_16";
const ATIVOS = new Set(["solicitado", "processando"]);

function nomeDaPasta(pasta: string): string {
  return pasta.split("\\").filter(Boolean).pop() || pasta;
}

/**
 * Botao "Adicionar rodagem" da visao geral: a pessoa informa a pasta do log compactado e o
 * RegravacaoBridge roda o run_agent_tc_python.bat na D01. Avisa quando a importacao termina.
 */
export function ImportarRodagem() {
  const { profile, isAdmin } = useAuth();
  const pode = temPermissao(profile, isAdmin, "rodagem");
  const { data: pedidos = [], refetch } = useImports(pode);
  const [aberto, setAberto] = useState(false);
  const [pasta, setPasta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const statusAnterior = useRef<Map<string, string> | null>(null);
  const ativos = pedidos.filter((p) => ATIVOS.has(p.status));

  // Importacao que estava na fila/rodando e terminou: avisa e atualiza os cards dos modulos.
  useEffect(() => {
    const anterior = statusAnterior.current;
    if (anterior) {
      pedidos.forEach((p) => {
        if (!ATIVOS.has(anterior.get(p.id) ?? "") || ATIVOS.has(p.status)) return;
        if (p.status === "concluido") {
          toast.success(`Rodagem importada — ${nomeDaPasta(p.run_folder)}`);
          queryClient.invalidateQueries({ queryKey: queryKeys.latestRuns });
        } else {
          toast.error(`Importação falhou — ${nomeDaPasta(p.run_folder)}`, { description: p.error_message ?? undefined });
        }
      });
    }
    statusAnterior.current = new Map(pedidos.map((p) => [p.id, p.status]));
  }, [pedidos]);

  if (!pode) return null;

  const abrir = () => {
    setAberto(true);
    refetch();
  };

  const importar = async () => {
    const valor = pasta.trim();
    if (!valor) return toast.error("Informe o caminho da pasta da rodagem");
    setEnviando(true);
    try {
      await createImport(valor);
      toast.success("Importação na fila", { description: "A D01 importa a rodagem; o aviso aparece quando terminar." });
      setPasta("");
      setAberto(false);
      await invalidateImports();
    } catch (e) {
      toast.error("Não foi possível importar", { description: mensagemDaApi(e) });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={abrir} className="shrink-0">
        {ativos.length > 0 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
        {ativos.length > 0 ? "Importando…" : "Adicionar rodagem"}
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => !enviando && setAberto(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar rodagem</DialogTitle>
            <DialogDescription>
              Informe a pasta do log compactado da rodagem. A D01 importa para o AgenteTC; pode levar alguns minutos.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              importar();
            }}
          >
            <Label htmlFor="importar-pasta" className="text-xs text-muted-foreground">Pasta da rodagem</Label>
            <Input
              id="importar-pasta"
              autoFocus
              value={pasta}
              onChange={(e) => setPasta(e.target.value)}
              placeholder={EXEMPLO}
              className="font-mono text-xs"
              disabled={enviando}
            />
            <DialogFooter className="gap-2 pt-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
              <Button type="submit" disabled={enviando || !pasta.trim()}>{enviando ? "Enviando…" : "Importar"}</Button>
            </DialogFooter>
          </form>

          {pedidos.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimas importações</h3>
              <ul className="space-y-2">
                {pedidos.slice(0, 5).map((p) => <ItemImportacao key={p.id} pedido={p} />)}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemImportacao({ pedido }: { pedido: ImportPedido }) {
  const meta = PEDIDO_STATUS[pedido.status] || { label: pedido.status, className: "" };
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded border px-1.5 py-0.5 ${meta.className}`}>{meta.label}</span>
        <span className="min-w-0 truncate font-mono" title={pedido.run_folder}>{nomeDaPasta(pedido.run_folder)}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {[pedido.vm, pedido.requested_by, formatRelative(pedido.created_at)].filter(Boolean).join(" · ")}
        </span>
      </div>
      {pedido.error_message && <p className="mt-1 text-destructive">{pedido.error_message}</p>}
      {pedido.status === "erro" && pedido.output && (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">Saída do .bat</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">{pedido.output}</pre>
        </details>
      )}
    </li>
  );
}
