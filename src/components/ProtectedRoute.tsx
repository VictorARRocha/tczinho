import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/PageLoading";
import type { Permission } from "@/lib/permissions";

interface Props {
  children: ReactNode;
  permission?: Permission | Permission[];
}

export function ProtectedRoute({ children, permission }: Props) {
  const { loading, user, profile, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading message="Verificando sessão..." />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile || profile.status !== "approved") {
    return <Navigate to="/pendente" replace />;
  }

  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    const ok = list.some((p) => hasPermission(p));
    if (!ok) return <Navigate to="/acesso-negado" replace />;
  }

  return <>{children}</>;
}
