import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ModulosChecklist } from "@/components/ModulosChecklist";

const schema = z.object({
  username: z.string().trim().min(3, "Mínimo 3 caracteres").max(40).regex(/^[a-zA-Z0-9._-]+$/, "Só letras, números, . _ -"),
  first_name: z.string().trim().min(1, "Obrigatório").max(60),
  last_name: z.string().trim().min(1, "Obrigatório").max(60),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export default function Cadastro() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", first_name: "", last_name: "", password: "" });
  const [modulos, setModulos] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Campo do erro atual: recebe aria-invalid e aponta para a mensagem.
  const [campoErro, setCampoErro] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCampoErro(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const primeiro = parsed.error.errors[0];
      setErr(primeiro?.message ?? "Dados inválidos");
      setCampoErro(String(primeiro?.path[0] ?? ""));
      return;
    }
    if (modulos.length === 0) {
      setErr("Escolha pelo menos um módulo");
      setCampoErro("modulos");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp({
      ...(parsed.data as { username: string; first_name: string; last_name: string; password: string }),
      modules: modulos,
    });
    setSubmitting(false);
    if (error) setErr(error);
    else nav("/aguardando-aprovacao", { replace: true });
  }

  const erroDo = (campo: string) =>
    campoErro === campo ? { "aria-invalid": true, "aria-describedby": "cadastro-erro" } : {};

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img src="/sci-logo.png" alt="SCI Sistemas" className="mx-auto block h-16 w-16" />
          <CardTitle as="h1" className="font-display">Criar conta</CardTitle>
          <CardDescription>Sua conta ficará pendente até aprovação do admin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cadastro-usuario">Nome de usuário</Label>
              <Input
                id="cadastro-usuario"
                autoComplete="username"
                value={form.username}
                onChange={(e) => upd("username", e.target.value)}
                required
                {...erroDo("username")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cadastro-nome">Nome</Label>
                <Input
                  id="cadastro-nome"
                  autoComplete="given-name"
                  value={form.first_name}
                  onChange={(e) => upd("first_name", e.target.value)}
                  required
                  {...erroDo("first_name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cadastro-sobrenome">Sobrenome</Label>
                <Input
                  id="cadastro-sobrenome"
                  autoComplete="family-name"
                  value={form.last_name}
                  onChange={(e) => upd("last_name", e.target.value)}
                  required
                  {...erroDo("last_name")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cadastro-modulos">Módulos que você usa</Label>
              <ModulosChecklist id="cadastro-modulos" value={modulos} onChange={setModulos} />
              <p className="text-[11px] text-muted-foreground">O administrador confere na aprovação.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cadastro-senha">Senha</Label>
              <Input
                id="cadastro-senha"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => upd("password", e.target.value)}
                required
                aria-describedby={campoErro === "password" ? "cadastro-senha-regra cadastro-erro" : "cadastro-senha-regra"}
                aria-invalid={campoErro === "password" ? true : undefined}
              />
              <p id="cadastro-senha-regra" className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>
            </div>
            <p id="cadastro-erro" role="alert" className="text-sm text-destructive empty:hidden">{err}</p>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cadastrar
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
