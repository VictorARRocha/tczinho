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

// ---------------------------------------------------------------- modulos
// Alem da permissao, pedir/cancelar rodagem e regravar so valem nos modulos da pessoa (a API confere).
// Ver rodagens continua livre. ["*"] = todos os modulos (padrao de quem ja existia).

export const TODOS_MODULOS = "*";

/** Modulos na ordem oficial, com os codigos dos casos de teste (o numero antes do primeiro ponto). */
export const MODULOS_ACESSO: { slug: string; nome: string; codigos: string[] }[] = [
  { slug: "folha", nome: "Folha", codigos: ["1"] },
  { slug: "fiscal", nome: "Fiscal", codigos: ["2"] },
  { slug: "contabil", nome: "Contábil", codigos: ["3", "4", "7"] },
  { slug: "gestao", nome: "Gestão", codigos: ["9"] },
  { slug: "financeiro", nome: "Financeiro", codigos: ["5"] },
  { slug: "geral", nome: "Geral", codigos: ["6"] },
  { slug: "suprema", nome: "Suprema", codigos: ["16"] },
  { slug: "practice", nome: "Practice", codigos: ["19"] },
];

export function nomeModulo(slug: string): string {
  return MODULOS_ACESSO.find((m) => m.slug === slug)?.nome || slug;
}

/** Admin, "todos os modulos" ou perfil sem a informacao (API anterior aos modulos): sem restricao. */
export function temTodosModulos(profile: Pick<AppUserProfile, "modules"> | null | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const lista = profile?.modules;
  return !Array.isArray(lista) || lista.includes(TODOS_MODULOS);
}

export function podeNoModulo(
  profile: Pick<AppUserProfile, "modules"> | null | undefined,
  isAdmin: boolean,
  slug: string | null | undefined,
): boolean {
  if (temTodosModulos(profile, isAdmin)) return true;
  return !!slug && (profile?.modules || []).includes(slug);
}

/** Modulos dos casos de um pedido de rodagem ("[2.1.3], [2.1.4]" -> fiscal). Rotinas [0.x] nao contam. */
export function modulosDosCasos(casos: string | null | undefined): string[] {
  const slugs: string[] = [];
  for (const grupo of (casos || "").matchAll(/\[([^[\]]*)\]/g)) {
    for (const item of grupo[1].split(",")) {
      const codigo = item.trim().match(/^(\d+)/)?.[1];
      if (!codigo) continue;
      const modulo = MODULOS_ACESSO.find((m) => m.codigos.includes(String(Number(codigo))));
      if (modulo && !slugs.includes(modulo.slug)) slugs.push(modulo.slug);
    }
  }
  return slugs;
}

export const SEM_MODULO = "Você não tem acesso a este módulo. Peça a um administrador.";
