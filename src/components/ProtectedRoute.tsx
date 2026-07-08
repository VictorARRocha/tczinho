import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/PageLoading";

interface Props {
  children: React.ReactNode;
  requirePermission?: string;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requirePermission, requireAdmin }: Props) {
  const { loading, session, profile, isAdmin, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading message="Carregando sessão..." />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;

  if (!profile) return <PageLoading message="Carregando perfil..." />;

  if (profile.status !== "approved") {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/acesso-negado" replace />;
  }

  if (requirePermission && !hasPermission(requirePermission)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return <>{children}</>;
}
