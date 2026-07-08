import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppUserStatus = "pending" | "approved" | "rejected" | "disabled";
export type AppUserRole = "user" | "admin";

export interface AppUserProfile {
  id: string;
  auth_user_id?: string | null;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: AppUserRole;
  status: AppUserStatus;
  rejection_reason?: string | null;
}

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AppUserProfile | null;
  permissions: Set<string>;
  modules: Set<string>;
  isAdmin: boolean;
  isApproved: boolean;
  hasPermission: (code: string) => boolean;
  canAccessModule: (slug: string) => boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: { username: string; first_name: string; last_name: string; password: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_SELECT = "id,auth_user_id,username,first_name,last_name,email,role,status,rejection_reason";
const PROFILE_SELECT_LEGACY = "id,username,first_name,last_name,email,role,status,rejection_reason";

function getUserMetadata(user: User) {
  return {
    username: (user.user_metadata?.username as string | undefined)?.trim() || user.email?.split("@")[0] || user.id,
    first_name: (user.user_metadata?.first_name as string | undefined) ?? null,
    last_name: (user.user_metadata?.last_name as string | undefined) ?? null,
    email: user.email ?? null,
  };
}

export function usernameToEmail(username: string) {
  const norm = username.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]/g, "");
  return `${norm}@agent-tc.local`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [modules, setModules] = useState<Set<string>>(new Set());

  const loadProfile = useCallback(async (userOrUid: User | string) => {
    const uid = typeof userOrUid === "string" ? userOrUid : userOrUid.id;
    const fetchProfile = async (column: "id" | "auth_user_id") => {
      let { data, error } = await supabase
        .from("agent_tc_app_users")
        .select(PROFILE_SELECT)
        .eq(column, uid)
        .maybeSingle();

      if (error && error.message.toLowerCase().includes("auth_user_id")) {
        if (column === "auth_user_id") return null;
        ({ data, error } = await supabase
          .from("agent_tc_app_users")
          .select(PROFILE_SELECT_LEGACY)
          .eq(column, uid)
          .maybeSingle());
      }

      if (error) {
        console.warn(`[auth] Falha ao buscar perfil por ${column}:`, error.message);
        return null;
      }

      return (data as AppUserProfile | null) ?? null;
    };

    const ensureProfile = async () => {
      if (typeof userOrUid === "string") return null;

      const meta = getUserMetadata(userOrUid);
      const baseProfile = {
        id: uid,
        username: meta.username,
        first_name: meta.first_name,
        last_name: meta.last_name,
        email: meta.email,
      };
      const upsertProfile = (row: typeof baseProfile & { auth_user_id?: string }) =>
        supabase
          .from("agent_tc_app_users")
          .upsert(row, { onConflict: "id", ignoreDuplicates: true })
          .select(PROFILE_SELECT)
          .maybeSingle();

      let { data, error } = await upsertProfile({ ...baseProfile, auth_user_id: uid });

      if (error?.message?.toLowerCase().includes("auth_user_id")) {
        ({ data, error } = await upsertProfile(baseProfile));
      }

      if (error) {
        console.warn("[auth] Não foi possível criar/vincular perfil automaticamente:", error.message);
        return null;
      }

      return (data as AppUserProfile | null) ?? null;
    };

    // Suporta os dois modelos que já apareceram no banco:
    // 1) agent_tc_app_users.id === auth.users.id
    // 2) agent_tc_app_users.auth_user_id === auth.users.id e id é o ID interno do perfil
    const p = (await fetchProfile("id")) ?? (await fetchProfile("auth_user_id")) ?? (await ensureProfile());
    setProfile((p as AppUserProfile) ?? null);
    if (!p?.id) {
      setPermissions(new Set());
      setModules(new Set());
      return;
    }
    const permissionUserIds = Array.from(new Set([p.id, uid].filter(Boolean)));
    const [{ data: perms, error: permsError }, { data: mods, error: modsError }] = await Promise.all([
      supabase.from("agent_tc_user_permissions").select("permission_code").in("user_id", permissionUserIds),
      supabase.from("agent_tc_user_module_permissions").select("modulo_slug").in("user_id", permissionUserIds),
    ]);
    if (permsError) console.warn("[auth] Falha ao buscar permissões funcionais:", permsError.message);
    if (modsError) console.warn("[auth] Falha ao buscar permissões de módulos:", modsError.message);
    setPermissions(new Set((perms ?? []).map((r: any) => r.permission_code)));
    setModules(new Set((mods ?? []).map((r: any) => r.modulo_slug)));
  }, []);

  useEffect(() => {
    let mounted = true;

    // O INITIAL_SESSION do Supabase hidrata a sessão; manter apenas um caminho evita race condition.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      if (sess?.user) {
        // defer para evitar chamadas dentro do callback
        setTimeout(() => loadProfile(sess.user).finally(() => setLoading(false)), 0);
      } else {
        setProfile(null);
        setPermissions(new Set());
        setModules(new Set());
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Realtime: reagir a mudanças no próprio perfil e permissões do usuário logado.
  // Sem filtro rígido porque alguns bancos usam id=auth.uid(), outros auth_user_id=auth.uid().
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const profileId = profile?.id;
    const isOwnProfileRow = (row: any) => row?.id === uid || row?.auth_user_id === uid || (!!profileId && row?.id === profileId);
    const isOwnPermissionRow = (row: any) => row?.user_id === uid || (!!profileId && row?.user_id === profileId);
    const reload = () => loadProfile(uid);
    const channel = supabase
      .channel(`self-profile-${uid}-${profileId ?? "pending"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tc_app_users" }, (payload) => {
        if (isOwnProfileRow(payload.new) || isOwnProfileRow(payload.old)) reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tc_user_permissions" }, (payload) => {
        if (isOwnPermissionRow(payload.new) || isOwnPermissionRow(payload.old)) reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tc_user_module_permissions" }, (payload) => {
        if (isOwnPermissionRow(payload.new) || isOwnPermissionRow(payload.old)) reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.id, loadProfile]);

  const signIn: AuthContextValue["signIn"] = async (username, password) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async ({ username, first_name, last_name, password }) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username: username.trim(), first_name, last_name },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = profile?.role === "admin" && profile?.status === "approved";
    const isApproved = profile?.status === "approved";
    return {
      loading,
      session,
      user: session?.user ?? null,
      profile,
      permissions,
      modules,
      isAdmin,
      isApproved,
      hasPermission: (code) => isAdmin || permissions.has(code),
      canAccessModule: (slug) => isAdmin || modules.has(slug),
      signIn,
      signUp,
      signOut,
      refreshProfile,
    };
  }, [loading, session, profile, permissions, modules, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
