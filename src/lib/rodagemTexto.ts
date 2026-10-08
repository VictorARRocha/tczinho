// Textos curtos de uma rodagem para listas e menus (VM e versao legiveis).

/** "a08" -> "A08". */
export function formatarVm(vm: string | null | undefined): string {
  return (vm || "").trim().toUpperCase();
}

/**
 * Versao como as pessoas falam:
 *   PROXIMA1.26.10.0       -> Próxima 10.0
 *   CONTABIL_DERE          -> Contabil Dere
 *   FOLHA_SUSTENTACAO_2026 -> Folha Sustentacao 2026
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
    .join(" ");
}
