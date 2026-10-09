import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <div className="max-w-sm text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">O endereço pode estar errado ou a página foi movida.</p>
      <Button asChild className="mt-6">
        <Link to="/">Ir para a visão geral</Link>
      </Button>
    </div>
  </div>
);

export default NotFound;
