import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botoes "Limpar" / "Mostrar todas" do historico Jenkins (limpeza so neste navegador). */
export function HistoryClearControls({
  hiddenCount,
  canClear,
  onClear,
  onRestore,
}: {
  hiddenCount: number;
  canClear: boolean;
  onClear: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {hiddenCount > 0 && (
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onRestore}>
          {hiddenCount === 1 ? "1 oculta" : `${hiddenCount} ocultas`} · Mostrar todas
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={!canClear}
        onClick={onClear}
        title="Oculta as solicitações finalizadas só neste navegador. Nada é apagado do servidor."
      >
        <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar
      </Button>
    </div>
  );
}
