import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, ShieldCheck, ShieldOff, Check, X, Trash2, Settings2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Row = {
  id: string;
  username: string;
  full_name: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
};

type Filter = "pending" | "approved" | "admins" | "all";

export default function AdminUsers() {
  const { user: me, refresh } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, boolean>>({});
  const [savingPerm, setSavingPerm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, username, full_name, role, status, created_at, approved_at")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "pending" && r.status !== "pending") return false;
      if (filter === "approved" && r.status !== "approved") return false;
      if (filter === "admins" && r.role !== "admin") return false;
      if (term && !(`${r.username} ${r.full_name}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [rows, filter, q]);

  const adminCount = useMemo(
    () => rows.filter((r) => r.role === "admin" && r.status === "approved").length,
    [rows],
  );

  async function updateProfile(id: string, patch: Partial<Row>) {
    const { error } = await supabase.from("user_profiles").update(patch).eq("id", id);
    if (error) { toast({ title: "Falhou", description: error.message, variant: "destructive" }); return false; }
    return true;
  }

  async function approve(r: Row) {
    const ok = await updateProfile(r.id, { status: "approved", approved_at: new Date().toISOString(), approved_by: me?.id ?? null } as any);
    if (ok) { toast({ title: "Usuário aprovado", description: r.username }); load(); }
  }
  async function reject(r: Row) {
    const ok = await updateProfile(r.id, { status: "rejected" });
    if (ok) { toast({ title: "Usuário rejeitado", description: r.username }); load(); }
  }
  async function toggleAdmin(r: Row) {
    if (r.role === "admin" && adminCount <= 1) {
      toast({ title: "Ação bloqueada", description: "É o último administrador do sistema.", variant: "destructive" });
      return;
    }
    const ok = await updateProfile(r.id, { role: r.role === "admin" ? "user" : "admin" });
    if (ok) { load(); if (r.id === me?.id) refresh(); }
  }
  async function remove(r: Row) {
    if (r.role === "admin") {
      toast({ title: "Bloqueado", description: "Rebaixe o admin antes de excluir.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("user_profiles").delete().eq("id", r.id);
    if (error) { toast({ title: "Falhou", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Usuário removido" });
    load();
  }

  async function openPermissions(r: Row) {
    setEditing(r);
    const { data } = await supabase
      .from("user_permissions")
      .select("permission, allowed")
      .eq("user_id", r.id);
    const map: Record<string, boolean> = {};
    for (const p of ALL_PERMISSIONS) map[p] = false;
    for (const row of (data ?? []) as { permission: string; allowed: boolean }[]) {
      if (row.permission in map) map[row.permission] = row.allowed;
    }
    setEditingPerms(map);
  }

  async function togglePerm(perm: Permission, value: boolean) {
    if (!editing) return;
    // Protect: not removing your own admin_all if you are the only admin
    if (perm === "admin_all" && !value && editing.id === me?.id && adminCount <= 1) {
      toast({ title: "Bloqueado", description: "Você é o único admin.", variant: "destructive" });
      return;
    }
    setSavingPerm(perm);
    const { error } = await supabase
      .from("user_permissions")
      .upsert({ user_id: editing.id, permission: perm, allowed: value }, { onConflict: "user_id,permission" });
    setSavingPerm(null);
    if (error) { toast({ title: "Falhou", description: error.message, variant: "destructive" }); return; }
    setEditingPerms((prev) => ({ ...prev, [perm]: value }));
    if (editing.id === me?.id) refresh();
  }

  const StatusBadge = ({ s }: { s: Row["status"] }) => {
    const map = {
      pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
      approved: { label: "Aprovado", cls: "bg-success/15 text-success border-success/30" },
      rejected: { label: "Rejeitado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    }[s];
    return <Badge variant="outline" className={map.cls}>{map.label}</Badge>;
  };

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10 animate-fade-in">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Administração</div>
        <h1 className="font-display text-3xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprove cadastros, gerencie funções e permissões por funcionalidade.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["pending", "approved", "admins", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : f === "admins" ? "Admins" : "Todos"}
          </Button>
        ))}
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Buscar usuário ou nome" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Nenhum usuário nesta visão.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Usuário</th>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Função</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Criado em</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono">{r.username}{r.id === me?.id && <span className="ml-2 text-[10px] text-muted-foreground">(você)</span>}</td>
                  <td className="px-4 py-3">{r.full_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={r.role === "admin" ? "border-primary/40 text-primary bg-primary/10" : ""}>{r.role}</Badge>
                  </td>
                  <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => approve(r)}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => reject(r)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openPermissions(r)}>
                        <Settings2 className="h-3.5 w-3.5 mr-1" /> Permissões
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleAdmin(r)}>
                        {r.role === "admin" ? <ShieldOff className="h-3.5 w-3.5 mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                        {r.role === "admin" ? "Remover admin" : "Tornar admin"}
                      </Button>
                      {r.role !== "admin" && r.id !== me?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O perfil de <strong>{r.username}</strong> será removido. Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(r)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Permissões de {editing?.username}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {ALL_PERMISSIONS.map((p) => (
              <div key={p} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">{PERMISSION_LABELS[p]}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{p}</div>
                </div>
                <Switch
                  checked={!!editingPerms[p]}
                  disabled={savingPerm === p}
                  onCheckedChange={(v) => togglePerm(p, v)}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              Usuários com <span className="font-mono">admin_all</span> ou função <span className="font-mono">admin</span> têm todas as permissões.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
