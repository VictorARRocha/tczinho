import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, LogOut, XCircle, Ban, RefreshCw } from "lucide-react";

export default function AguardandoAprovacao() {
  const { loading, profile, signOut, session, refreshProfile, aguardandoAprovacao, verificarAprovacao } = useAuth();

  useEffect(() => {
    if (!session || profile?.status === "approved") return;

    refreshProfile();
    const interval = window.setInterval(refreshProfile, 5000);
    window.addEventListener("focus", refreshProfile);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshProfile);
    };
  }, [session, profile?.status, refreshProfile]);

  // Logo apos o cadastro (sem sessao, o login fica recusado ate a aprovacao): tenta entrar a cada 5 s.
  // Quando o admin aprova, a sessao abre e a tela vai direto para o dashboard.
  useEffect(() => {
    if (session || !aguardandoAprovacao) return;
    const verificar = () => { verificarAprovacao(); };
    const interval = window.setInterval(verificar, 5000);
    window.addEventListener("focus", verificar);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", verificar);
    };
  }, [session, aguardandoAprovacao, verificarAprovacao]);

  if (loading) return <PageLoading message="Verificando aprovação..." />;

  if (session && profile?.status === "approved") {
    return <Navigate to="/" replace />;
  }

  const status = profile?.status ?? "pending";
  const view =
    status === "rejected"
      ? { icon: XCircle, title: "Cadastro rejeitado", desc: profile?.rejection_reason ?? "Seu cadastro foi rejeitado. Fale com um administrador." }
      : status === "disabled"
      ? { icon: Ban, title: "Conta desativada", desc: "Sua conta foi desativada. Fale com um administrador." }
      : { icon: Clock, title: "Cadastro pendente de aprovação", desc: "Um administrador precisa aprovar seu acesso. Volte em instantes." };

  const Icon = view.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle className="font-display">{view.title}</CardTitle>
          <CardDescription>{view.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div><span className="text-muted-foreground">Usuário:</span> <span className="font-mono">{profile.username}</span></div>
              {profile.first_name && <div><span className="text-muted-foreground">Nome:</span> {profile.first_name} {profile.last_name}</div>}
              <div><span className="text-muted-foreground">Status:</span> {profile.status}</div>
            </div>
          )}
          {session ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" className="w-full" onClick={() => refreshProfile()}>
                <RefreshCw className="h-4 w-4 mr-2" /> Verificar
              </Button>
              <Button variant="outline" className="w-full" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
            </div>
          ) : aguardandoAprovacao ? (
            <>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Assim que for aprovado, você entra automaticamente.
              </p>
              <Button asChild variant="outline" className="w-full"><Link to="/login">Ir para login</Link></Button>
            </>
          ) : (
            <Button asChild className="w-full"><Link to="/login">Ir para login</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
