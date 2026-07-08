import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/PageLoading";

interface Props {
  children: React.ReactNode;
  requirePermission?: string;
  requireAdmin?: boolean;
  /** Se true, valida canAccessModule(slug) contra o parâmetro :slug da rota. */
  requireModuleFromParam?: boolean;
}

export function ProtectedRoute({ children, requirePermission, requireAdmin, requireModuleFromParam }: Props) {
  const { loading, session, profile, isAdmin, hasPermission, canAccessModule } = useAuth();
  const location = useLocation();
  const params = useParams();

  if (loading) return <PageLoading message="Carregando sessão..." />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;

  // Sessão existe mas o perfil não pôde ser carregado (RLS bloqueando ou linha inexistente)
  if (!profile) return <Navigate to="/aguardando-aprovacao" replace />;

  // Qualquer status diferente de approved manda para a tela de status (que exibe pending/rejected/disabled)
  if (profile.status !== "approved") {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/acesso-negado" replace />;
  }

  if (requirePermission && !hasPermission(requirePermission)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  if (requireModuleFromParam) {
    const slug = params.slug ?? "";
    if (slug && !canAccessModule(slug)) {
      return <Navigate to="/acesso-negado" replace />;
    }
  }

  return <>{children}</>;
}
