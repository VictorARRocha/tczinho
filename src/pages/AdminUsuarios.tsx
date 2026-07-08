import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fetchModules } from "@/services/data";
import type { Modulo } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Ban, RotateCcw, Settings2, Server } from "lucide-react";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected" | "disabled";
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

interface PermRow { code: string; label: string; categoria: string | null }

const FALLBACK_PERMISSION_CATALOG: PermRow[] = [
  { code: "dashboard.view", label: "Ver dashboard", categoria: "plataforma" },
  { code: "modules.view", label: "Ver módulos", categoria: "plataforma" },
  { code: "runs.view", label: "Ver rodagens", categoria: "plataforma" },
  { code: "failures.view", label: "Ver falhas", categoria: "plataforma" },
  { code: "groups.view", label: "Ver agrupamentos", categoria: "plataforma" },
  { code: "performance.view", label: "Ver performance", categoria: "plataforma" },
  { code: "history.view", label: "Ver histórico", categoria: "plataforma" },
  { code: "evidence.view", label: "Ver evidências", categoria: "plataforma" },
  { code: "jenkins.view", label: "Acessar Jenkins", categoria: "jenkins" },
  { code: "jenkins.run", label: "Disparar Jenkins", categoria: "jenkins" },
];

function isMissingRpc(error: any) {
  const message = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return message.includes("pgrst202") || message.includes("could not find the function") || message.includes("schema cache");
}

function permissionUserIds(user: AppUserRow) {
  return Array.from(new Set([user.id, user.auth_user_id].filter(Boolean))) as string[];
}

const STATUS_LABEL: Record<AppUserRow["status"], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  disabled: "Desativado",
};

export default function AdminUsuarios() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AppUserRow["status"]>("pending");
  const [rejectFor, setRejectFor] = useState<AppUserRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [permFor, setPermFor] = useState<AppUserRow | null>(null);
  const [catalog, setCatalog] = useState<PermRow[]>([]);
  const [modules, setModules] = useState<Modulo[]>([]);
  const [userPerms, setUserPerms] = useState<Set<string>>(new Set());
  const [userMods, setUserMods] = useState<Set<string>>(new Set());
  const [savingPerm, setSavingPerm] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_tc_app_users")
      .select("id,auth_user_id,username,first_name,last_name,email,role,status,created_at,approved_at,rejected_at,rejection_reason")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar usuários", description: error.message, variant: "destructive" });
    setUsers((data ?? []) as AppUserRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetchModules().then(setModules).catch(() => {});
    supabase.from("agent_tc_permission_catalog").select("code,label,categoria").order("categoria").then(({ data, error }) => {
      if (error) {
        toast({ title: "Catálogo de permissões indisponível", description: error.message, variant: "destructive" });
      }
      setCatalog(((data?.length ? data : FALLBACK_PERMISSION_CATALOG) ?? []) as PermRow[]);
    });

    // Realtime: novos cadastros, aprovações, mudanças de role → recarrega a lista
    const channel = supabase
      .channel("admin-users-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tc_app_users" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const uname = (payload.new as any)?.username;
          toast({ title: "Novo cadastro", description: uname ? `Usuário ${uname} aguarda aprovação.` : "Um novo usuário aguarda aprovação." });
        }
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function audit(action: string, target: AppUserRow, details?: any) {
    try {
      await supabase.from("agent_tc_admin_audit_log").insert({
        actor_id: profile?.id,
        actor_username: profile?.username,
        target_id: target.id,
        target_username: target.username,
        action,
        details: details ?? null,
      });
    } catch {}
  }

  async function approve(u: AppUserRow) {
    const { error } = await supabase.from("agent_tc_app_users").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: profile?.id }).eq("id", u.id);
    if (error) return toast({ title: "Falha", description: error.message, variant: "destructive" });
    await audit("approve", u);
    toast({ title: "Usuário aprovado" });
    load();
  }

  async function reject(u: AppUserRow, reason: string) {
    const { error } = await supabase.from("agent_tc_app_users").update({ status: "rejected", rejected_at: new Date().toISOString(), rejected_by: profile?.id, rejection_reason: reason }).eq("id", u.id);
    if (error) return toast({ title: "Falha", description: error.message, variant: "destructive" });
    await audit("reject", u, { reason });
    toast({ title: "Usuário rejeitado" });
    load();
  }

  async function disable(u: AppUserRow) {
    const { error } = await supabase.from("agent_tc_app_users").update({ status: "disabled", disabled_at: new Date().toISOString(), disabled_by: profile?.id }).eq("id", u.id);
    if (error) return toast({ title: "Falha", description: error.message, variant: "destructive" });
    await audit("disable", u);
    load();
  }

  async function reactivate(u: AppUserRow) {
    const { error } = await supabase.from("agent_tc_app_users").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: profile?.id }).eq("id", u.id);
    if (error) return toast({ title: "Falha", description: error.message, variant: "destructive" });
    await audit("reactivate", u);
    load();
  }

  async function toggleRole(u: AppUserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    const { error } = await supabase.from("agent_tc_app_users").update({ role: newRole }).eq("id", u.id);
    if (error) return toast({ title: "Falha", description: error.message, variant: "destructive" });
    await audit("role_change", u, { to: newRole });
    if (u.id === profile?.id) refreshProfile();
    load();
  }

  const loadPermissionsFor = useCallback(async (u: AppUserRow) => {
    setLoadingPerms(true);
    const ids = permissionUserIds(u);
    const [{ data: perms }, { data: mods }] = await Promise.all([
      supabase.from("agent_tc_user_permissions").select("permission_code").in("user_id", ids),
      supabase.from("agent_tc_user_module_permissions").select("modulo_slug").in("user_id", ids),
    ]);
    setUserPerms(new Set((perms ?? []).map((r: any) => r.permission_code)));
    setUserMods(new Set((mods ?? []).map((r: any) => r.modulo_slug)));
    setLoadingPerms(false);
  }, []);

  async function openPerm(u: AppUserRow) {
    setPermFor(u);
    await loadPermissionsFor(u);
  }

  async function persistPermission(code: string, checked: boolean) {
    if (!permFor) return;

    const { error: rpcError } = await supabase.rpc("agent_tc_set_user_permission", {
      _target_user_id: permFor.id,
      _permission_code: code,
      _enabled: checked,
    });

    if (!rpcError) return;
    if (!isMissingRpc(rpcError)) throw rpcError;

    if (checked) {
      const { error } = await supabase
        .from("agent_tc_user_permissions")
        .upsert({ user_id: permFor.id, permission_code: code, granted_by: profile?.id }, { onConflict: "user_id,permission_code" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("agent_tc_user_permissions")
        .delete()
        .in("user_id", permissionUserIds(permFor))
        .eq("permission_code", code);
      if (error) throw error;
    }
  }

  async function persistModule(slug: string, checked: boolean) {
    if (!permFor) return;

    const { error: rpcError } = await supabase.rpc("agent_tc_set_user_module_permission", {
      _target_user_id: permFor.id,
      _modulo_slug: slug,
      _enabled: checked,
    });

    if (!rpcError) return;
    if (!isMissingRpc(rpcError)) throw rpcError;

    if (checked) {
      const { error } = await supabase
        .from("agent_tc_user_module_permissions")
        .upsert({ user_id: permFor.id, modulo_slug: slug, granted_by: profile?.id }, { onConflict: "user_id,modulo_slug" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("agent_tc_user_module_permissions")
        .delete()
        .in("user_id", permissionUserIds(permFor))
        .eq("modulo_slug", slug);
      if (error) throw error;
    }
  }

  async function togglePerm(code: string, checked: boolean) {
    if (!permFor) return;
    setSavingPerm(true);
    try {
      await persistPermission(code, checked);
      await audit(checked ? "perm_grant" : "perm_revoke", permFor, { code });
      await loadPermissionsFor(permFor);
      toast({ title: checked ? "Permissão concedida" : "Permissão removida" });
    } catch (error: any) {
      toast({ title: "Permissão não foi salva", description: error?.message ?? "Revise o SQL/RLS de permissões no Supabase.", variant: "destructive" });
    } finally {
      setSavingPerm(false);
    }
  }

  async function toggleMod(slug: string, checked: boolean) {
    if (!permFor) return;
    setSavingPerm(true);
    try {
      await persistModule(slug, checked);
      await audit(checked ? "module_grant" : "module_revoke", permFor, { modulo_slug: slug });
      await loadPermissionsFor(permFor);
      toast({ title: checked ? "Módulo liberado" : "Módulo removido" });
    } catch (error: any) {
      toast({ title: "Permissão de módulo não foi salva", description: error?.message ?? "Revise o SQL/RLS de permissões no Supabase.", variant: "destructive" });
    } finally {
      setSavingPerm(false);
    }
  }

  const filtered = useMemo(() => users.filter((u) => u.status === tab), [users, tab]);
  const effectiveCatalog = catalog.length ? catalog : FALLBACK_PERMISSION_CATALOG;
  const jenkinsPermissions = useMemo(
    () => effectiveCatalog.filter((p) => p.categoria === "jenkins" || p.code.startsWith("jenkins.")),
    [effectiveCatalog],
  );
  const functionalPermissions = useMemo(
    () => effectiveCatalog.filter((p) => p.categoria !== "jenkins" && !p.code.startsWith("jenkins.") && p.categoria !== "admin" && !p.code.startsWith("admin.")),
    [effectiveCatalog],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground">Aprove, gerencie roles e permissões.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AppUserRow["status"])}>
        <TabsList>
          {(["pending", "approved", "rejected", "disabled"] as const).map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABEL[s]} <Badge variant="secondary" className="ml-2">{users.filter((u) => u.status === s).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {(["pending", "approved", "rejected", "disabled"] as const).map((s) => (
          <TabsContent key={s} value={s} className="space-y-3 mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário.</p>
            ) : (
              filtered.map((u) => (
                <Card key={u.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base">
                          <span className="font-mono">{u.username}</span>
                          {u.role === "admin" && <Badge className="ml-2" variant="default">admin</Badge>}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {u.first_name} {u.last_name} · {u.email}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {u.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => approve(u)}><UserCheck className="h-4 w-4 mr-1" />Aprovar</Button>
                            <Button size="sm" variant="destructive" onClick={() => { setRejectFor(u); setRejectReason(""); }}><UserX className="h-4 w-4 mr-1" />Rejeitar</Button>
                          </>
                        )}
                        {u.status === "approved" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openPerm(u)}><Settings2 className="h-4 w-4 mr-1" />Permissões</Button>
                            <Button size="sm" variant="outline" onClick={() => toggleRole(u)}>
                              {u.role === "admin" ? <><ShieldOff className="h-4 w-4 mr-1" />Remover admin</> : <><ShieldCheck className="h-4 w-4 mr-1" />Tornar admin</>}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => disable(u)}><Ban className="h-4 w-4 mr-1" />Desativar</Button>
                          </>
                        )}
                        {(u.status === "rejected" || u.status === "disabled") && (
                          <Button size="sm" onClick={() => reactivate(u)}><RotateCcw className="h-4 w-4 mr-1" />Reativar</Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {u.status === "rejected" && u.rejection_reason && (
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      Motivo: {u.rejection_reason}
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar {rejectFor?.username}</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo (opcional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (rejectFor) { reject(rejectFor, rejectReason); setRejectFor(null); } }}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permFor} onOpenChange={(o) => !o && setPermFor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Permissões — {permFor?.username}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {loadingPerms && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando permissões...
              </div>
            )}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4" /> Jenkins</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {jenkinsPermissions.map((p) => (
                  <label key={p.code} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Checkbox
                      checked={userPerms.has(p.code)}
                      onCheckedChange={(v) => togglePerm(p.code, !!v)}
                      disabled={savingPerm || loadingPerms}
                    />
                    <span className="flex-1">{p.label}</span>
                    <code className="text-[10px] text-muted-foreground">{p.code}</code>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Funcionais</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {functionalPermissions.map((p) => (
                  <label key={p.code} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Checkbox
                      checked={userPerms.has(p.code)}
                      onCheckedChange={(v) => togglePerm(p.code, !!v)}
                      disabled={savingPerm || loadingPerms}
                    />
                    <span className="flex-1">{p.label}</span>
                    <code className="text-[10px] text-muted-foreground">{p.code}</code>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Módulos</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modules.map((m) => (
                  <label key={m.slug} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Checkbox
                      checked={userMods.has(m.slug ?? "")}
                      onCheckedChange={(v) => toggleMod(m.slug ?? "", !!v)}
                      disabled={savingPerm || loadingPerms}
                    />
                    <span className="flex-1">{m.nome}</span>
                    <code className="text-[10px] text-muted-foreground">{m.slug}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPermFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
