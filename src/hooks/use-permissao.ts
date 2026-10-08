import { useAuth } from "@/contexts/AuthContext";
import { podeNoModulo, temPermissao, temTodosModulos, type Permissao } from "@/lib/permissoes";

/** A pessoa logada pode fazer esta acao? (admin pode tudo) */
export function usePermissao(permissao: Permissao): boolean {
  const { profile, isAdmin } = useAuth();
  return temPermissao(profile, isAdmin, permissao);
}

/** Modulos da pessoa: so ve e age (pedir rodagem, regravar) neles. */
export function useModulos(): { todos: boolean; pode: (slug: string | null | undefined) => boolean } {
  const { profile, isAdmin } = useAuth();
  return {
    todos: temTodosModulos(profile, isAdmin),
    pode: (slug) => podeNoModulo(profile, isAdmin, slug),
  };
}
