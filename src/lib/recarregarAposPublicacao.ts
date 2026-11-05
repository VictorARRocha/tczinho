// Aba aberta durante uma publicacao pede arquivos da versao anterior, que nao existem mais
// ("Failed to fetch dynamically imported module"). Recarregar traz a versao nova.
const CHAVE = "agent_tc_recarregou_apos_publicacao";
const INTERVALO_MS = 30_000;

/** Recarrega uma vez; se ja recarregou ha pouco, deixa o erro aparecer (evita loop se o arquivo faltar de verdade). */
export function recarregarAposPublicacao(evento: Event, agora = Date.now(), recarregar = () => window.location.reload()): boolean {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CHAVE)) || 0;
  } catch {
    return false;
  }
  if (agora - ultima < INTERVALO_MS) return false;
  try {
    sessionStorage.setItem(CHAVE, String(agora));
  } catch {
    return false;
  }
  evento.preventDefault();
  recarregar();
  return true;
}
