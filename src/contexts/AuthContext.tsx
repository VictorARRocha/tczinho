import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppUserStatus = "pending" | "approved" | "rejected" | "disabled";
export type AppUserRole = "user" | "admin";

export interface AppUserProfile {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: AppUserRole;
  status: AppUserStatus;
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

  const loadProfile = useCallback(async (uid: string) => {
    const [{ data: p }, { data: perms }, { data: mods }] = await Promise.all([
      supabase.from("agent_tc_app_users").select("id,username,first_name,last_name,email,role,status").eq("id", uid).maybeSingle(),
      supabase.from("agent_tc_user_permissions").select("permission_code").eq("user_id", uid),
      supabase.from("agent_tc_user_module_permissions").select("modulo_slug").eq("user_id", uid),
    ]);
    setProfile((p as AppUserProfile) ?? null);
    setPermissions(new Set((perms ?? []).map((r: any) => r.permission_code)));
    setModules(new Set((mods ?? []).map((r: any) => r.modulo_slug)));
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1) listener (evita deadlock)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      if (sess?.user) {
        // defer para evitar chamadas dentro do callback
        setTimeout(() => loadProfile(sess.user.id).finally(() => setLoading(false)), 0);
      } else {
        setProfile(null);
        setPermissions(new Set());
        setModules(new Set());
        setLoading(false);
      }
    });

    // 2) hidrata sessão existente
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

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
