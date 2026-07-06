import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Permission } from "@/lib/permissions";

export const USERNAME_DOMAIN = "agenttc.dev";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
}

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  permissions: string[];
  isAdmin: boolean;
  hasPermission: (p: Permission | string) => boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, fullName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const loadProfile = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      setPermissions([]);
      return;
    }
    const [{ data: prof }, { data: perms }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_permissions").select("permission, allowed").eq("user_id", uid),
    ]);
    setProfile((prof as UserProfile | null) ?? null);
    setPermissions(((perms ?? []) as { permission: string; allowed: boolean }[])
      .filter((p) => p.allowed)
      .map((p) => p.permission));
  }, []);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      // defer supabase call
      setTimeout(() => { loadProfile(s?.user?.id ?? null); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadProfile(data.session?.user?.id ?? null).finally(() => {
        if (mounted) setLoading(false);
      });
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    await loadProfile(user?.id ?? null);
  }, [loadProfile, user?.id]);

  const signIn = useCallback(async (username: string, password: string) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (username: string, fullName: string, password: string) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username: username.trim().toLowerCase(), full_name: fullName.trim() },
      },
    });
    if (error) throw error;
    // Immediately sign out so pending users don't hold a session
    await supabase.auth.signOut();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions([]);
  }, []);

  const isAdmin = profile?.role === "admin" && profile?.status === "approved";

  const hasPermission = useCallback(
    (p: Permission | string) => {
      if (isAdmin) return true;
      if (permissions.includes("admin_all")) return true;
      return permissions.includes(p);
    },
    [isAdmin, permissions],
  );

  return (
    <AuthContext.Provider
      value={{ loading, session, user, profile, permissions, isAdmin, hasPermission, signIn, signUp, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
