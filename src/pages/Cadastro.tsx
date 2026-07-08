import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";

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
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErr(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(parsed.data);
    setSubmitting(false);
    if (error) setErr(error);
    else nav("/aguardando-aprovacao", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary glow-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">Criar conta</CardTitle>
          <CardDescription>Sua conta ficará pendente até aprovação do admin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome de usuário</Label>
              <Input value={form.username} onChange={(e) => upd("username", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.first_name} onChange={(e) => upd("first_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Sobrenome</Label>
                <Input value={form.last_name} onChange={(e) => upd("last_name", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={form.password} onChange={(e) => upd("password", e.target.value)} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
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
