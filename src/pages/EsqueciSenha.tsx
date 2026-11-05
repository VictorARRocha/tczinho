import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "@/services/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const MENSAGEM_PEDIDO =
  'Solicitação de redefinição pendente, peça para algum membro do setor de "Testes automatizados" aprovar sua requisição!';

export default function EsqueciSenha() {
  const [username, setUsername] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset(username);
      setEnviado(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível enviar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img src="/sci-logo.png" alt="SCI Sistemas" className="mx-auto block h-16 w-16" />
          <CardTitle as="h1" className="font-display">Esqueci a senha</CardTitle>
          <CardDescription>Informe seu usuário para pedir uma nova senha</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enviado ? (
            <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{MENSAGEM_PEDIDO}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="esqueci-usuario">Usuário</Label>
                <Input
                  id="esqueci-usuario"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? "esqueci-erro" : undefined}
                />
              </div>
              <p id="esqueci-erro" role="alert" className="text-sm text-destructive empty:hidden">{err}</p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Pedir redefinição
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">Voltar para o login</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
