import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Lock, IdCard, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AuthShell } from "@/components/AuthShell";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export default function Register() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userValid = USERNAME_RE.test(username.trim().toLowerCase());
  const nameValid = fullName.trim().length >= 2;
  const pwLen = password.length >= 6;
  const pwMatch = password.length > 0 && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!userValid) return setError("Usuário: 3-32 caracteres, apenas letras minúsculas, números, ponto, hífen ou underline.");
    if (!nameValid) return setError("Informe seu nome e sobrenome.");
    if (!pwLen) return setError("Senha deve ter pelo menos 6 caracteres.");
    if (!pwMatch) return setError("As senhas não coincidem.");

    setLoading(true);
    try {
      await signUp(username.trim().toLowerCase(), fullName.trim(), password);
      toast({
        title: "Cadastro enviado",
        description: "Aguarde aprovação de um administrador.",
      });
      nav("/login", { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Falha ao cadastrar.");
    } finally {
      setLoading(false);
    }
  }

  const Req = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className={`flex items-center gap-1.5 text-[11px] transition-colors ${ok ? "text-success" : "text-muted-foreground"}`}>
      <CheckCircle2 className={`h-3 w-3 ${ok ? "opacity-100" : "opacity-40"}`} />
      {children}
    </div>
  );

  return (
    <AuthShell
      eyebrow="Novo cadastro"
      title="Criar sua conta"
      subtitle="Preencha seus dados. Um administrador irá aprovar seu acesso em seguida."
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="u" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nome de usuário
          </Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="u"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              className="h-11 pl-10 bg-card/60 border-border/70 focus-visible:border-primary/70 focus-visible:ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pl-1">
            <Req ok={userValid}>3–32 caracteres · letras, números, . _ -</Req>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="n" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nome e sobrenome
          </Label>
          <div className="relative">
            <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="n"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="h-11 pl-10 bg-card/60 border-border/70 focus-visible:border-primary/70 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Senha
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="p"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 pl-10 pr-10 bg-card/60 border-border/70 focus-visible:border-primary/70 focus-visible:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="c" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Confirmar senha
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="c"
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="h-11 pl-10 bg-card/60 border-border/70 focus-visible:border-primary/70 focus-visible:ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
            <Req ok={pwLen}>Mínimo 6 caracteres</Req>
            <Req ok={pwMatch}>Senhas iguais</Req>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full font-medium bg-gradient-to-r from-primary to-primary-glow hover:opacity-95 shadow-lg shadow-primary/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Enviando cadastro...
            </>
          ) : (
            "Criar cadastro"
          )}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground pt-1">
          Seu acesso ficará pendente até aprovação de um administrador.
        </p>
      </form>
    </AuthShell>
  );
}
