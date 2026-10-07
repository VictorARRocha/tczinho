import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEM_PERMISSAO, type Permissao } from "@/lib/permissoes";

/** Aviso ao lado de uma acao bloqueada por falta de permissao (ou de acesso ao modulo, com `mensagem`). */
export function SemPermissao({ permissao, mensagem, className }: { permissao?: Permissao; mensagem?: string; className?: string }) {
  return (
    <p role="note" className={cn("flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400", className)}>
      <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      {mensagem || (permissao ? SEM_PERMISSAO[permissao] : "")}
    </p>
  );
}
