// Textos curtos de uma rodagem para listas e menus (VM e versao legiveis).

/** "a08" -> "A08". */
export function formatarVm(vm: string | null | undefined): string {
  return (vm || "").trim().toUpperCase();
}

/**
 * Versao como as pessoas falam:
 *   PROXIMA1.26.10.0       -> Próxima 10.0
 *   CONTABIL_DERE          -> Contábil Dere
 *   FOLHA_SUSTENTACAO_2026 -> Folha Sustentação 2026
 *   8.05z / 19.4.3         -> 8.05z / 19.4.3 (numero fica como esta)
 */
export function formatarVersao(versao: string | null | undefined): string {
  const texto = (versao || "").trim();
  if (!texto) return "";
  const proxima = texto.match(/^PROXIMA\s*(?:(?:\d+\.\d+\.)?(\d+(?:\.\d+)*))?$/i);
  if (proxima) return proxima[1] ? `Próxima ${proxima[1]}` : "Próxima";
  if (/^[\d.]+[a-z]?$/i.test(texto)) return texto;
  return texto
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((parte) => (/[a-z]/i.test(parte) ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .map((parte) => ACENTOS[parte.toLowerCase()] ?? parte)
    .join(" ");
}

// Pastas e campos vem sem acento; na tela as palavras conhecidas voltam a ter.
const ACENTOS: Record<string, string> = {
  unico: "Único",
  contabil: "Contábil",
  sustentacao: "Sustentação",
  gestao: "Gestão",
  inovacao: "Inovação",
  proxima: "Próxima",
};

/** "Unico" -> "Único" (nome do sistema exibido no cabecalho). */
export function formatarSistema(sistema: string | null | undefined): string {
  const texto = (sistema || "").trim();
  return ACENTOS[texto.toLowerCase()] ?? texto;
}

/** Proxima primeiro (a mais nova antes), depois Pre-clientes, depois o resto em ordem alfabetica. */
function grupoVersao(v: string): number {
  if (/^pr[oó]xima/i.test(v)) return 0;
  if (/^pr[eé][\s_-]?client/i.test(v)) return 1;
  return 2;
}

/** Ordem das versoes nos filtros (Reexecutar rodagens). */
export function ordenarVersoes(versoes: string[]): string[] {
  return [...versoes].sort((a, b) => {
    const ga = grupoVersao(a), gb = grupoVersao(b);
    if (ga !== gb) return ga - gb;
    const cmp = a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
    return ga === 0 ? -cmp : cmp;
  });
}
