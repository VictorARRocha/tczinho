import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmacao de acao que nao tem volta (cancelar rodagem, excluir pre-definicao), no lugar do
 * window.confirm: mostra o que vai ser afetado e deixa o botao da acao em vermelho.
 */
export function ConfirmarAcao({
  aberto, titulo, descricao, children, acao, ocupado = false, onConfirmar, onFechar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  children?: ReactNode;
  acao: string;
  ocupado?: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={ocupado}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? "Aguarde…" : acao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
