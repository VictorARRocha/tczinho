import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";
import { Clock, LogOut } from "lucide-react";

export default function Pending() {
  const { user, profile, signOut, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.status === "approved") return <Navigate to="/" replace />;

  const rejected = profile?.status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-bold mb-2">
          {rejected ? "Cadastro rejeitado" : "Aguardando aprovação"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {rejected
            ? "Seu cadastro foi rejeitado por um administrador. Você pode se cadastrar novamente."
            : "Seu cadastro está pendente de aprovação de um administrador. Assim que aprovado, você poderá acessar o Agent TC."}
        </p>
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
}
