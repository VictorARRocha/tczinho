import { useAuth } from "@/contexts/AuthContext";
import { temPermissao, type Permissao } from "@/lib/permissoes";

/** A pessoa logada pode fazer esta acao? (admin pode tudo) */
export function usePermissao(permissao: Permissao): boolean {
  const { profile, isAdmin } = useAuth();
  return temPermissao(profile, isAdmin, permissao);
}
