import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export default function Register() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      setError("Usuário: 3-32 caracteres, apenas letras minúsculas, números, ponto, hífen ou underline.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Informe seu nome e sobrenome.");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await signUp(u, fullName.trim(), password);
      toast({
        title: "Cadastro enviado",
        description: "Aguarde aprovação de um administrador.",
      });
      nav("/login", { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? "Falha ao cadastrar.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary glow-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">TC SCI</div>
            <div className="text-xs text-muted-foreground">Criar novo cadastro</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u">Nome de usuário</Label>
            <Input id="u" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu.usuario" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n">Nome e sobrenome</Label>
            <Input id="n" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Fulano da Silva" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Senha</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c">Confirmar senha</Label>
            <Input id="c" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Cadastrar
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
