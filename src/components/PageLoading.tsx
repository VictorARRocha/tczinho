import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PageLoadingProps {
  message?: string;
  variant?: "spinner" | "skeleton-cards" | "skeleton-table";
}

/**
 * Estado de carregamento reutilizável.
 * Não bloqueia interação global — exibe um placeholder elegante
 * enquanto a tela monta seus dados.
 */
export function PageLoading({ message = "Carregando...", variant = "spinner" }: PageLoadingProps) {
  if (variant === "skeleton-cards") {
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-aparecer-atrasado" aria-busy="true">
        <div className="mb-8 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "skeleton-table") {
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-aparecer-atrasado space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Sem o brilho desfocado e so aparece se a espera passar de 250ms (carregamento rapido nao pisca).
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 animate-aparecer-atrasado" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default PageLoading;
