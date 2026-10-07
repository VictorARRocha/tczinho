import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/services/authApi";
import type { AppUserProfile } from "@/services/authApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Ban, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULOS_ACESSO, PERMISSOES, TODOS_MODULOS, nomeModulo, type Permissao } from "@/lib/permissoes";

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

/** Ausente (API anterior aos modulos) = todos. */
function modulosDe(u: AppUserRow): string[] {
  return Array.isArray(u.modules) ? u.modules : [TODOS_MODULOS];
}

type Edicao = { user: AppUserRow; modo: "editar" | "aprovar" };

export default function AdminUsuarios() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AppUserRow["status"]>("pending");
  const [rejectFor, setRejectFor] = useState<AppUserRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);

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

  async function updateUser(u: AppUserRow, data: Parameters<typeof authApi.updateUser>[1], success?: string): Promise<boolean> {
    try {
      await authApi.updateUser(u.id, data);
      if (success) toast.success(success);
      if (u.id === profile?.id) await refreshProfile();
      await load();
      return true;
    } catch (error) {
      toast.error("Falha", { description: errorMessage(error, "Falha ao atualizar usuario.") });
      return false;
    }
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

  async function toggleRole(u: AppUserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    return updateUser(u, { role: newRole });
  }

  const filtered = useMemo(() => users.filter((u) => u.status === tab), [users, tab]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Aprove cadastros e escolha o que cada pessoa pode fazer e em quais módulos. Ver rodagens todos podem; o administrador pode tudo.
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
          <TabsContent key={s} value={s} className="space-y-2 mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuario.</p>
            ) : (
              filtered.map((u) => (
                <Card key={u.id} aria-label={`Usuário ${u.username}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[180px] flex-1">
                    <div className="text-sm font-semibold">
                      <span className="font-mono">{u.username}</span>
                      {u.role === "admin" && <Badge className="ml-2" variant="default">admin</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {u.first_name} {u.last_name} - {u.email}
                    </p>
                    {u.status === "rejected" && u.rejection_reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">Motivo: {u.rejection_reason}</p>
                    )}
                  </div>
                  {(u.status === "approved" || u.status === "pending") && <ResumoAcesso user={u} />}
                  <div className="flex flex-wrap gap-2">
                    {u.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => setEdicao({ user: u, modo: "aprovar" })}><UserCheck className="h-4 w-4 mr-1" />Revisar e aprovar</Button>
                        <Button size="sm" variant="destructive" onClick={() => { setRejectFor(u); setRejectReason(""); }}><UserX className="h-4 w-4 mr-1" />Rejeitar</Button>
                      </>
                    )}
                    {u.status === "approved" && (
                      <>
                        {u.role === "admin" ? (
                          <Button size="sm" variant="outline" onClick={() => toggleRole(u)}><ShieldOff className="h-4 w-4 mr-1" />Remover admin</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setEdicao({ user: u, modo: "editar" })}>
                            <SlidersHorizontal className="h-4 w-4 mr-1" />Editar acesso
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => disable(u)}><Ban className="h-4 w-4 mr-1" />Desativar</Button>
                      </>
                    )}
                    {(u.status === "rejected" || u.status === "disabled") && (
                      <Button size="sm" onClick={() => reactivate(u)}><RotateCcw className="h-4 w-4 mr-1" />Reativar</Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      {edicao && (
        <AcessoDialog
          key={edicao.user.id + edicao.modo}
          edicao={edicao}
          onClose={() => setEdicao(null)}
          onSalvar={async (dados) => {
            const aprovar = edicao.modo === "aprovar";
            const ok = await updateUser(
              edicao.user,
              aprovar ? { ...dados, status: "approved" } : dados,
              aprovar ? `${edicao.user.username} aprovado` : `Acesso de ${edicao.user.username} atualizado`,
            );
            if (ok) setEdicao(null);
          }}
          onTornarAdmin={async () => {
            if (await toggleRole(edicao.user)) setEdicao(null);
          }}
          onRejeitar={() => { setRejectFor(edicao.user); setRejectReason(""); setEdicao(null); }}
        />
      )}

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

/* ---------------------------------------------------------------- resumo em etiquetas */

function Etiqueta({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "acao" | "todos" | "vazio" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px]",
        tom === "neutro" && "border-border bg-secondary/60",
        tom === "acao" && "border-primary/40 bg-primary/10 text-primary",
        tom === "todos" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tom === "vazio" && "border-dashed border-border italic text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function ResumoAcesso({ user }: { user: AppUserRow }) {
  if (user.role === "admin") {
    return <div className="flex-[2] min-w-[240px]"><Etiqueta tom="todos">Administrador: pode tudo</Etiqueta></div>;
  }
  const acoes = PERMISSOES.filter((p) => (user.permissions || []).includes(p.id));
  const modulos = modulosDe(user);
  return (
    <div className="flex-[2] min-w-[240px] space-y-1" aria-label={`Acesso de ${user.username}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-[11px] text-muted-foreground">Ações</span>
        {acoes.length ? acoes.map((p) => <Etiqueta key={p.id} tom="acao">{p.label}</Etiqueta>) : <Etiqueta tom="vazio">só visualiza</Etiqueta>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-[11px] text-muted-foreground">{user.status === "pending" ? "Pediu" : "Módulos"}</span>
        {modulos.includes(TODOS_MODULOS) ? (
          <Etiqueta tom="todos">Todos os módulos</Etiqueta>
        ) : modulos.length ? (
          modulos.map((m) => <Etiqueta key={m}>{nomeModulo(m)}</Etiqueta>)
        ) : (
          <Etiqueta tom="vazio">nenhum módulo</Etiqueta>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- janela "Editar acesso" / aprovacao */

function Alternavel({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        ativo ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {ativo && <span className="mr-1 font-bold text-primary">✓</span>}
      {children}
    </button>
  );
}

function AcessoDialog({
  edicao,
  onClose,
  onSalvar,
  onTornarAdmin,
  onRejeitar,
}: {
  edicao: Edicao;
  onClose: () => void;
  onSalvar: (dados: { permissions: string[]; modules: string[] }) => Promise<void>;
  onTornarAdmin: () => Promise<void>;
  onRejeitar: () => void;
}) {
  const { user, modo } = edicao;
  const inicial = modulosDe(user);
  const [acoes, setAcoes] = useState<Set<Permissao>>(new Set((user.permissions || []) as Permissao[]));
  const [todos, setTodos] = useState(inicial.includes(TODOS_MODULOS));
  const [modulos, setModulos] = useState<Set<string>>(new Set(inicial.filter((m) => m !== TODOS_MODULOS)));
  const [salvando, setSalvando] = useState(false);

  const alternar = <T,>(set: Set<T>, item: T, setter: (s: Set<T>) => void) => {
    const novo = new Set(set);
    if (novo.has(item)) novo.delete(item);
    else novo.add(item);
    setter(novo);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar({
        permissions: PERMISSOES.map((p) => p.id).filter((id) => acoes.has(id)),
        modules: todos ? [TODOS_MODULOS] : MODULOS_ACESSO.map((m) => m.slug).filter((s) => modulos.has(s)),
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modo === "aprovar" ? `Aprovar cadastro de ${user.username}` : `Acesso de ${user.username}`}</DialogTitle>
          <DialogDescription>
            {modo === "aprovar"
              ? "Os módulos que a pessoa pediu no cadastro já vêm marcados."
              : "Ver rodagens todos podem. Escolha o que a pessoa pode fazer e em quais módulos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">O que pode fazer</p>
            <div role="group" aria-label="O que pode fazer" className="flex flex-wrap gap-1.5">
              {PERMISSOES.map((p) => (
                <Alternavel key={p.id} ativo={acoes.has(p.id)} onClick={() => alternar(acoes, p.id, setAcoes)}>
                  <span title={p.descricao}>{p.label}</span>
                </Alternavel>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Em quais módulos</p>
            <button
              type="button"
              role="switch"
              aria-checked={todos}
              onClick={() => setTodos((v) => !v)}
              className="mb-2 flex items-center gap-2 text-sm"
            >
              <span className={cn("relative h-5 w-9 rounded-full border transition-colors", todos ? "border-primary bg-primary" : "border-border bg-input")}>
                <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background transition-all", todos ? "left-[18px]" : "left-0.5")} />
              </span>
              Todos os módulos
            </button>
            {!todos && (
              <div role="group" aria-label="Módulos" className="flex flex-wrap gap-1.5">
                {MODULOS_ACESSO.map((m) => (
                  <Alternavel key={m.slug} ativo={modulos.has(m.slug)} onClick={() => alternar(modulos, m.slug, setModulos)}>
                    {m.nome}
                  </Alternavel>
                ))}
              </div>
            )}
            {!todos && modulos.size === 0 && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">Sem nenhum módulo, a pessoa só visualiza.</p>
            )}
            {modo === "aprovar" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Pedido no cadastro: {inicial.includes(TODOS_MODULOS) ? "todos os módulos" : inicial.length ? inicial.map(nomeModulo).join(", ") : "nenhum módulo"}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {modo === "aprovar" ? (
            <Button variant="destructive" disabled={salvando} onClick={onRejeitar}><UserX className="h-4 w-4 mr-1" />Rejeitar</Button>
          ) : (
            <Button variant="outline" disabled={salvando} onClick={onTornarAdmin}><ShieldCheck className="h-4 w-4 mr-1" />Tornar admin</Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" disabled={salvando} onClick={onClose}>Cancelar</Button>
            <Button disabled={salvando} onClick={salvar}>
              {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {modo === "aprovar" ? "Aprovar" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
