// Permissoes por usuario. Ver rodagens: todos. As acoes abaixo exigem a permissao; o admin pode tudo.
// A API confere de novo em cada acao: a tela so evita oferecer o que a pessoa nao pode fazer.
import type { AppUserProfile } from "@/services/authApi";

export type Permissao = "rodagem" | "merge" | "regravar";

export const PERMISSOES: { id: Permissao; label: string; descricao: string }[] = [
  { id: "rodagem", label: "Solicitar rodagem", descricao: "Pedir e cancelar rodagens no Jenkins (completa e reexecução) e salvar pré-definições." },
  { id: "merge", label: "Fazer merge", descricao: "Fazer merge entre branches do TC." },
  { id: "regravar", label: "Regravar arquivos", descricao: "Regravar no SVN os arquivos base das diferenças esperadas." },
];

export const SEM_PERMISSAO: Record<Permissao, string> = {
  rodagem: "Você não tem permissão para solicitar rodagens. Peça a um administrador.",
  merge: "Você não tem permissão para fazer merge. Peça a um administrador.",
  regravar: "Você não tem permissão para regravar arquivos. Peça a um administrador.",
};

/** O admin pode tudo; os outros, so o que estiver na lista. */
export function temPermissao(
  profile: Pick<AppUserProfile, "permissions"> | null | undefined,
  isAdmin: boolean,
  permissao: Permissao,
): boolean {
  if (isAdmin) return true;
  return Array.isArray(profile?.permissions) && profile.permissions.includes(permissao);
}
