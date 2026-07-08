import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export default function AcessoNegado() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle className="font-display">Acesso negado</CardTitle>
          <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full"><Link to="/">Voltar ao início</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
