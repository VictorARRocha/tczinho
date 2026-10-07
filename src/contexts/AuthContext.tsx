import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  SESSION_EXPIRED_EVENT,
  authApi,
  clearAuthToken,
  getAuthToken,
  normalizeUsername,
  setAuthToken,
} from "@/services/authApi";
import type { AppUserProfile, AppUserRole, AppUserStatus, LocalAuthError, LocalAuthSession } from "@/services/authApi";

export type { AppUserProfile, AppUserRole, AppUserStatus };

export interface AppSession {
  access_token: string;
  token: string;
  session?: LocalAuthSession;
  user: AppUserProfile;
}

export interface AppAuthUser {
  id: string;
  email: string | null;
  username: string;
  user_metadata: {
    username: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface AuthContextValue {
  loading: boolean;
  session: AppSession | null;
  user: AppAuthUser | null;
  profile: AppUserProfile | null;
  isAdmin: boolean;
  isApproved: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: { username: string; first_name: string; last_name: string; password: string; modules?: string[] }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function profileToUser(profile: AppUserProfile): AppAuthUser {
  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    user_metadata: {
      username: profile.username,
      first_name: profile.first_name,
      last_name: profile.last_name,
    },
  };
}

function buildSession(token: string, user: AppUserProfile, session?: LocalAuthSession): AppSession {
  return {
    access_token: token,
    token,
    session,
    user,
  };
}

function authMessage(error: unknown): string {
  const err = error as LocalAuthError;
  return err?.message || "Falha ao autenticar.";
}

export function usernameToEmail(username: string) {
  return `${normalizeUsername(username)}@agent-tc.local`;
}

export { normalizeUsername };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);

  const applySession = useCallback((token: string, user: AppUserProfile, localSession?: LocalAuthSession) => {
    setAuthToken(token);
    setSession(buildSession(token, user, localSession));
    setProfile(user);
  }, []);

  const clearSession = useCallback(() => {
    clearAuthToken();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      clearSession();
      return;
    }

    try {
      const { user } = await authApi.me();
      setSession((current) => buildSession(token, user, current?.session));
      setProfile(user);
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    let mounted = true;

    async function loadStoredSession() {
      const token = getAuthToken();
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const { user } = await authApi.me();
        if (!mounted) return;
        setSession(buildSession(token, user));
        setProfile(user);
      } catch {
        if (mounted) clearSession();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadStoredSession();
    return () => {
      mounted = false;
    };
  }, [clearSession]);

  // Ao voltar para a aba, rele o perfil (permissoes podem ter mudado). Falha aqui nao derruba a sessao:
  // um 401 de verdade ja e tratado pelo aviso de sessao expirada.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !getAuthToken()) return;
      authApi.me().then(({ user }) => setProfile(user), () => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Uma chamada de dados recebeu 401: limpa a sessao para o ProtectedRoute levar ao login.
  useEffect(() => {
    const onExpired = () => {
      setSession(null);
      setProfile(null);
      toast.error("Sessão expirada", { description: "Entre novamente para continuar." });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (username, password) => {
    try {
      const result = await authApi.login(username, password);
      applySession(result.token, result.user, result.session);
      return { error: null };
    } catch (error) {
      clearSession();
      return { error: authMessage(error) };
    }
  }, [applySession, clearSession]);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ username, first_name, last_name, password, modules }) => {
    try {
      const normalizedUsername = normalizeUsername(username);
      await authApi.register({ username: normalizedUsername, first_name, last_name, password, modules });

      try {
        const result = await authApi.login(normalizedUsername, password);
        applySession(result.token, result.user, result.session);
      } catch (error) {
        const err = error as LocalAuthError;
        if (err?.code !== "user_not_approved" && err?.status !== 403) {
          throw error;
        }
      }

      return { error: null };
    } catch (error) {
      return { error: authMessage(error) };
    }
  }, [applySession]);

  const signOut = useCallback(async () => {
    try {
      if (getAuthToken()) await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = profile?.role === "admin" && profile?.status === "approved";
    const isApproved = profile?.status === "approved";
    return {
      loading,
      session,
      user: profile ? profileToUser(profile) : null,
      profile,
      isAdmin,
      isApproved,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    };
  }, [loading, session, profile, signIn, signUp, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
