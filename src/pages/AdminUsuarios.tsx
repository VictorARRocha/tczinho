import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/services/authApi";
import type { AppUserProfile } from "@/services/authApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PERMISSOES, type Permissao } from "@/lib/permissoes";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Ban, RotateCcw } from "lucide-react";

type AppUserRow = AppUserProfile;

const STATUS_LABEL: Record<AppUserRow["status"], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  disabled: "Desativado",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminUsuarios() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AppUserRow["status"]>("pending");
  const [rejectFor, setRejectFor] = useState<AppUserRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await authApi.users();
      setUsers(users ?? []);
    } catch (error) {
      toast.error("Erro ao carregar usuarios", { description: errorMessage(error, "Falha ao carregar usuarios.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateUser(u: AppUserRow, data: Parameters<typeof authApi.updateUser>[1], success?: string) {
    try {
      await authApi.updateUser(u.id, data);
      if (success) toast.success(success);
      if (u.id === profile?.id) await refreshProfile();
      await load();
    } catch (error) {
      toast.error("Falha", { description: errorMessage(error, "Falha ao atualizar usuario.") });
    }
  }

  async function approve(u: AppUserRow) {
    await updateUser(u, { status: "approved" }, "Usuario aprovado");
  }

  async function reject(u: AppUserRow, reason: string) {
    await updateUser(u, { status: "rejected", rejection_reason: reason }, "Usuario rejeitado");
  }

  async function disable(u: AppUserRow) {
    await updateUser(u, { status: "disabled" });
  }

  async function reactivate(u: AppUserRow) {
    await updateUser(u, { status: "approved" });
  }

  async function togglePermissao(u: AppUserRow, permissao: Permissao, marcar: boolean) {
    const atuais = u.permissions || [];
    const novas = marcar ? [...atuais, permissao] : atuais.filter((p) => p !== permissao);
    const label = PERMISSOES.find((p) => p.id === permissao)?.label || permissao;
    // Uma alteracao por vez por usuario: a proxima parte da lista ja recarregada.
    setSalvando(u.id);
    try {
      await updateUser(u, { permissions: novas }, `${label}: ${marcar ? "liberado" : "removido"} para ${u.username}`);
    } finally {
      setSalvando(null);
    }
  }

  async function toggleRole(u: AppUserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    await updateUser(u, { role: newRole });
  }

  const filtered = useMemo(() => users.filter((u) => u.status === tab), [users, tab]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Aprove cadastros e escolha o que cada pessoa pode fazer. Ver rodagens todos podem; o administrador pode tudo.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AppUserRow["status"])}>
        <TabsList className="max-sm:h-auto max-sm:flex-wrap max-sm:justify-start">
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
              <p className="text-sm text-muted-foreground">Nenhum usuario.</p>
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
                          {u.first_name} {u.last_name} - {u.email}
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
                  {(u.status === "approved" || u.status === "pending") && (
                    <CardContent className="pt-0">
                      {u.role === "admin" ? (
                        <p className="text-xs text-muted-foreground">Administrador: pode tudo.</p>
                      ) : (
                        <div role="group" aria-label={`Permissões de ${u.username}`} className="flex flex-wrap gap-x-6 gap-y-2">
                          {PERMISSOES.map((perm) => (
                            <label key={perm.id} className="flex items-center gap-2 text-sm cursor-pointer" title={perm.descricao}>
                              <Checkbox
                                checked={(u.permissions || []).includes(perm.id)}
                                disabled={salvando === u.id}
                                onCheckedChange={(v) => togglePermissao(u, perm.id, v === true)}
                                aria-label={`${perm.label} (${u.username})`}
                              />
                              {perm.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
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

      <Dialog open={!!rejectFor} onOpenChange={(open) => !open && setRejectFor(null)}>
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
