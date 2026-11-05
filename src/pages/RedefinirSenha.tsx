import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "@/services/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const LINK_INVALIDO = "Link inválido, expirado ou já usado. Peça um novo a algum membro do setor de Testes automatizados.";

/** Tela do link de uso unico que o admin manda: nova senha digitada duas vezes. */
export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  // undefined = conferindo o link; null = link invalido.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!token) { setUsername(null); return; }
    let ativo = true;
    authApi.checkPasswordReset(token)
      .then((r) => ativo && setUsername(r.username))
      .catch(() => ativo && setUsername(null));
    return () => { ativo = false; };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (senha.length < 8) return setErr("A senha deve ter pelo menos 8 caracteres.");
    if (senha !== confirmacao) return setErr("As senhas não conferem.");
    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset(token, senha);
      setPronto(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível salvar a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img src="/sci-logo.png" alt="SCI Sistemas" className="mx-auto block h-16 w-16" />
          <CardTitle as="h1" className="font-display">Redefinir senha</CardTitle>
          {username && !pronto && <CardDescription>Nova senha para <span className="font-medium text-foreground">{username}</span></CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {username === undefined ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo o link...</div>
          ) : username === null ? (
            <p role="alert" className="text-sm text-destructive">{LINK_INVALIDO}</p>
          ) : pronto ? (
            <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">Senha alterada. Já pode entrar com a nova senha.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  aria-describedby="nova-senha-regra"
                />
                <p id="nova-senha-regra" className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirma-senha">Confirme a nova senha</Label>
                <Input
                  id="confirma-senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? "redefinir-erro" : undefined}
                />
              </div>
              <p id="redefinir-erro" role="alert" className="text-sm text-destructive empty:hidden">{err}</p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar nova senha
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">Ir para o login</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
