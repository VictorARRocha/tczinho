import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Ban, RotateCcw } from "lucide-react";

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

  const load = useCallback(async () => {
    setLoading(true);
    const primary = await supabase
      .from("agent_tc_app_users")
      .select("id,auth_user_id,username,first_name,last_name,email,role,status,created_at,approved_at,rejected_at,rejection_reason")
      .order("created_at", { ascending: false });
    let data = primary.data as any[] | null;
    let error = primary.error;

    if (error && error.message.toLowerCase().includes("auth_user_id")) {
      const legacy = await supabase
        .from("agent_tc_app_users")
        .select("id,username,first_name,last_name,email,role,status,created_at,approved_at,rejected_at,rejection_reason")
        .order("created_at", { ascending: false });
      data = legacy.data as any[] | null;
      error = legacy.error;
    }

    if (error) toast({ title: "Erro ao carregar usuários", description: error.message, variant: "destructive" });
    setUsers((data ?? []) as AppUserRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

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

  const filtered = useMemo(() => users.filter((u) => u.status === tab), [users, tab]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground">Aprove cadastros e gerencie roles.</p>
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
    </div>
  );
}
