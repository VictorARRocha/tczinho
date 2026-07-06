import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-bold mb-2">Acesso negado</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Você não tem permissão para acessar esta página. Solicite acesso a um administrador.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar para o início</Link>
        </Button>
      </div>
    </div>
  );
}
